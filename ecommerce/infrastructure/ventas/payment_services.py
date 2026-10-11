from abc import ABC, abstractmethod
import uuid
#PUERTO de Interface
class PuertoPasarelaPago(ABC):
    @abstractmethod
    def inicializar_conexion(self):
        pass

    """@abstractmethod
    def generar_link_pago(self, monto, orden_id):
        pass
    """
    #esto es solo para probar que funciona la interfaz.
class ServicioPagoLinkify(PuertoPasarelaPago):
    def inicializar_conexion(self):
        pass
    def generar_link_pago(self, monto, orden_id):
        token = uuid.uuid4().hex[:8]
        return f"https://linkify.cl/simulacion-pago?orden={orden_id}&token={token}&monto={monto}"

class ServicioPagoTransbank(PuertoPasarelaPago):
    def inicializar_conexion(self):
        pass

    def generar_link_pago(self, monto, orden_id):

        token = uuid.uuid4().hex[:8]
        return f"https://webpay3gint.transbank.cl/simulacion-pago?orden={orden_id}&token={token}"

#ADAPTADORES
class TransbankAdapter(PuertoPasarelaPago):
    def __init__(self, api_keys_pagos):
        credenciales = api_keys_pagos.get('TRANSBANK', {})
        self.commerce_code = credenciales.get('commerce_code')
        self.api_key_secret = credenciales.get('api_key_secret')
        self.ambiente = credenciales.get('ambiente', 'integracion')

    def inicializar_conexion(self):
        pass

    def generar_link_pago(self, monto, orden_id):
        return f"https://webpay.transbank.cl/pago?orden={orden_id}&monto={monto}"


class MercadoPagoAdapter(PuertoPasarelaPago):
    def __init__(self, api_keys_pagos):
        credenciales = api_keys_pagos.get('MERCADO_PAGO', {})
        self.access_token = credenciales.get('access_token')
        self.public_key = credenciales.get('public_key')

    def inicializar_conexion(self):
        pass

    def generar_link_pago(self, monto, orden_id):
        return f"https://mercadopago.cl/checkout?pref_id={orden_id}"


class PayPalAdapter(PuertoPasarelaPago):
    def __init__(self, api_keys_pagos):
        credenciales = api_keys_pagos.get('PAYPAL', {})
        self.client_id = credenciales.get('client_id')
        self.secret = credenciales.get('secret')
        self.modo = credenciales.get('modo', 'sandbox')

    def inicializar_conexion(self):
        pass

    def generar_link_pago(self, monto, orden_id):
        return f"https://paypal.com/checkout?token={orden_id}"


class LinkifyAdapter(PuertoPasarelaPago):
    def __init__(self, api_keys_pagos):
        credenciales = api_keys_pagos.get('LINKIFY', {})
        self.api_key = credenciales.get('api_key')
        self.webhook_secret = credenciales.get('webhook_secret')

    def inicializar_conexion(self):
        pass

    def generar_link_pago(self, monto, orden_id):
        return f"https://linkify.cl/transferencia?orden={orden_id}"


def generar_link_pago(metodo_pago, monto, orden_id, api_keys_pagos):
    """
    Fábrica que instancia el adaptador correcto según el método elegido por el cliente.
    """
    metodo = metodo_pago.upper() if metodo_pago else ""
    
    if metodo == 'LINKIFY':
        adaptador = ServicioPagoLinkify()
        return adaptador.generar_link_pago(monto, orden_id)
    elif metodo == 'TRANSBANK':
        adaptador = ServicioPagoTransbank()
        return adaptador.generar_link_pago(monto, orden_id)
    elif metodo == 'MERCADO_PAGO':
        adaptador = MercadoPagoAdapter(api_keys_pagos)
        return adaptador.generar_link_pago(monto, orden_id)
    elif metodo == 'PAYPAL':
        adaptador = PayPalAdapter(api_keys_pagos)
        return adaptador.generar_link_pago(monto, orden_id)
    else:
        token = uuid.uuid4().hex[:8]
        return f"https://mock-bank.com/pago?orden={orden_id}&token={token}"