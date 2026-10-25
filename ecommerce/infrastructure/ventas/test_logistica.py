from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.application.ventas import GenerarOrdenTransporte
from ecommerce.domain.logistica import CredencialesChilexpress, Paquete, SolicitudCotizacion
from ecommerce.domain.ventas import VarianteCatalogo
from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .adapters.orden_transporte import ChilexpressOrdenTransporte
from .models import ConfiguracionGlobal, OrdenCompra
from .repositorio_chilexpress import DjangoRepositorioCredencialesChilexpress
from .repositorio_ordenes import DjangoRepositorioOrdenes
from .tests import DESTINATARIO, habilitar_medios_pago, usar_catalogo_falso


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


ADAPTADOR_CHILEXPRESS = 'ecommerce.infrastructure.ventas.adapters.logistica'


def respuesta_chilexpress(servicios, status=200):
    result = Mock(status_code=status, text='provider error')
    result.json.return_value = {'data': {'courierServiceOptions': servicios}}
    return result


TARIFA_OK = [{'serviceValue': 3500, 'serviceDescription': 'EXPRESS'}]
# Un ítem de $25.000, el subtotal que usan las pruebas de checkout
ITEMS = [{'producto_mongo_id': 'polera', 'variante_sku': 'POLERA-M', 'cantidad': 1}]


class CotizacionesAPITests(APITestCase):
    def setUp(self):
        # La llave la carga el admin en el panel (cifrada en la base), no el .env
        DjangoRepositorioCredencialesChilexpress().guardar(CredencialesChilexpress(cotizador='secreto-chilexpress'))
        habilitar_medios_pago('TRANSFERENCIA', 'TRANSBANK')
        self.config = ConfiguracionGlobal.objects.create(
            id=1, nombre_tienda='QA', comuna_origen='Santiago', retiro_en_local_activo=True,
        )
        self.payload = {'destino': 'SANTIAGO', 'peso': 1.5, 'alto': 10, 'ancho': 20, 'largo': 30}
        usar_catalogo_falso(self, {
            ('polera', 'POLERA-M'): VarianteCatalogo('Polera - POLERA-M', Decimal('25000'), 5, True),
        })
        # El catálogo de comunas se descarga por red: en pruebas se fija uno conocido
        catalogo = patch(f'{ADAPTADOR_CHILEXPRESS}.ProveedorLogisticoAdapter._obtener_catalogo_dinamico',
                         return_value={'SANTIAGO': 'STGO'})
        catalogo.start()
        self.addCleanup(catalogo.stop)

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_cotizacion_entrega_precio_y_oculta_credenciales(self, post):
        post.return_value = respuesta_chilexpress(TARIFA_OK)

        response = self.client.post(reverse('cotizar-envio'), self.payload, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['precio'], 3500)
        self.assertEqual(response.data['proveedor'], 'Chilexpress')
        self.assertEqual(post.call_args.kwargs['json']['destinationCountyCode'], 'STGO')
        self.assertEqual(post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'],
                         'secreto-chilexpress')
        self.assertNotIn('secreto-chilexpress', str(response.data))

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_rechaza_datos_invalidos_sin_consultar_proveedor(self, post):
        for payload in ({**self.payload, 'peso': -1}, {**self.payload, 'alto': 'abc'},
                        {k: v for k, v in self.payload.items() if k != 'destino'}):
            with self.subTest(payload=payload):
                response = self.client.post(reverse('cotizar-envio'), payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.data)
        post.assert_not_called()

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_comuna_sin_cobertura_responde_400(self, post):
        payload = {**self.payload, 'destino': 'ATLANTIDA'}
        response = self.client.post(reverse('cotizar-envio'), payload, format='json')
        self.assertEqual(response.status_code, 400)
        post.assert_not_called()

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_fallo_de_proveedor_no_se_convierte_en_costo_cero(self, post):
        post.return_value = respuesta_chilexpress([], status=500)
        response = self.client.post(reverse('cotizar-envio'), self.payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('precio', response.data)

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_checkout_recalcula_envio_y_total(self, post):
        post.return_value = respuesta_chilexpress(TARIFA_OK)
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'acepta_terminos': True, 'items': ITEMS, **DESTINATARIO,
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
        # La orden de transporte usará el mismo paquete que se cotizó
        self.assertEqual(orden.paquete,
                         {'peso_kg': '1.50', 'alto_cm': '10.00', 'ancho_cm': '20.00', 'largo_cm': '30.00'})

    def test_checkout_no_permite_retiro_desactivado(self):
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'acepta_terminos': True, 'items': ITEMS, **DESTINATARIO,
            'direccion_envio_snapshot': {}, 'subtotal': 25000,
            'proveedor_logistico': 'RETIRO_LOCAL',
        }
        self.config.retiro_en_local_activo = False
        self.config.save(update_fields=['retiro_en_local_activo'])
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('proveedor_logistico', response.data)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_checkout_retiro_ignora_costo_enviado_por_cliente(self):
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'acepta_terminos': True, 'items': ITEMS, **DESTINATARIO,
            'direccion_envio_snapshot': {}, 'subtotal': '25000',
            'costo_envio': 9999, 'total_final': 34999,
            'proveedor_logistico': 'RETIRO_LOCAL',
        }
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        orden = OrdenCompra.objects.get()
        self.assertEqual(orden.costo_envio, 0)
        self.assertEqual(orden.total_final, 25000)

    def sin_logistica_configurada(self):
        self.config.retiro_en_local_activo = False
        self.config.save(update_fields=['retiro_en_local_activo'])

    def checkout_con_totales_manipulados(self, **cambios):
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'acepta_terminos': True, 'items': ITEMS, **DESTINATARIO,
            'direccion_envio_snapshot': {'comuna': 'Santiago', 'calle': 'Uno 123'},
            'subtotal': 25000, 'costo_envio': 0, 'total_final': 1, **cambios,
        }
        return self.client.post(reverse('checkout'), payload, format='json')

    def test_sin_opcion_de_entrega_se_rechaza_aunque_la_tienda_no_tenga_logistica(self):
        self.sin_logistica_configurada()
        response = self.checkout_con_totales_manipulados()
        self.assertEqual(response.status_code, 400)
        self.assertIn('proveedor_logistico', response.data)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_courier_sin_paquete_se_rechaza_en_vez_de_usar_el_total_del_navegador(self):
        self.sin_logistica_configurada()
        response = self.checkout_con_totales_manipulados(proveedor_logistico='CHILEXPRESS')
        self.assertEqual(response.status_code, 400)
        self.assertIn('paquete', response.data)
        self.assertFalse(OrdenCompra.objects.exists())

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_sin_logistica_activa_el_courier_igual_se_cotiza_en_el_servidor(self, post):
        post.return_value = respuesta_chilexpress(TARIFA_OK)
        self.sin_logistica_configurada()
        response = self.checkout_con_totales_manipulados(
            proveedor_logistico='CHILEXPRESS', paquete=PAQUETE)
        self.assertEqual(response.status_code, 201, response.data)
        orden = OrdenCompra.objects.get()
        self.assertEqual((orden.costo_envio, orden.total_final), (3500, 28500))
        self.assertEqual((response.data['costo_envio'], response.data['total_final']), (3500, 28500))

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_tarifa_sin_precio_valido_no_crea_orden(self, post):
        post.return_value = respuesta_chilexpress(
            [{'serviceValue': '-10', 'serviceDescription': 'EXPRESS'}])
        payload = {
            'email_invitado': 'cliente@example.test', 'metodo_pago': 'TRANSFERENCIA',
            'acepta_terminos': True, 'items': ITEMS, **DESTINATARIO,
            'direccion_envio_snapshot': {'comuna': 'Santiago'},
            'subtotal': '25000', 'proveedor_logistico': 'CHILEXPRESS',
            'paquete': PAQUETE,
        }
        response = self.client.post(reverse('checkout'), payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(OrdenCompra.objects.exists())


class OrdenTransporteTests(APITestCase):
    def setUp(self):
        DjangoRepositorioCredencialesChilexpress().guardar(CredencialesChilexpress(
            cotizador='llave-cotizador', envios='secreto-chilexpress'))
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='QA', comuna_origen='Santiago')
        self.orden = OrdenCompra.objects.create(
            email_invitado='cliente@example.test', metodo_pago='TRANSBANK',
            direccion_envio_snapshot={'comuna': 'SANTIAGO', 'calle': 'Uno', 'numero': '123'},
            subtotal=25000, costo_envio=3500, total_final=28500,
            proveedor_logistico='CHILEXPRESS', id_transaccion_pasarela='token-tbk',
            nombre_destinatario='Ana Pérez', telefono_destinatario='+56912345678',
        )
        catalogo = patch(f'{ADAPTADOR_CHILEXPRESS}.ProveedorLogisticoAdapter._obtener_catalogo_dinamico',
                         return_value={'SANTIAGO': 'STGO'})
        catalogo.start()
        self.addCleanup(catalogo.stop)

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    @patch('ecommerce.infrastructure.ventas.views.TransbankWebpayAdapter.confirmar_transaccion')
    def test_pago_aprobado_guarda_ot_como_codigo_de_seguimiento(self, confirmar, post):
        confirmar.return_value = {
            'exito': True, 'aprobado': True,
            'data_completa': {'buy_order': f'ORD-{self.orden.id}'},
        }
        # Chilexpress devuelve el número de OT como decimal
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {
            'data': {'detail': [{'transportOrderNumber': 712678903156.0, 'label': {}}]}}

        response = self.client.get(reverse('transbank_retorno'), {'token_ws': 'token-tbk'})

        self.assertEqual(response.status_code, 302)
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.estado, 'PAGADO')
        self.assertEqual(self.orden.numero_seguimiento_tracking, '712678903156')
        self.assertEqual(self.orden.id_transaccion_pasarela, 'token-tbk | OT: 712678903156')

    def generar_ot(self):
        return GenerarOrdenTransporte(DjangoRepositorioOrdenes(), ChilexpressOrdenTransporte()).ejecutar(
            self.orden.id)

    def test_sin_destinatario_la_ot_usa_el_nombre_de_la_cuenta(self):
        # Pedidos anteriores a pedir el destinatario en el checkout (RF-02.3)
        usuario = create_user('luis@example.test', nombre='Luis', apellido_paterno='Rojas')
        OrdenCompra.objects.filter(id=self.orden.id).update(usuario=usuario, email_invitado='',
                                                            nombre_destinatario='')
        self.assertEqual(DjangoRepositorioOrdenes().obtener_envio(self.orden.id).destinatario, 'Luis Rojas')

        OrdenCompra.objects.filter(id=self.orden.id).update(usuario=None, email_invitado='cliente@example.test')
        self.assertEqual(DjangoRepositorioOrdenes().obtener_envio(self.orden.id).destinatario, 'Cliente')

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_ot_usa_el_paquete_cotizado_y_declara_el_valor_de_los_productos(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'data': {'detail': [{'transportOrderNumber': 1.0}]}}
        OrdenCompra.objects.filter(id=self.orden.id).update(paquete=PAQUETE)

        self.assertEqual(self.generar_ot(), '1')

        detalle = post.call_args.kwargs['json']['details'][0]
        paquete = detalle['packages'][0]
        self.assertEqual((paquete['weight'], paquete['height'], paquete['width'], paquete['length']),
                         ('1.50', 10, 20, 30))
        self.assertEqual(paquete['declaredValue'], 25000)
        destino = detalle['addresses'][0]
        self.assertEqual((destino['countyCoverageCode'], destino['deliveryOnCommercialOffice']), ('STGO', False))

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_retiro_en_sucursal_se_entrega_en_la_oficina(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'data': {'detail': [{'transportOrderNumber': 1.0}]}}
        OrdenCompra.objects.filter(id=self.orden.id).update(direccion_envio_snapshot={
            'comuna': 'Santiago', 'calle': 'Agencia Chilexpress: Centro', 'numero': 'S/N',
            'codigo_sucursal': 'OF-123'})

        self.generar_ot()

        destino = post.call_args.kwargs['json']['details'][0]['addresses'][0]
        self.assertEqual((destino['deliveryOnCommercialOffice'], destino['commercialOfficeId']), (True, 'OF-123'))

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_ot_lleva_el_nombre_y_telefono_del_destinatario(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'data': {'detail': [{'transportOrderNumber': 1.0}]}}

        self.generar_ot()

        destinatario = post.call_args.kwargs['json']['details'][0]['contacts'][0]
        self.assertEqual((destinatario['name'], destinatario['phoneNumber']), ('Ana Pérez', '912345678'))

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_orden_sin_telefono_no_genera_ot_con_datos_inventados(self, post):
        OrdenCompra.objects.filter(id=self.orden.id).update(telefono_destinatario='')

        self.assertIsNone(self.generar_ot())

        post.assert_not_called()
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.error_orden_transporte, 'La orden no tiene teléfono del destinatario.')

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_rechazo_de_chilexpress_queda_en_la_orden_sin_ot(self, post):
        post.return_value = Mock(status_code=400, text='Comuna sin cobertura')

        self.assertIsNone(self.generar_ot())

        self.orden.refresh_from_db()
        self.assertIsNone(self.orden.numero_seguimiento_tracking)
        self.assertIn('Comuna sin cobertura', self.orden.error_orden_transporte)

    @patch(f'{ADAPTADOR_CHILEXPRESS}.requests.post')
    def test_comuna_sin_cobertura_no_llama_a_chilexpress(self, post):
        OrdenCompra.objects.filter(id=self.orden.id).update(direccion_envio_snapshot={'comuna': 'Isla de Pascua'})

        self.assertIsNone(self.generar_ot())

        post.assert_not_called()
        self.orden.refresh_from_db()
        self.assertIn('Isla de Pascua', self.orden.error_orden_transporte)
