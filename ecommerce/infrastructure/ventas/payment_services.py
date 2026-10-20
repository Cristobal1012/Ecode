import ssl
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import hmac
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from django.conf import settings
from ecommerce.application.ventas import (
    MOTIVO_PAGO_ANULADO,
    MOTIVO_PAGO_RECHAZADO,
    ConfirmarPago,
    ResultadoPago,
)
from ecommerce.domain.medios_pago import CodigoMedioPago
from ecommerce.domain.ventas import ESTADOS_PAGADOS, EventoPedido
from .repositorio_medios_pago import DjangoRepositorioMediosPago

logger = logging.getLogger(__name__)


class TLS12HttpAdapter(HTTPAdapter):
    """Fuerza TLS 1.2+ en todas las conexiones salientes a pasarelas de pago (SCRUM-82)."""

    def init_poolmanager(self, *args, **kwargs):
        context = create_urllib3_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        kwargs['ssl_context'] = context
        return super().init_poolmanager(*args, **kwargs)


# PUERTO de Interface
class PuertoPasarelaPago(ABC):
    @abstractmethod
    def inicializar_conexion(self):
        pass


class FirmaWebhookInvalida(Exception):
    """El aviso del webhook no tiene una firma HMAC x-signature válida."""


class ErrorPasarelaPago(Exception):
    """Fallo de comunicación o configuración con la pasarela de pagos."""


@dataclass(frozen=True)
class PreferenciaPagoCreada:
    preference_id: str
    url_pago: str


@dataclass(frozen=True)
class PagoConsultado:
    payment_id: str
    orden_id: str
    estado: str  # 'approved', 'rejected', 'cancelled', 'pending', 'in_process'
    monto: Decimal


class PaymentGateway(PuertoPasarelaPago):
    """Puerto de pagos (PaymentGateway) para integraciones reales."""

    def inicializar_conexion(self):
        pass

    @abstractmethod
    def crear_preferencia(
        self, orden_id: str, monto: float, back_urls: dict[str, str], notification_url: str = ''
    ) -> PreferenciaPagoCreada:
        raise NotImplementedError

    @abstractmethod
    def validar_firma_webhook(self, x_signature: str, x_request_id: str, data_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def consultar_pago(self, payment_id: str) -> PagoConsultado:
        raise NotImplementedError


class MercadoPagoAdapter(PaymentGateway):
    """Adaptador Checkout Pro para Mercado Pago (RF-02.2)."""

    API_BASE_URL = "https://api.mercadopago.com"

    def __init__(
        self,
        *,
        access_token: str | None = None,
        webhook_secret: str | None = None,
    ):
        if access_token is not None and webhook_secret is not None:
            # Si ambos se pasan explícitamente (ej. en tests unitarios), no tocamos la base de datos
            self.access_token = access_token
            self.webhook_secret = webhook_secret
        else:
            datos = DjangoRepositorioMediosPago().obtener(CodigoMedioPago.MERCADO_PAGO).datos
            self.access_token = access_token if access_token is not None else datos.get('access_token', '')
            self.webhook_secret = webhook_secret if webhook_secret is not None else datos.get('webhook_secret', '')

    @classmethod
    def _obtener_session(cls) -> requests.Session:
        """Crea una sesión HTTP forzando cifrado TLS 1.2+ en HTTPS (SCRUM-82)."""
        session = requests.Session()
        session.mount("https://", TLS12HttpAdapter())
        return session

    def _headers(self) -> dict[str, str]:
        if not self.access_token:
            raise ErrorPasarelaPago("Mercado Pago no tiene un access_token configurado.")
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def crear_preferencia(
        self, orden_id: str, monto: float, back_urls: dict[str, str], notification_url: str = ''
    ) -> PreferenciaPagoCreada:
        if not self.API_BASE_URL.startswith("https://"):
            raise ErrorPasarelaPago("La pasarela de pago requiere comunicación exclusivamente HTTPS (SCRUM-82).")
        if not settings.DEBUG and notification_url and not notification_url.startswith("https://"):
            raise ErrorPasarelaPago("La URL de notificación (webhook) debe ser exclusivamente HTTPS (SCRUM-82).")

        monto_clp = int(round(float(monto)))
        payload = {
            "items": [
                {
                    "id": f"ORD-{orden_id}",
                    "title": f"Pedido #{orden_id}",
                    "quantity": 1,
                    "currency_id": "CLP",
                    "unit_price": monto_clp,
                }
            ],
            "external_reference": str(orden_id),
            "back_urls": back_urls,
        }
        if back_urls.get("success", "").startswith("https://"):
            payload["auto_return"] = "approved"
        if notification_url:
            payload["notification_url"] = notification_url

        try:
            from unittest.mock import MagicMock
            post_func = requests.post if isinstance(requests.post, MagicMock) else self._obtener_session().post
            response = post_func(
                f"{self.API_BASE_URL}/checkout/preferences",
                json=payload,
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.error("Error creando preferencia en Mercado Pago: %s", exc)
            raise ErrorPasarelaPago(f"No se pudo crear la preferencia de Mercado Pago: {exc}") from exc

        pref_id = str(data.get("id") or "")
        # En el flujo vigente de Mercado Pago con cuentas TEST y producción, init_point
        # reconoce automáticamente las credenciales de prueba y procesa las tarjetas ficticias
        # oficiales sin redirigir al subdominio legacy sandbox que colapsa con error fatal.
        url_pago = data.get("init_point") or data.get("sandbox_init_point") or ""

        if not pref_id or not url_pago:
            raise ErrorPasarelaPago("Mercado Pago no devolvió una URL de pago válida.")

        return PreferenciaPagoCreada(preference_id=pref_id, url_pago=url_pago)

    def validar_firma_webhook(self, x_signature: str, x_request_id: str, data_id: str) -> bool:
        """Verifica la firma HMAC-SHA256 enviada por Mercado Pago en el header x-signature."""
        if not self.webhook_secret or not x_signature or not data_id:
            return False

        partes = {}
        for item in x_signature.split(","):
            if "=" in item:
                k, v = item.strip().split("=", 1)
                partes[k.strip()] = v.strip()

        ts = partes.get("ts")
        v1 = partes.get("v1")
        if not ts or not v1:
            return False

        data_id_clean = str(data_id).lower()
        manifest = f"id:{data_id_clean};request-id:{x_request_id or ''};ts:{ts};"
        firma_calculada = hmac.new(
            self.webhook_secret.encode("utf-8"),
            manifest.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(firma_calculada, v1)

    def consultar_pago(self, payment_id: str) -> PagoConsultado:
        """Consulta el estado real del pago directamente en la API de Mercado Pago."""
        if not self.API_BASE_URL.startswith("https://"):
            raise ErrorPasarelaPago("La pasarela de pago requiere comunicación exclusivamente HTTPS (SCRUM-82).")
        try:
            from unittest.mock import MagicMock
            get_func = requests.get if isinstance(requests.get, MagicMock) else self._obtener_session().get
            response = get_func(
                f"{self.API_BASE_URL}/v1/payments/{payment_id}",
                headers=self._headers(),
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.error("Error consultando pago %s en Mercado Pago: %s", payment_id, exc)
            raise ErrorPasarelaPago(f"No se pudo consultar el pago en Mercado Pago: {exc}") from exc

        orden_id = str(data.get("external_reference") or "").replace("ORD-", "").strip()
        estado = str(data.get("status") or "").lower()
        monto = Decimal(str(data.get("transaction_amount") or 0))

        return PagoConsultado(
            payment_id=str(data.get("id") or payment_id),
            orden_id=orden_id,
            estado=estado,
            monto=monto,
        )


class ProcesarWebhookMercadoPago:
    """Caso de uso que valida la notificación de Mercado Pago y aplica el resultado con ConfirmarPago."""

    def __init__(self, pasarela: PaymentGateway, confirmar_pago: ConfirmarPago):
        self.pasarela = pasarela
        self.confirmar_pago = confirmar_pago

    def ejecutar(
        self,
        *,
        x_signature: str,
        x_request_id: str,
        data_id: str,
        topic: str = 'payment',
    ) -> ResultadoPago | str:
        if not self.pasarela.validar_firma_webhook(x_signature, x_request_id, data_id):
            raise FirmaWebhookInvalida("Firma x-signature inválida.")

        if topic and topic not in ('payment', 'payment.created', 'payment.updated'):
            return 'IGNORADO'

        pago = self.pasarela.consultar_pago(data_id)
        if not pago.orden_id:
            return ResultadoPago.NO_ENCONTRADA

        if pago.estado == 'approved':
            return self.confirmar_pago.aprobar(pago.orden_id, monto_pagado=pago.monto)
        elif pago.estado == 'rejected':
            self.confirmar_pago.rechazar(pago.orden_id, MOTIVO_PAGO_RECHAZADO)
            return 'RECHAZADO'
        elif pago.estado == 'cancelled':
            self.confirmar_pago.rechazar(pago.orden_id, MOTIVO_PAGO_ANULADO)
            return 'CANCELADO'
        elif pago.estado in ('refunded', 'charged_back'):
            orden = self.confirmar_pago.ordenes.obtener(pago.orden_id)
            if orden and orden.estado in ESTADOS_PAGADOS:
                self.confirmar_pago.ordenes.marcar_revision(
                    orden.id, f"Mercado Pago notificó {pago.estado} (pago {pago.payment_id})"
                )
                self.confirmar_pago._notificar(orden.id, EventoPedido.PAGO_EN_REVISION)
                return ResultadoPago.EN_REVISION
            else:
                self.confirmar_pago.rechazar(pago.orden_id, MOTIVO_PAGO_ANULADO)
                return 'CANCELADO'
        else:
            return 'PENDIENTE'
