from decimal import Decimal
import hashlib
import hmac
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from ecommerce.application.ventas import (
    ConfirmarPago,
    InventarioVariantes,
    NotificadorPedidos,
    RepositorioOrdenes,
    ResultadoPago,
)
from ecommerce.domain.logistica import EnvioSolicitado
from ecommerce.domain.ventas import EstadoPedido, EventoPedido, ItemSolicitado, OrdenRegistrada
from ecommerce.infrastructure.ventas.payment_services import (
    ErrorPasarelaPago,
    FirmaWebhookInvalida,
    MercadoPagoAdapter,
    PagoConsultado,
    PaymentGateway,
    PreferenciaPagoCreada,
    ProcesarWebhookMercadoPago,
)


def generar_firma_hmac(secret: str, data_id: str, request_id: str, ts: str = "1700000000") -> str:
    manifest = f"id:{str(data_id).lower()};request-id:{request_id};ts:{ts};"
    v1 = hmac.new(secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"ts={ts},v1={v1}"


class FakePaymentGateway(PaymentGateway):
    def __init__(self, secret: str = "mi_secreto_webhook", pago: PagoConsultado | None = None):
        self.secret = secret
        self.pago = pago
        self.adapter_validador = MercadoPagoAdapter(access_token="TEST-TOKEN", webhook_secret=secret)

    def crear_preferencia(self, orden_id: str, monto: float, back_urls: dict[str, str], notification_url: str = ''):
        return PreferenciaPagoCreada(
            preference_id=f"PREF-{orden_id}",
            url_pago=f"https://www.mercadopago.cl/checkout/v1/redirect?pref_id=PREF-{orden_id}",
        )

    def validar_firma_webhook(self, x_signature: str, x_request_id: str, data_id: str) -> bool:
        return self.adapter_validador.validar_firma_webhook(x_signature, x_request_id, data_id)

    def consultar_pago(self, payment_id: str) -> PagoConsultado:
        return self.pago


class FakeRepositorioOrdenes(RepositorioOrdenes):
    def __init__(self, orden: OrdenRegistrada):
        self.orden = orden
        self.motivo_cancelacion = ""
        self.motivo_revision = ""

    def obtener(self, orden_id) -> OrdenRegistrada | None:
        if str(self.orden.id) != str(orden_id):
            return None
        return self.orden

    def cambiar_estado(self, orden_id, desde: EstadoPedido, hacia: EstadoPedido,
                       motivo_cancelacion: str = '', motivo_revision: str = '') -> bool:
        if str(self.orden.id) != str(orden_id) or self.orden.estado != desde:
            return False
        self.motivo_cancelacion = motivo_cancelacion
        self.motivo_revision = motivo_revision
        self.orden = OrdenRegistrada(
            id=self.orden.id,
            estado=hacia,
            items=self.orden.items,
            stock_descontado=self.orden.stock_descontado,
            requiere_revision=bool(motivo_revision),
            total_final=self.orden.total_final,
        )
        return True

    def registrar_stock_descontado(self, orden_id, descontado: bool = True) -> None:
        self.orden = OrdenRegistrada(
            id=self.orden.id,
            estado=self.orden.estado,
            items=self.orden.items,
            stock_descontado=descontado,
            requiere_revision=self.orden.requiere_revision,
            total_final=self.orden.total_final,
        )

    def completar_pago(self, orden_id) -> None:
        self.motivo_revision = ""
        self.orden = OrdenRegistrada(
            id=self.orden.id,
            estado=self.orden.estado,
            items=self.orden.items,
            stock_descontado=True,
            requiere_revision=False,
            total_final=self.orden.total_final,
        )

    def marcar_revision(self, orden_id, motivo: str) -> None:
        self.motivo_revision = motivo
        self.orden = OrdenRegistrada(
            id=self.orden.id,
            estado=self.orden.estado,
            items=self.orden.items,
            stock_descontado=self.orden.stock_descontado,
            requiere_revision=True,
            total_final=self.orden.total_final,
        )

    def resolver_revision(self, orden_id) -> bool:
        return True

    def obtener_envio(self, orden_id) -> EnvioSolicitado | None:
        return None

    def registrar_orden_transporte(self, orden_id, numero_ot: str = '', error: str = '') -> None:
        pass

    def pendientes_de_pago(self, metodo_pago: str, creadas_antes_de, sin_recordatorio: bool = False) -> list:
        return []

    def marcar_recordatorio_pago(self, orden_id) -> bool:
        return False


class FakeInventario(InventarioVariantes):
    def __init__(self, stock_inicial: int = 10):
        self.stock = stock_inicial
        self.descuentos = 0

    def descontar(self, producto_id: str, sku: str, cantidad: int) -> bool:
        if self.stock < cantidad:
            return False
        self.stock -= cantidad
        self.descuentos += 1
        return True

    def reponer(self, producto_id: str, sku: str, cantidad: int) -> None:
        self.stock += cantidad


class FakeNotificador(NotificadorPedidos):
    def __init__(self):
        self.eventos: list[tuple[int, EventoPedido]] = []

    def notificar(self, orden_id, evento: EventoPedido) -> None:
        self.eventos.append((int(orden_id), evento))


class MercadoPagoWebhookTests(SimpleTestCase):
    def setUp(self):
        self.secret = "clave_secreta_test_123"
        self.request_id = "req-abc-123"
        self.payment_id = "99887766"
        self.firma_valida = generar_firma_hmac(self.secret, self.payment_id, self.request_id)

        self.orden_inicial = OrdenRegistrada(
            id=42,
            estado=EstadoPedido.PENDIENTE,
            items=(ItemSolicitado("prod_1", "SKU-1", 2),),
            total_final=Decimal("400000"),
        )
        self.repo_ordenes = FakeRepositorioOrdenes(self.orden_inicial)
        self.inventario = FakeInventario(stock_inicial=5)
        self.notificador = FakeNotificador()
        self.confirmar_pago = ConfirmarPago(
            self.repo_ordenes, self.inventario, orden_transporte=None, notificador=self.notificador
        )

    def test_pago_aprobado_pasa_a_pagado_descuenta_stock_y_envia_correo(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(resultado, ResultadoPago.PAGADO)
        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PAGADO)
        self.assertTrue(self.repo_ordenes.orden.stock_descontado)
        self.assertFalse(self.repo_ordenes.orden.requiere_revision)
        self.assertEqual(self.inventario.stock, 3)
        self.assertEqual(self.notificador.eventos, [(42, EventoPedido.PAGO_APROBADO)])

    def test_pago_rechazado_cancela_orden_y_envia_correo(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="rejected", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(resultado, "RECHAZADO")
        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.CANCELADO)
        self.assertEqual(self.repo_ordenes.motivo_cancelacion, "Pago rechazado")
        self.assertEqual(self.inventario.stock, 5)
        self.assertEqual(self.notificador.eventos, [(42, EventoPedido.PAGO_RECHAZADO)])

    def test_pago_pendiente_deja_orden_en_pendiente_sin_descontar_stock(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="in_process", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(resultado, "PENDIENTE")
        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)
        self.assertEqual(self.inventario.stock, 5)
        self.assertEqual(self.notificador.eventos, [])

    def test_aviso_repetido_es_idempotente_no_descuenta_dos_veces_ni_reenvia_correo(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        primero = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )
        segundo = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(primero, ResultadoPago.PAGADO)
        self.assertEqual(segundo, ResultadoPago.REPETIDO)
        self.assertEqual(self.inventario.descuentos, 1)
        self.assertEqual(self.inventario.stock, 3)
        self.assertEqual(len(self.notificador.eventos), 1)

    def test_firma_invalida_lanza_error_y_no_cambia_la_orden(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        with self.assertRaises(FirmaWebhookInvalida):
            caso.ejecutar(
                x_signature="ts=1700000000,v1=firma_falsa_123",
                x_request_id=self.request_id,
                data_id=self.payment_id,
            )

        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)
        self.assertEqual(self.inventario.stock, 5)
        self.assertEqual(self.notificador.eventos, [])

    def test_monto_distinto_marca_orden_para_revision_del_admin(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("350000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(resultado, ResultadoPago.EN_REVISION)
        self.assertTrue(self.repo_ordenes.orden.requiere_revision)
        self.assertIn("no coincide", self.repo_ordenes.motivo_revision)
        self.assertEqual(self.notificador.eventos, [(42, EventoPedido.PAGO_EN_REVISION)])

    def test_vista_webhook_responde_401_con_firma_invalida(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago):
            respuesta = self.client.post(
                f"/api/ventas/mercadopago/webhook/?data.id={self.payment_id}&type=payment",
                data={"data": {"id": self.payment_id}, "type": "payment"},
                content_type="application/json",
                HTTP_X_SIGNATURE="ts=1700000000,v1=firma_invalida",
                HTTP_X_REQUEST_ID=self.request_id,
            )

        self.assertEqual(respuesta.status_code, 401)
        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)

    def test_webhook_refunded_marca_orden_para_revision_si_estaba_pagada(self):
        self.repo_ordenes.orden = OrdenRegistrada(
            id=42,
            estado=EstadoPedido.PAGADO,
            items=(ItemSolicitado("prod_1", "SKU-1", 2),),
            total_final=Decimal("400000"),
            stock_descontado=True,
        )
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="refunded", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id
        )

        self.assertEqual(resultado, ResultadoPago.EN_REVISION)
        self.assertTrue(self.repo_ordenes.orden.requiere_revision)
        self.assertIn("refunded", self.repo_ordenes.motivo_revision)
        self.assertEqual(self.notificador.eventos, [(42, EventoPedido.PAGO_EN_REVISION)])

    def test_webhook_topic_no_relevante_es_ignorado(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)
        caso = ProcesarWebhookMercadoPago(pasarela, self.confirmar_pago)

        resultado = caso.ejecutar(
            x_signature=self.firma_valida, x_request_id=self.request_id, data_id=self.payment_id,
            topic="merchant_order"
        )

        self.assertEqual(resultado, "IGNORADO")
        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)
        self.assertEqual(self.notificador.eventos, [])

    def test_vista_retorno_si_orden_ya_estaba_pagada_redirige_a_exitoso(self):
        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PAGADO
        mock_instancia.requiere_revision = False

        with patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get("/api/ventas/mercadopago/retorno/?orden=42&status=null")
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-exitoso?orden=42", respuesta.headers["Location"])

    def test_vista_retorno_seguridad_no_aprueba_si_consulta_falla(self):
        pasarela = MagicMock()
        pasarela.consultar_pago.side_effect = ErrorPasarelaPago("API timeout")

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                "/api/ventas/mercadopago/retorno/?orden=42&payment_id=FALSO&status=approved"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-cancelado?orden=42", respuesta.headers["Location"])
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)

    def test_vista_retorno_discrepancia_orden_id_redirige_a_cancelado(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="99", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                f"/api/ventas/mercadopago/retorno/?orden=42&payment_id={self.payment_id}&status=approved"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-cancelado", respuesta.headers["Location"])
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)

    def test_vista_retorno_aprueba_orden_con_pago_valido(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE
        mock_instancia.requiere_revision = False

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                f"/api/ventas/mercadopago/retorno/?orden=42&payment_id={self.payment_id}&status=approved"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-exitoso?orden=42", respuesta.headers["Location"])
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PAGADO)
            self.assertEqual(self.inventario.stock, 3)

    def test_vista_retorno_pago_pendiente_redirige_a_pedido_recibido(self):
        pago = PagoConsultado(payment_id=self.payment_id, orden_id="42", estado="in_process", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago)

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                f"/api/ventas/mercadopago/retorno/?orden=42&payment_id={self.payment_id}&status=in_process"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pedido-recibido?orden=42", respuesta.headers["Location"])
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)
            self.assertEqual(self.inventario.stock, 5)

    def test_verificar_pago_parametro_invalido_retorna_400(self):
        respuesta = self.client.get("/api/ventas/checkout/verificar-pago/?orden_id=abc")
        self.assertEqual(respuesta.status_code, 400)

    def test_verificar_pago_orden_no_existente_retorna_404(self):
        with patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            respuesta = self.client.get("/api/ventas/checkout/verificar-pago/?orden_id=99999")
            self.assertEqual(respuesta.status_code, 404)

    def test_verificar_pago_sincroniza_y_detecta_aprobado(self):
        mock_orden = MagicMock()
        mock_orden.id = 42
        mock_orden.estado = EstadoPedido.PAGADO
        mock_orden.metodo_pago = 'MERCADO_PAGO'
        mock_orden.requiere_revision = False

        with patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_orden
            respuesta = self.client.get("/api/ventas/checkout/verificar-pago/?orden_id=42")
            self.assertEqual(respuesta.status_code, 200)
            self.assertTrue(respuesta.json()["pagado"])
            self.assertEqual(respuesta.json()["orden_id"], 42)

    def test_admin_sincronizar_pagos_requiere_autenticacion(self):
        respuesta = self.client.post("/api/ventas/mercadopago/sincronizar/")
        self.assertIn(respuesta.status_code, (401, 403))

    def test_e01_retorno_status_cancelled_con_pago_aprobado_en_mp_consulta_y_aprueba(self):
        """E01: Si la URL trae status=cancelled pero payment_id=801 aprobado en MP, se consulta MP y se aprueba."""
        pago_aprobado = PagoConsultado(payment_id="801", orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = FakePaymentGateway(self.secret, pago_aprobado)

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE
        mock_instancia.requiere_revision = False

        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                "/api/ventas/mercadopago/retorno/?orden=42&payment_id=801&status=cancelled"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-exitoso?orden=42", respuesta.headers["Location"])
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PAGADO)
            self.assertEqual(self.inventario.stock, 3)

    def test_e01_retorno_anonimo_sin_payment_id_no_cancela_orden_en_bd(self):
        """E01: Parámetros de retorno sin payment_id no deben cancelar la orden pendiente en la BD."""
        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE
        mock_instancia.requiere_revision = False

        with patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_instancia

            respuesta = self.client.get(
                "/api/ventas/mercadopago/retorno/?orden=42&status=cancelled"
            )
            self.assertEqual(respuesta.status_code, 302)
            self.assertIn("/pago-cancelado?orden=42", respuesta.headers["Location"])
            # La orden en la base de datos NO debe haber sido cancelada
            self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)

    def test_e02_sincronizar_varios_intentos_prioriza_aprobado_sobre_rechazado(self):
        """E02: Si la búsqueda devuelve [802 aprobado, 801 rechazado], se concilia 802 y se descuenta stock."""
        pago_802 = PagoConsultado(payment_id="802", orden_id="42", estado="approved", monto=Decimal("400000"))
        pasarela = MagicMock()
        pasarela.access_token = "TEST-123"
        pasarela.API_BASE_URL = "https://api.mercadopago.com"
        pasarela._headers.return_value = {}
        pasarela.consultar_pago.return_value = pago_802

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [
                {"id": 802, "status": "approved", "date_created": "2026-10-16T12:01:00Z"},
                {"id": 801, "status": "rejected", "date_created": "2026-10-16T12:00:00Z"},
            ]
        }

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE
        mock_instancia.metodo_pago = "MERCADO_PAGO"

        from ecommerce.infrastructure.ventas.views import sincronizar_orden_con_mercadopago
        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("requests.get", return_value=mock_resp):
            sincronizar_orden_con_mercadopago(mock_instancia)

        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PAGADO)
        self.assertEqual(self.inventario.stock, 3)
        pasarela.consultar_pago.assert_called_with("802")

    def test_e02_sincronizar_intento_pendiente_mantiene_orden_pendiente(self):
        """E02: Si hay un intento pendiente y otro rechazado, la orden no se cancela y se mantiene pendiente."""
        pasarela = MagicMock()
        pasarela.access_token = "TEST-123"
        pasarela.API_BASE_URL = "https://api.mercadopago.com"
        pasarela._headers.return_value = {}

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [
                {"id": 803, "status": "in_process", "date_created": "2026-10-16T12:01:00Z"},
                {"id": 801, "status": "rejected", "date_created": "2026-10-16T12:00:00Z"},
            ]
        }

        mock_instancia = MagicMock()
        mock_instancia.id = 42
        mock_instancia.estado = EstadoPedido.PENDIENTE
        mock_instancia.metodo_pago = "MERCADO_PAGO"

        from ecommerce.infrastructure.ventas.views import sincronizar_orden_con_mercadopago
        with patch("ecommerce.infrastructure.ventas.views.pasarela_mercado_pago", return_value=pasarela), \
             patch("ecommerce.infrastructure.ventas.views.confirmar_pago", return_value=self.confirmar_pago), \
             patch("requests.get", return_value=mock_resp):
            sincronizar_orden_con_mercadopago(mock_instancia)

        self.assertEqual(self.repo_ordenes.orden.estado, EstadoPedido.PENDIENTE)
        self.assertEqual(self.inventario.stock, 5)

    def test_e03_verificar_pago_incluye_requiere_revision(self):
        """E03: verificar-pago devuelve la bandera requiere_revision adecuadamente."""
        mock_orden = MagicMock()
        mock_orden.id = 42
        mock_orden.estado = EstadoPedido.PAGADO
        mock_orden.metodo_pago = 'MERCADO_PAGO'
        mock_orden.requiere_revision = True

        with patch("ecommerce.infrastructure.ventas.views.OrdenCompra.objects.filter") as mock_filter:
            mock_filter.return_value.first.return_value = mock_orden
            respuesta = self.client.get("/api/ventas/checkout/verificar-pago/?orden_id=42")
            self.assertEqual(respuesta.status_code, 200)
            self.assertTrue(respuesta.json()["pagado"])
            self.assertTrue(respuesta.json()["requiere_revision"])

