import logging
import requests
from django.conf import settings
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.options import WebpayOptions
from transbank.common.integration_type import IntegrationType

from ecommerce.domain.medios_pago import AMBIENTE_PRODUCCION, CodigoMedioPago
from ..repositorio_medios_pago import DjangoRepositorioMediosPago
from ..payment_services import TLS12HttpAdapter

logger = logging.getLogger(__name__)

class TransbankWebpayAdapter:
    """
    Adaptador para manejar pagos mediante Transbank Webpay Plus forzando TLS 1.2+ (SCRUM-82).
    """
    _session_tls = None

    @classmethod
    def _obtener_session_tls(cls) -> requests.Session:
        if cls._session_tls is None:
            session = requests.Session()
            session.mount("https://", TLS12HttpAdapter())
            cls._session_tls = session
        return cls._session_tls

    @classmethod
    def _asegurar_tls12(cls):
        """Asegura que las llamadas salientes del SDK de Transbank usen TLS 1.2+ y HTTPS (SCRUM-82)."""
        import transbank.common.request_service as tb_req
        if not getattr(tb_req.RequestService, '_tls12_forzado', False):
            session = cls._obtener_session_tls()

            def safe_post(endpoint: str, request: str, options):
                host = tb_req.RequestService.host(options)
                full_url = f"{host}{endpoint}"
                if not full_url.startswith("https://"):
                    raise ValueError("Transbank exige comunicación exclusivamente por HTTPS (SCRUM-82).")
                response = session.post(
                    url=full_url,
                    data=request,
                    headers=tb_req.HeadersBuilder.build(options),
                    timeout=options.timeout,
                )
                return tb_req.RequestService.process_response(response)

            def safe_get(endpoint: str, options):
                host = tb_req.RequestService.host(options)
                full_url = f"{host}{endpoint}"
                if not full_url.startswith("https://"):
                    raise ValueError("Transbank exige comunicación exclusivamente por HTTPS (SCRUM-82).")
                response = session.get(
                    url=full_url,
                    headers=tb_req.HeadersBuilder.build(options),
                    timeout=options.timeout,
                )
                return tb_req.RequestService.process_response(response)

            tb_req.RequestService.post = staticmethod(safe_post)
            tb_req.RequestService.get = staticmethod(safe_get)
            tb_req.RequestService._tls12_forzado = True

    @classmethod
    def _obtener_instancia(cls) -> Transaction:
        cls._asegurar_tls12()
        # El ambiente y las credenciales los carga el admin en el panel, no el .env.
        # Se lee aunque Transbank esté deshabilitado: un pago ya iniciado debe poder confirmarse.
        datos = DjangoRepositorioMediosPago().obtener(CodigoMedioPago.TRANSBANK).datos

        if datos.get('ambiente') == AMBIENTE_PRODUCCION:
            commerce_code = datos.get('commerce_code', '')
            api_key = datos.get('api_key', '')
            if not commerce_code or not api_key:
                raise ValueError('Transbank está en producción sin código de comercio o API key.')

            # Usamos WebpayOptions para las versiones recientes del SDK
            opciones = WebpayOptions(commerce_code, api_key, IntegrationType.LIVE)
            return Transaction(options=opciones)
        else:
            # Usamos las llaves públicas explícitas para el entorno de pruebas
            codigo_integracion = "597055555532"
            api_key_integracion = "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C"
            
            opciones = WebpayOptions(codigo_integracion, api_key_integracion, IntegrationType.TEST)
            return Transaction(options=opciones)

    @classmethod
    def iniciar_transaccion(cls, orden_id: str, monto: float, return_url: str, session_id: str) -> dict:
        """
        Paso 1: Crear la transacción.
        Retorna el token y la URL a donde se debe enviar al usuario.
        """
        if not settings.DEBUG and not return_url.startswith("https://"):
            raise ValueError("La comunicación de retorno de pago debe realizarse exclusivamente a través de HTTPS (SCRUM-82).")
        try:
            tx = cls._obtener_instancia()
            buy_order = f"ORD-{orden_id}"
            
            # Webpay requiere que el amount sea un entero (sin decimales) en CLP
            monto_entero = int(round(monto))
            
            logger.info(f"Iniciando pago Transbank para orden {buy_order} por ${monto_entero}")
            
            respuesta = tx.create(
                buy_order=buy_order,
                session_id=str(session_id),
                amount=monto_entero,
                return_url=return_url
            )
            
            return {
                "exito": True,
                "token": respuesta['token'],
                "url_pago": respuesta['url']
            }
        except Exception as e:
            logger.error(f"Error creando transacción en Transbank: {str(e)}")
            return {"exito": False, "error": str(e)}

    @classmethod
    def confirmar_transaccion(cls, token: str) -> dict:
        """
        Paso 3: Confirmar la transacción utilizando el token recibido al retornar a nuestra web.
        """
        try:
            tx = cls._obtener_instancia()
            logger.info(f"Confirmando transacción Transbank con token {token}")
            
            respuesta = tx.commit(token)
            
            # validamos si fue aprobada. Transbank devuelve 'response_code' == 0 para pagos exitosos.
            aprobado = respuesta.get('response_code') == 0
            
            return {
                "exito": True,
                "aprobado": aprobado,
                "authorization_code": respuesta.get('authorization_code'),
                "response_code": respuesta.get('response_code'),
                "payment_type_code": respuesta.get('payment_type_code'),
                "amount": respuesta.get('amount'),
                "data_completa": respuesta
            }
        except Exception as e:
            logger.error(f"Error confirmando transacción en Transbank: {str(e)}")
            return {"exito": False, "error": str(e)}