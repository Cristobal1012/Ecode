from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import Paquete, SolicitudCotizacion

from .models import ConfiguracionGlobal, OrdenCompra


PAQUETE = {'peso_kg': '1.50', 'alto_cm': '10', 'ancho_cm': '20', 'largo_cm': '30'}
CHILEXPRESS = {
    'subscription_key': 'secreto-chilexpress', 'ambiente': 'test',
    'codigo_origen': 'PUDA', 'comunas': {'Santiago': 'STGO'},
    'ruta_precio': 'data.0.serviceValue',
}
STARKEN = {
    'api_key': 'secreto-starken',
    'url_cotizacion': 'https://api.starken.example/quote',
    'codigo_origen': 1, 'comunas': {'Valparaíso': 19},
    'ruta_precio': 'precio',
}


def respuesta(data, status=200):
    result = Mock()
    result.json.return_value = data
    result.raise_for_status.return_value = None
    if status != 200:
        from requests import HTTPError
        result.raise_for_status.side_effect = HTTPError('provider error')
    return result


class AdaptadoresTests(SimpleTestCase):
    def test_chilexpress_usa_clave_codigos_y_paquete(self):
        session = Mock()
        session.post.return_value = respuesta({'data': [{'serviceValue': 3590}]})
        service = ServicioCotizacion(
            {'proveedor_activo': 'CHILEXPRESS', 'CHILEXPRESS': CHILEXPRESS}, session=session,
        )
        solicitud = SolicitudCotizacion('SÁNTIAGO', Decimal('25000'), Paquete(
            Decimal('1.5'), Decimal('10'), Decimal('20'), Decimal('30'),
        ))

        quote = service.cotizar(solicitud)

        self.assertEqual(quote.costo_envio, Decimal('3590'))
        self.assertEqual(quote.total_final, Decimal('28590'))
        url, = session.post.call_args.args
        self.assertIn('testservices.wschilexpress.com', url)
        kwargs = session.post.call_args.kwargs
        self.assertEqual(kwargs['headers']['Ocp-Apim-Subscription-Key'], 'secreto-chilexpress')
        self.assertEqual(kwargs['json']['destinationCountyCode'], 'STGO')
        self.assertEqual(kwargs['json']['package']['weight'], 1.5)
        self.assertEqual(kwargs['timeout'], 5)

    def test_starken_normaliza_tarifa_y_manda_medidas(self):
        session = Mock()
        session.post.return_value = respuesta({'precio': '2990.5'})
        service = ServicioCotizacion(
            {'proveedor_activo': 'STARKEN', 'STARKEN': STARKEN}, session=session,
        )
        solicitud = SolicitudCotizacion('valparaiso', Decimal('10000'), Paquete(
            Decimal('2'), Decimal('15'), Decimal('25'), Decimal('35'),
        ))

        quote = service.cotizar(solicitud)

        self.assertEqual(quote.costo_envio, Decimal('2991'))
        kwargs = session.post.call_args.kwargs
        self.assertEqual(kwargs['headers']['Authorization'], 'Bearer secreto-starken')
        self.assertEqual(kwargs['json']['destino'], 19)
        self.assertEqual(kwargs['json']['kilos'], 2.0)

    def test_error_del_proveedor_preserva_retiro_sin_inventar_tarifa(self):
        session = Mock()
        session.post.return_value = respuesta({}, status=500)
        service = ServicioCotizacion({
            'proveedor_activo': 'CHILEXPRESS', 'CHILEXPRESS': CHILEXPRESS,
            'retiro_en_local': {'activo': True, 'nombre': 'Tienda Centro'},
        }, session=session)
        opciones, errores = service.opciones(SolicitudCotizacion('Santiago', Decimal('10000'),
            Paquete(Decimal('1'), Decimal('1'), Decimal('1'), Decimal('1'))))

        self.assertEqual([opcion.proveedor for opcion in opciones], ['RETIRO_LOCAL'])
        self.assertEqual(opciones[0].total_final, Decimal('10000'))
        self.assertEqual(errores[0]['proveedor'], 'CHILEXPRESS')


class CotizacionesAPITests(APITestCase):
    def setUp(self):
        self.config = ConfiguracionGlobal.objects.create(
            id=1, nombre_tienda='QA', api_keys_logistica={
                'proveedor_activo': 'CHILEXPRESS', 'CHILEXPRESS': CHILEXPRESS,
                'retiro_en_local': {'activo': True, 'nombre': 'Retiro en tienda'},
            },
        )
        self.payload = {'comuna': 'Santiago', 'subtotal': '25000', 'paquete': PAQUETE}

    @patch('ecommerce.infrastructure.ventas.logistics_adapters.requests.post')
    def test_opciones_publicas_calculan_total_y_ocultan_credenciales(self, post):
        post.return_value = respuesta({'data': [{'serviceValue': 3500}]})

        response = self.client.post(reverse('cotizaciones'), self.payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['opciones'][0]['costo_envio'], 3500)
        self.assertEqual(response.data['opciones'][0]['total_final'], 28500)
        self.assertEqual(response.data['opciones'][1]['proveedor'], 'RETIRO_LOCAL')
        self.assertEqual(response.data['opciones'][1]['costo_envio'], 0)
        self.assertNotIn('secreto-chilexpress', str(response.data))

    def test_rechaza_paquete_invalido(self):
        payload = {**self.payload, 'paquete': {**PAQUETE, 'peso_kg': '-1'}}
        response = self.client.post(reverse('cotizaciones'), payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('paquete', response.data)

    def test_retiro_funciona_sin_paquete(self):
        self.config.api_keys_logistica = {'retiro_en_local': {'activo': True}}
        self.config.save(update_fields=['api_keys_logistica'])
        response = self.client.post(reverse('cotizaciones'), {'subtotal': '25000'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['opciones'][0]['total_final'], 25000)

    @patch('ecommerce.infrastructure.ventas.logistics_adapters.requests.post')
    def test_fallo_de_proveedor_no_se_convierte_en_costo_cero(self, post):
        self.config.api_keys_logistica.pop('retiro_en_local')
        self.config.save(update_fields=['api_keys_logistica'])
        post.return_value = respuesta({}, status=500)
        response = self.client.post(reverse('cotizaciones'), self.payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['opciones'], [])

    @patch('ecommerce.infrastructure.ventas.logistics_adapters.requests.post')
    def test_checkout_recalcula_envio_y_total(self, post):
        post.return_value = respuesta({'data': [{'serviceValue': 3500}]})
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {'comuna': 'Santiago', 'calle': 'Uno 123'},
            'subtotal': 25000, 'costo_envio': 1, 'total_final': 1,
            'proveedor_logistico': 'CHILEXPRESS', 'paquete': PAQUETE,
        }
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        orden = OrdenCompra.objects.get()
        self.assertEqual(orden.costo_envio, 3500)
        self.assertEqual(orden.total_final, 28500)
        self.assertEqual(orden.proveedor_logistico, 'CHILEXPRESS')

    def test_checkout_no_permite_retiro_desactivado(self):
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {}, 'subtotal': 25000,
            'proveedor_logistico': 'RETIRO_LOCAL',
        }
        self.config.api_keys_logistica.pop('retiro_en_local')
        self.config.save(update_fields=['api_keys_logistica'])
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_checkout_retiro_ignora_costo_enviado_por_cliente(self):
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {}, 'subtotal': '25000',
            'costo_envio': 9999, 'total_final': 34999,
            'proveedor_logistico': 'RETIRO_LOCAL',
        }
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        orden = OrdenCompra.objects.get()
        self.assertEqual(orden.costo_envio, 0)
        self.assertEqual(orden.total_final, 25000)

    @patch('ecommerce.infrastructure.ventas.logistics_adapters.requests.post')
    def test_tarifa_sin_precio_valido_no_crea_orden(self, post):
        post.return_value = respuesta({'data': [{'serviceValue': '-10'}]})
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {'comuna': 'Santiago'},
            'subtotal': '25000', 'proveedor_logistico': 'CHILEXPRESS',
            'paquete': PAQUETE,
        }
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(OrdenCompra.objects.exists())
