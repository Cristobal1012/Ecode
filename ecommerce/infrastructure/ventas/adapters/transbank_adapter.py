import logging
from django.conf import settings
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.options import WebpayOptions
from transbank.common.integration_type import IntegrationType

from ecommerce.domain.medios_pago import AMBIENTE_PRODUCCION, CodigoMedioPago

from ..repositorio_medios_pago import DjangoRepositorioMediosPago

logger = logging.getLogger(__name__)

class TransbankWebpayAdapter:
    """
    Adaptador para manejar pagos mediante Transbank Webpay Plus.
    """
    @classmethod
    def _obtener_instancia(cls) -> Transaction:
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