"""Adaptadores de cotización de Starken, Chilexpress y retiro en tienda."""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlparse

import requests

from ecommerce.domain.logistica import (
    ConfiguracionCotizacionInvalida,
    Cotizacion,
    ErrorCotizacion,
    PuertoCotizadorLogistico,
    SolicitudCotizacion,
)


def _precio_respuesta(data, ruta):
    try:
        valor = data
        for segmento in ruta.split('.'):
            valor = valor[int(segmento)] if isinstance(valor, list) else valor[segmento]
        precio = Decimal(str(valor))
        if not precio.is_finite() or precio < 0:
            raise ValueError
        return precio.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    except (KeyError, IndexError, TypeError, ValueError, InvalidOperation) as exc:
        raise ErrorCotizacion('La respuesta del proveedor no contiene una tarifa válida.') from exc


class AdaptadorHTTP(PuertoCotizadorLogistico):
    proveedor = ''
    nombre = ''

    def __init__(self, configuracion, codigo_destino, session=None):
        self.configuracion = configuracion
        self.codigo_destino = codigo_destino
        self.session = session or requests

    def _post(self, url, payload, headers):
        parsed = urlparse(url or '')
        if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password:
            raise ConfiguracionCotizacionInvalida('URL de cotización inválida.')
        try:
            response = self.session.post(url, json=payload, headers=headers, timeout=5)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            raise ErrorCotizacion('No fue posible consultar la tarifa del proveedor.') from exc

    def _cotizacion(self, solicitud, data, ruta):
        if not ruta or not isinstance(ruta, str):
            raise ConfiguracionCotizacionInvalida('Falta ruta_precio del proveedor.')
        precio = _precio_respuesta(data, ruta)
        return Cotizacion(self.proveedor, self.nombre, precio, solicitud.subtotal + precio)


class StarkenAdapter(AdaptadorHTTP):
    proveedor = 'STARKEN'
    nombre = 'Starken'

    def cotizar(self, solicitud: SolicitudCotizacion) -> Cotizacion:
        cfg = self.configuracion
        if not cfg.get('codigo_origen') or not cfg.get('url_cotizacion') or not solicitud.paquete:
            raise ConfiguracionCotizacionInvalida('Configuración de Starken incompleta.')
        paquete = solicitud.paquete
        payload = {
            'origen': cfg['codigo_origen'], 'destino': self.codigo_destino,
            'kilos': float(paquete.peso_kg), 'alto': float(paquete.alto_cm),
            'ancho': float(paquete.ancho_cm), 'largo': float(paquete.largo_cm),
            'bulto': 'PAQUETE', 'entrega': 'DOMICILIO', 'servicio': 'NORMAL',
        }
        headers = {'Content-Type': 'application/json'}
        if cfg.get('api_key'):
            header = cfg.get('api_key_header', 'Authorization')
            prefix = cfg.get('api_key_prefix', 'Bearer ')
            headers[header] = f"{prefix}{cfg['api_key']}"
        data = self._post(cfg['url_cotizacion'], payload, headers)
        return self._cotizacion(solicitud, data, cfg.get('ruta_precio'))


class ChilexpressAdapter(AdaptadorHTTP):
    proveedor = 'CHILEXPRESS'
    nombre = 'Chilexpress'
    URLS = {
        'test': 'https://testservices.wschilexpress.com/rating/api/v1.0/rates/business',
        'produccion': 'https://services.wschilexpress.com/rating/api/v1.0/rates/business',
    }

    def cotizar(self, solicitud: SolicitudCotizacion) -> Cotizacion:
        cfg = self.configuracion
        if not cfg.get('subscription_key') or not cfg.get('codigo_origen') or not solicitud.paquete:
            raise ConfiguracionCotizacionInvalida('Configuración de Chilexpress incompleta.')
        ambiente = cfg.get('ambiente', 'test')
        if ambiente not in self.URLS:
            raise ConfiguracionCotizacionInvalida('Ambiente de Chilexpress inválido.')
        paquete = solicitud.paquete
        payload = {
            'originCountyCode': cfg['codigo_origen'],
            'destinationCountyCode': self.codigo_destino,
            'package': {
                'weight': float(paquete.peso_kg), 'height': float(paquete.alto_cm),
                'width': float(paquete.ancho_cm), 'length': float(paquete.largo_cm),
            },
            'productType': 3, 'contentType': 1,
            'declaredWorth': int(solicitud.subtotal), 'deliveryTime': 0,
        }
        headers = {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': cfg['subscription_key'],
        }
        data = self._post(cfg.get('url_cotizacion') or self.URLS[ambiente], payload, headers)
        return self._cotizacion(solicitud, data, cfg.get('ruta_precio'))


class RetiroEnLocalAdapter(PuertoCotizadorLogistico):
    def __init__(self, nombre='Retiro en local'):
        self.nombre = nombre

    def cotizar(self, solicitud: SolicitudCotizacion) -> Cotizacion:
        return Cotizacion('RETIRO_LOCAL', self.nombre, Decimal('0'),
                          solicitud.subtotal, tipo='RETIRO')
