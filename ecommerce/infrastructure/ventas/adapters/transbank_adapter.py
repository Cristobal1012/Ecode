import os
import logging
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.options import WebpayOptions
from transbank.common.integration_type import IntegrationType

logger = logging.getLogger(__name__)

class TransbankWebpayAdapter:
    """
    Adaptador para manejar pagos mediante Transbank Webpay Plus.
    """
    @classmethod
    def _obtener_instancia(cls) -> Transaction:
        entorno = os.getenv("TRANSBANK_ENVIRONMENT", "INTEGRACION").upper()
        
        if entorno == "PRODUCCION":
            commerce_code = os.getenv("TRANSBANK_WEBPAY_COMMERCE_CODE", "")
            api_key = os.getenv("TRANSBANK_WEBPAY_API_KEY", "")
            
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