"""Adaptador Chilexpress del puerto Courier (RF-02.3, RF-02.4), contra el sandbox de sus APIs.

Usa las llaves que carga el admin en el panel (Configuración > Envíos por courier), guardadas cifradas.
"""

import logging
import unicodedata
from decimal import Decimal, ROUND_HALF_UP

import requests

from ecommerce.application.couriers import Courier
from ecommerce.domain.logistica import (
    ESTADO_NO_DISPONIBLE, CampoCredencial, CotizacionEnvio, CourierNoDisponible, ErrorOrdenTransporte, SinCobertura,
    Sucursal, clave_comuna,
)

from ..models import ConfiguracionGlobal

logger = logging.getLogger(__name__)

URL_BASE = 'https://testservices.wschilexpress.com'
# RUT con el que se generan y se consultan las OT en el sandbox de Chilexpress (deben coincidir).
# Pendiente: en producción es el RUT de la tienda, junto con el TCC y el remitente.
RUT_MARKETPLACE = '96756430'
# Para órdenes creadas antes de guardar el paquete cotizado
PAQUETE_POR_DEFECTO = {'peso': '1', 'alto': 10, 'ancho': 10, 'largo': 10}

ESTADOS_ESTANDAR = {
    'ORIGEN': 'En origen',
    'TRANSITO': 'En tránsito',
    'REPARTO': 'En reparto',
    'ENTREGADO': 'Entregado',
}


class ChilexpressCourier(Courier):
    codigo = 'CHILEXPRESS'
    nombre = 'Chilexpress'
    con_sucursales = True
    ayuda = ('Se obtienen en el portal de desarrolladores de Chilexpress; si dejas vacías las de coberturas o '
             'envíos, se usa la del cotizador.')
    # Cada API de Chilexpress tiene su propia llave; sin la de coberturas o la de envíos se usa la del cotizador
    CAMPOS = (
        CampoCredencial('cotizador', 'API key del cotizador (Rating)', obligatorio=True),
        CampoCredencial('coberturas', 'API key de coberturas y sucursales (Georeference)'),
        CampoCredencial('envios', 'API key de envíos (Transport Orders y seguimiento)'),
    )

    # Caché en memoria del mapa nombre de comuna → código de cobertura: se arma con 16 consultas
    _CACHE_COBERTURAS = {}

    def __init__(self, credenciales):
        self.credenciales = credenciales

    @property
    def _llave_cotizador(self):
        return self.credenciales.valor('cotizador')

    @property
    def _llave_coberturas(self):
        return self.credenciales.valor('coberturas') or self._llave_cotizador

    @property
    def _llave_envios(self):
        return self.credenciales.valor('envios') or self._llave_cotizador

    @staticmethod
    def _headers(api_key):
        return {'Ocp-Apim-Subscription-Key': api_key, 'Content-Type': 'application/json'}

    def _obtener_catalogo_dinamico(self):
        """Consume la API de regiones y luego la de coberturas para armar el mapa del país."""
        if ChilexpressCourier._CACHE_COBERTURAS:
            return ChilexpressCourier._CACHE_COBERTURAS

        api_key = self._llave_coberturas
        if not api_key:
            logger.error('Faltan las credenciales de Chilexpress: se cargan en el panel (Configuración).')
            return {}

        headers = self._headers(api_key)
        nuevo_diccionario = {}
        try:
            resp_reg = requests.get(f'{URL_BASE}/georeference/api/v1.0/regions', headers=headers, timeout=6)
            if resp_reg.status_code == 200:
                regiones = resp_reg.json().get('regions', []) or resp_reg.json().get('data', {}).get('regions', [])
                for reg in regiones:
                    region_id = reg.get('regionId')
                    if not region_id:
                        continue
                    # type=1 trae solo comunas, sin sub-sectores
                    url_cob = f'{URL_BASE}/georeference/api/v1.0/coverage-areas?RegionCode={region_id}&type=1'
                    resp_cob = requests.get(url_cob, headers=headers, timeout=5)
                    if resp_cob.status_code == 200:
                        areas = (resp_cob.json().get('coverageAreas', [])
                                 or resp_cob.json().get('data', {}).get('coverageAreas', []))
                        for area in areas:
                            nombre = area.get('countyName', '').strip().upper()
                            codigo = area.get('countyCode', '').strip().upper()
                            if nombre and codigo:
                                nuevo_diccionario[nombre] = codigo

            if nuevo_diccionario:
                ChilexpressCourier._CACHE_COBERTURAS = nuevo_diccionario
                return nuevo_diccionario
            logger.error('No se pudo construir el diccionario dinámico. Revisa la API Key.')
            return {}
        except Exception as e:
            logger.error(f'Excepción armando catálogo Chilexpress: {str(e)}')
            return {}

    # ---------- Coberturas y comunas ----------

    @staticmethod
    def _codigo_comuna(catalogo, nombre):
        """El código de cobertura de una comuna sin distinguir tildes ni mayúsculas ('Ñuñoa' es NUNOA); None si no
        está."""
        por_clave = {clave_comuna(nombre_catalogo): codigo for nombre_catalogo, codigo in catalogo.items()}
        return por_clave.get(clave_comuna(nombre))

    def comunas(self):
        catalogo = self._obtener_catalogo_dinamico()
        if not catalogo:
            raise CourierNoDisponible('Servicio de coberturas no disponible en este momento.')
        return sorted(catalogo.keys())

    # ---------- Cotizador ----------

    def cotizar(self, origen, destino, paquete):
        catalogo = self._obtener_catalogo_dinamico()
        if not catalogo:
            raise CourierNoDisponible('Servicio de coberturas no disponible temporalmente')

        # Del nombre legible (ej. MAIPU) al código de cobertura de Chilexpress (MIPU)
        codigo_origen = self._codigo_comuna(catalogo, origen)
        if not codigo_origen:
            # Antes se cotizaba desde Santiago sin avisar: el comprador pagaba el envío desde otra comuna
            logger.error(f"La comuna de origen de la tienda ('{origen}') no está en la cobertura de Chilexpress.")
            raise CourierNoDisponible('La comuna de origen de la tienda no está en la cobertura de Chilexpress.')
        codigo_destino = self._codigo_comuna(catalogo, destino)
        if not codigo_destino:
            raise SinCobertura(f"La comuna '{destino}' no es válida o no tiene cobertura.")

        payload = {
            'originCountyCode': codigo_origen,
            'destinationCountyCode': codigo_destino,
            'package': {
                'weight': str(float(paquete.peso_kg)),
                'height': str(int(paquete.alto_cm)),
                'width': str(int(paquete.ancho_cm)),
                'length': str(int(paquete.largo_cm)),
            },
            'productType': 3,
            'contentType': 1,
            'declaredWorth': '0',
            'deliveryTime': 0,
            'customerCardNumber': '0',
        }

        try:
            respuesta = requests.post(f'{URL_BASE}/rating/api/v1.0/rates/business',
                                      headers=self._headers(self._llave_cotizador), json=payload, timeout=6)
            if respuesta.status_code != 200:
                raise CourierNoDisponible(f'Error del cotizador: {respuesta.text}')

            data = respuesta.json()
            servicios = data.get('data', {}).get('courierServiceOptions', []) or data.get('courierServiceOptions', [])
            if not servicios:
                raise CourierNoDisponible('No hay servicios disponibles para esta ruta')

            # El servicio Express o, si no está, el primero de la lista
            servicio = next((s for s in servicios if s.get('serviceDescription') == 'EXPRESS'), servicios[0])

            # Una tarifa ausente, no numérica o negativa no es confiable: nunca se cobra
            precio = Decimal(str(servicio.get('serviceValue')))
            if not precio.is_finite() or precio < 0:
                raise ValueError(f"Tarifa inválida: {servicio.get('serviceValue')}")

            return CotizacionEnvio(self.codigo, self.nombre, int(precio.quantize(Decimal('1'), rounding=ROUND_HALF_UP)),
                                   servicio.get('serviceDescription', 'No especificado'))
        except CourierNoDisponible:
            raise
        except Exception as e:
            logger.error(f'Error cotizando con Chilexpress: {str(e)}')
            raise CourierNoDisponible('Servicio de cotización no disponible temporalmente') from e

    # ---------- Sucursales ----------

    def sucursales(self, comuna):
        nombre_limpio = clave_comuna(comuna)
        if not nombre_limpio:
            raise SinCobertura('Debe especificar una comuna válida.')

        # Type=0: todas las oficinas de la comuna
        url = f'{URL_BASE}/georeference/api/v1.0/offices?Type=0&CountyName={nombre_limpio}'
        try:
            resp = requests.get(url, headers=self._headers(self._llave_coberturas), timeout=5)
        except Exception as e:
            logger.error(f'Error consultando sucursales de Chilexpress: {str(e)}')
            raise CourierNoDisponible('Servicio de sucursales no disponible temporalmente.') from e
        if resp.status_code != 200:
            raise CourierNoDisponible(f'Error de API Chilexpress (Código {resp.status_code})')
        return [
            Sucursal(codigo=office.get('officeCode'), nombre=office.get('officeName'),
                     direccion=f"{office.get('streetName', '')} {office.get('streetNumber', '')}".strip())
            for office in resp.json().get('offices', [])
        ]

    # ---------- Orden de transporte (OT) y etiqueta ----------

    def generar_orden_transporte(self, envio):
        # Chilexpress contacta al destinatario: no se le envía un teléfono inventado
        if not envio.telefono:
            raise ErrorOrdenTransporte('La orden no tiene teléfono del destinatario.')

        catalogo = self._obtener_catalogo_dinamico()
        if not catalogo:
            raise ErrorOrdenTransporte('Servicio de coberturas de Chilexpress no disponible.')

        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        comuna_origen = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
        codigo_destino = self._codigo_comuna(catalogo, envio.comuna)
        if not codigo_destino:
            raise ErrorOrdenTransporte(f'Chilexpress no tiene cobertura para la comuna {envio.comuna}.')
        codigo_origen = self._codigo_comuna(catalogo, comuna_origen)
        if not codigo_origen:
            raise ErrorOrdenTransporte(f'La comuna de origen de la tienda ({comuna_origen}) no está en la cobertura '
                                       'de Chilexpress: revísala en Configuración.')

        datos_envio = {
            'origen_codigo': codigo_origen,
            'destino_codigo': codigo_destino,
            'calle': envio.calle,
            'numero': envio.numero,
            'supplement': envio.complemento,
            # Retiro en una oficina de Chilexpress: se entrega ahí y no en la dirección
            'es_sucursal': bool(envio.codigo_sucursal),
            'sucursal_id': envio.codigo_sucursal,
            'nombre_destinatario': envio.destinatario,
            # Número nacional de 9 dígitos, sin el +56 (mismo largo que el valor que aceptó el sandbox)
            'telefono': envio.telefono.removeprefix('+56'),
            'email': envio.email,
            'referencia': f'ORD-{envio.orden_id}',
            'valor_declarado': envio.valor_declarado,
            **self._paquete(envio.paquete),
        }

        respuesta = self._solicitar_orden_transporte(datos_envio)
        if not respuesta.get('exito') or not respuesta.get('numero_ot'):
            raise ErrorOrdenTransporte(f"Chilexpress rechazó la orden de transporte: {respuesta.get('error', '')}")
        return respuesta['numero_ot']

    @staticmethod
    def _paquete(paquete):
        if paquete is None:
            return PAQUETE_POR_DEFECTO
        # Chilexpress pide el peso como texto y las medidas en centímetros enteros
        return {
            'peso': str(paquete.peso_kg),
            'alto': max(1, round(paquete.alto_cm)),
            'ancho': max(1, round(paquete.ancho_cm)),
            'largo': max(1, round(paquete.largo_cm)),
        }

    def _solicitar_orden_transporte(self, datos_envio: dict) -> dict:
        """Genera la OT con la API de transport-orders, con la estructura que pide su documentación."""
        payload = {
            'header': {
                'certificateNumber': 0,
                'customerCardNumber': '18578680',  # TCC de pruebas oficial
                'countyOfOriginCoverageCode': datos_envio.get('origen_codigo', 'PUDA'),
                'labelType': 2,  # 2 = imagen en binario + datos
                'marketplaceRut': RUT_MARKETPLACE,
                'sellerRut': 'DEFAULT',
            },
            'details': [{
                'addresses': [{
                    'addressId': 0,
                    'countyCoverageCode': datos_envio.get('destino_codigo', 'PROV'),
                    'streetName': datos_envio.get('calle', 'SIN CALLE'),
                    'streetNumber': str(datos_envio.get('numero', '0')),
                    'supplement': datos_envio.get('supplement', ''),
                    'addressType': 'DEST',
                    'deliveryOnCommercialOffice': datos_envio.get('es_sucursal', False),
                    'commercialOfficeId': str(datos_envio.get('sucursal_id', '')) if datos_envio.get('es_sucursal') else '',
                    'observation': 'DEFAULT',
                }, {
                    'addressId': 0,
                    'countyCoverageCode': datos_envio.get('origen_codigo', 'PUDA'),
                    'streetName': 'AVENIDA DE RETORNO',
                    'streetNumber': '120',
                    'supplement': 'Bodega',
                    'addressType': 'DEV',
                    'deliveryOnCommercialOffice': False,
                    'observation': 'DEFAULT',
                }],
                'contacts': [{
                    'name': datos_envio.get('nombre_destinatario', 'Cliente'),
                    'phoneNumber': datos_envio.get('telefono', '123456789'),
                    'mail': datos_envio.get('email', 'cliente@correo.cl'),
                    'contactType': 'D',
                }, {
                    'name': 'Remitente Tienda',
                    'phoneNumber': '999999999',
                    'mail': 'contacto@tu-tienda.cl',
                    'contactType': 'R',
                }],
                'packages': [{
                    'weight': str(datos_envio.get('peso', '1')),
                    'height': int(datos_envio.get('alto', 10)),
                    'width': int(datos_envio.get('ancho', 10)),
                    'length': int(datos_envio.get('largo', 10)),
                    'serviceDeliveryCode': 3,
                    'productCode': 3,
                    'deliveryReference': str(datos_envio.get('referencia', 'ORDEN-1')),
                    'groupReference': '',
                    'declaredValue': int(datos_envio.get('valor_declarado', 1000)),
                    'declaredContent': 1,
                }],
            }],
        }

        try:
            logger.info(f"Enviando solicitud de OT a Chilexpress para la referencia: {datos_envio.get('referencia')}")
            respuesta = requests.post(f'{URL_BASE}/transport-orders/api/v1.0/transport-orders',
                                      headers=self._headers(self._llave_envios), json=payload, timeout=10)
            if respuesta.status_code in [200, 201]:
                data = respuesta.json()
                detalle = data.get('data', {}).get('detail', [{}])[0]
                # Chilexpress devuelve la OT como decimal (712678903156.0); se guarda como entero en texto
                numero_ot = detalle.get('transportOrderNumber')
                if numero_ot is not None:
                    numero_ot = str(int(float(numero_ot)))
                return {'exito': True, 'numero_ot': numero_ot}
            logger.error(f'Error generando OT en Chilexpress: {respuesta.text}')
            return {'exito': False, 'error': respuesta.text}
        except Exception as e:
            logger.error(f'Excepción en generacion de OT Chilexpress: {str(e)}')
            return {'exito': False, 'error': str(e)}

    def etiqueta(self, numero_ot):
        if not self._llave_envios:
            raise CourierNoDisponible('Credenciales de Chilexpress no configuradas.')
        # labelType 2 = imagen en binario + datos
        payload = {'transportOrderNumber': int(float(numero_ot)), 'labelType': 2}
        try:
            response = requests.post(f'{URL_BASE}/transport-orders/api/v1.0/transport-orders-labels',
                                     json=payload, headers=self._headers(self._llave_envios), timeout=15)
            data = response.json()
        except Exception as e:
            raise CourierNoDisponible(f'Error de conexión con Chilexpress: {str(e)}') from e

        if response.status_code == 200 and data.get('statusCode') == 0:
            # El sandbox la entrega en data.label (una imagen JPEG); la generación de la OT, dentro de cada detalle
            cuerpo = data.get('data') or {}
            detalles = cuerpo.get('detail')
            primero = detalles[0] if isinstance(detalles, list) and detalles else {}
            etiqueta_base64 = ((cuerpo.get('label') or {}).get('labelData')
                               or (primero.get('label') or {}).get('labelData'))
            if etiqueta_base64:
                return etiqueta_base64
        raise CourierNoDisponible(data.get('statusDescription', 'No se pudo obtener la etiqueta.'))

    # ---------- Seguimiento (RF-02.4) ----------

    def consultar_estado(self, codigo_seguimiento):
        if not self._llave_envios:
            logger.error('Faltan las credenciales de Chilexpress: se cargan en el panel (Configuración).')
            return ESTADO_NO_DISPONIBLE
        try:
            # El RUT debe ser el mismo con que se generó la OT; la referencia es opcional
            payload = {'transportOrderNumber': int(codigo_seguimiento), 'rut': int(RUT_MARKETPLACE),
                       'showTrackingEvents': 0}
            respuesta = requests.post(f'{URL_BASE}/transport-orders/api/v1.0/tracking',
                                      headers=self._headers(self._llave_envios), json=payload, timeout=5)
            respuesta.raise_for_status()
            data = respuesta.json()
            if data.get('statusCode') != 0:
                raise ValueError(f"Chilexpress respondió {data.get('statusCode')}: {data.get('statusDescription')}")
            estado_api = str(((data.get('data') or {}).get('transportOrderData') or {}).get('status') or '').strip()
        except Exception as e:
            logger.error(f'Error consultando tracking: {str(e)}')
            return ESTADO_NO_DISPONIBLE

        estado = self._estado_estandar(estado_api)
        if estado is None:
            # Sin equivalencia no se inventa un avance: se informa el estado de Chilexpress tal cual
            logger.warning('Estado de Chilexpress sin equivalencia en la línea de tiempo: %r', estado_api)
            return estado_api.capitalize() or ESTADO_NO_DISPONIBLE
        return estado

    @staticmethod
    def _estado_estandar(estado_api):
        """RF-02.4: traduce el estado de Chilexpress a la línea de tiempo estándar, o None si no hay equivalencia.

        Chilexpress no publica la lista completa de estados (ej. "EN PRE-RECEPCION"): se reconocen por palabra clave.
        """
        texto = unicodedata.normalize('NFKD', estado_api).encode('ascii', 'ignore').decode().upper()
        if 'NO ENTREGAD' in texto:
            return None
        for palabra, clave in (('ENTREGAD', 'ENTREGADO'), ('REPARTO', 'REPARTO'), ('TRANSITO', 'TRANSITO'),
                               ('RECEP', 'ORIGEN'), ('ORIGEN', 'ORIGEN')):
            if palabra in texto:
                return ESTADOS_ESTANDAR[clave]
        return None
