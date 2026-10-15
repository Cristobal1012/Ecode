import base64
import os
from unittest.mock import Mock, patch

import requests

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ecommerce.domain.logistica import CredencialesChilexpress
from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .adapters.logistica import ProveedorLogisticoAdapter
from .cifrado import descifrar_json
from .models import OrdenCompra, ProveedorEnvio
from .repositorio_chilexpress import DjangoRepositorioCredencialesChilexpress

ADAPTADOR = 'ecommerce.infrastructure.ventas.adapters.logistica'
COTIZADOR = 'llave-cotizador-secreta-0001'
ENVIOS = 'llave-envios-secreta-0002'


def guardar_credenciales(**llaves):
    DjangoRepositorioCredencialesChilexpress().guardar(CredencialesChilexpress(**llaves))


def sin_llaves_guardadas():
    # La migración 0022 copia a la base de pruebas las llaves que tenga el .env de quien corre los tests
    ProveedorEnvio.objects.all().delete()


class AdminChilexpressAPITests(APITestCase):
    """RNF-03: el admin carga las llaves de Chilexpress desde el panel, cifradas y nunca devueltas completas."""

    @classmethod
    def setUpTestData(cls):
        cls.admin_token = Token.objects.create(user=create_user('admin@example.test', rol='ADMIN'))
        cls.buyer_token = Token.objects.create(user=create_user())

    def setUp(self):
        sin_llaves_guardadas()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')

    def guardar(self, datos):
        return self.client.put(reverse('admin-chilexpress'), {'datos': datos}, format='json')

    def test_sin_configurar_informa_los_campos_y_lo_que_falta(self):
        response = self.client.get(reverse('admin-chilexpress'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['configuradas'], response.data['faltantes']), (False, ['cotizador']))
        self.assertEqual([(c['nombre'], c['obligatorio']) for c in response.data['campos']],
                         [('cotizador', True), ('coberturas', False), ('envios', False)])

    def test_guarda_cifrado_devuelve_enmascarado_y_conserva_al_reenviar(self):
        response = self.guardar({'cotizador': COTIZADOR, 'envios': ENVIOS})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['datos'], {'cotizador': '••••0001', 'coberturas': '', 'envios': '••••0002'})
        self.assertTrue(response.data['configuradas'])
        for llave in (COTIZADOR, ENVIOS):
            self.assertNotIn(llave, response.content.decode())
            self.assertNotIn(llave, ProveedorEnvio.objects.get(codigo='CHILEXPRESS').credenciales_cifradas)

        # El panel reenvía lo que mostró: no debe pisar las llaves con los puntos
        self.guardar(response.data['datos'])
        self.assertEqual(DjangoRepositorioCredencialesChilexpress().obtener(),
                         CredencialesChilexpress(cotizador=COTIZADOR, envios=ENVIOS))

    def test_campo_desconocido_es_400(self):
        response = self.guardar({'cotizador': COTIZADOR, 'tcc': '18578680'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('tcc', response.data['datos'])
        self.assertFalse(ProveedorEnvio.objects.exists())

    def test_solo_el_admin_ve_y_carga_las_llaves(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.buyer_token.key}')
        self.assertEqual(self.client.get(reverse('admin-chilexpress')).status_code, 403)
        self.assertEqual(self.guardar({'cotizador': COTIZADOR}).status_code, 403)
        self.client.credentials()
        self.assertEqual(self.client.get(reverse('admin-chilexpress')).status_code, 401)


class AdaptadorChilexpressCredencialesTests(TestCase):
    """El adaptador toma las llaves del panel; sin ellas no consulta a Chilexpress."""

    def setUp(self):
        sin_llaves_guardadas()
        ProveedorLogisticoAdapter._CACHE_COBERTURAS = {}
        self.addCleanup(setattr, ProveedorLogisticoAdapter, '_CACHE_COBERTURAS', {})

    @patch(f'{ADAPTADOR}.requests.get')
    def test_sin_llaves_no_llama_a_chilexpress(self, get):
        self.assertEqual(ProveedorLogisticoAdapter.obtener_comunas_chilexpress(),
                         {'error': 'Servicio de coberturas no disponible en este momento.'})
        get.assert_not_called()

    @patch(f'{ADAPTADOR}.requests.get')
    def test_coberturas_usa_la_llave_del_cotizador_si_no_hay_una_propia(self, get):
        guardar_credenciales(cotizador=COTIZADOR)
        get.return_value = Mock(status_code=200)
        get.return_value.json.return_value = {'regions': []}
        ProveedorLogisticoAdapter.obtener_comunas_chilexpress()
        self.assertEqual(get.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'], COTIZADOR)

    @patch(f'{ADAPTADOR}.requests.post')
    def test_la_orden_de_transporte_usa_la_llave_de_envios(self, post):
        guardar_credenciales(cotizador=COTIZADOR, envios=ENVIOS)
        post.return_value = Mock(status_code=500, text='error')
        ProveedorLogisticoAdapter.generar_orden_transporte({'referencia': 'ORDEN-1'})
        self.assertEqual(post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'], ENVIOS)


class DescargarEtiquetaTests(APITestCase):
    """El admin descarga la etiqueta de la OT con la llave de envíos cargada en el panel."""

    @classmethod
    def setUpTestData(cls):
        cls.admin_token = Token.objects.create(user=create_user('admin@example.test', rol='ADMIN'))
        cls.orden = OrdenCompra.objects.create(
            email_invitado='cliente@example.test', metodo_pago='TRANSBANK', estado='PAGADO',
            direccion_envio_snapshot={}, subtotal=10000, costo_envio=3500, total_final=13500,
            proveedor_logistico='CHILEXPRESS', id_transaccion_pasarela='token-tbk | OT: 712678903156')

    def setUp(self):
        sin_llaves_guardadas()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')

    def descargar(self):
        return self.client.get(reverse('descargar-etiqueta', args=[self.orden.id]))

    @patch(f'{ADAPTADOR}.requests.post')
    def test_descarga_el_pdf_por_https_con_la_llave_de_envios(self, post):
        guardar_credenciales(cotizador=COTIZADOR, envios=ENVIOS)
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {
            'statusCode': 0, 'data': {'detail': [{'label': {'labelData': base64.b64encode(b'%PDF-1').decode()}}]}}

        response = self.descargar()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertEqual(response.content, b'%PDF-1')
        self.assertTrue(post.call_args.args[0].startswith('https://'))
        self.assertEqual(post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'], ENVIOS)
        self.assertEqual(post.call_args.kwargs['json']['transportOrderNumber'], 712678903156)

    @patch(f'{ADAPTADOR}.requests.post')
    def test_sin_llaves_avisa_sin_llamar_a_chilexpress(self, post):
        response = self.descargar()
        self.assertEqual(response.status_code, 400)
        post.assert_not_called()


# El entorno sin ninguna variable de Chilexpress (las del .env de quien corre los tests no cuentan)
ENTORNO_SIN_CHILEXPRESS = {k: v for k, v in os.environ.items() if not k.startswith('CHILEXPRESS_')}


class MigracionCredencialesChilexpressTests(TransactionTestCase):
    """0022 copia una sola vez las llaves de Chilexpress del .env a la base, cifradas."""

    ANTERIOR = [('ventas', '0021_proveedor_envio')]
    COPIA = [('ventas', '0022_copiar_credenciales_chilexpress')]

    def migrar(self, destino):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(destino)
        return executor.loader.project_state(destino).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def copiar(self):
        self.migrar(self.ANTERIOR).get_model('ventas', 'ProveedorEnvio').objects.all().delete()
        return self.migrar(self.COPIA).get_model('ventas', 'ProveedorEnvio').objects.all()

    @patch.dict('os.environ', {**ENTORNO_SIN_CHILEXPRESS, 'CHILEXPRESS_API_KEY_COTIZADOR': COTIZADOR,
                               'CHILEXPRESS_API_KEY_GEO': 'llave-geo-0003', 'CHILEXPRESS_API_KEY_ENVIOS': ENVIOS},
                clear=True)
    def test_copia_las_llaves_cifradas_y_la_de_sucursales_como_coberturas(self):
        fila, = self.copiar()
        self.assertEqual(fila.codigo, 'CHILEXPRESS')
        self.assertEqual(descifrar_json(fila.credenciales_cifradas),
                         {'cotizador': COTIZADOR, 'coberturas': 'llave-geo-0003', 'envios': ENVIOS})
        self.assertNotIn(COTIZADOR, fila.credenciales_cifradas)

    @patch.dict('os.environ', ENTORNO_SIN_CHILEXPRESS, clear=True)
    def test_sin_llaves_en_el_env_no_crea_nada(self):
        self.assertFalse(self.copiar().exists())


def respuesta_tracking(estado, status_code=200, codigo=0):
    respuesta = Mock(status_code=status_code)
    respuesta.json.return_value = {
        'statusCode': codigo, 'statusDescription': 'Extraccion exitosa',
        'data': {'transportOrderData': {'transportOrderNumber': '712678906520', 'status': estado}, 'trackingEvents': []},
    }
    if status_code >= 400:
        respuesta.raise_for_status.side_effect = requests.HTTPError(f'{status_code} Client Error')
    return respuesta


@patch(f'{ADAPTADOR}.requests.post')
class SeguimientoChilexpressTests(TestCase):
    """RF-02.4: el estado de la OT se consulta al tracking del sandbox y se traduce a la línea de tiempo estándar."""

    def setUp(self):
        sin_llaves_guardadas()
        guardar_credenciales(cotizador=COTIZADOR, envios=ENVIOS)

    def consultar(self):
        return ProveedorLogisticoAdapter.consultar_estado('CHILEXPRESS', '712678906520')

    def test_consulta_por_post_con_la_ot_el_rut_y_la_llave_de_envios(self, post):
        post.return_value = respuesta_tracking('EN PRE-RECEPCION')
        self.assertEqual(self.consultar(), 'En origen')
        url = post.call_args.args[0]
        self.assertEqual(url, 'https://testservices.wschilexpress.com/transport-orders/api/v1.0/tracking')
        self.assertEqual(post.call_args.kwargs['headers']['Ocp-Apim-Subscription-Key'], ENVIOS)
        cuerpo = post.call_args.kwargs['json']
        self.assertEqual((cuerpo['transportOrderNumber'], cuerpo['rut']), (712678906520, 96756430))

    def test_traduce_los_estados_a_la_linea_de_tiempo(self, post):
        for estado_api, esperado in (('EN PRE-RECEPCION', 'En origen'), ('RECEPCIONADO', 'En origen'),
                                     ('EN TRÁNSITO', 'En tránsito'), ('EN REPARTO', 'En reparto'),
                                     ('ENTREGADO', 'Entregado')):
            with self.subTest(estado_api=estado_api):
                post.return_value = respuesta_tracking(estado_api)
                self.assertEqual(self.consultar(), esperado)

    def test_un_estado_sin_equivalencia_se_informa_tal_cual_sin_avanzar_la_linea(self, post):
        for estado_api in ('PARA RETIRO EN SUCURSAL', 'NO ENTREGADO'):
            with self.subTest(estado_api=estado_api), self.assertLogs(ADAPTADOR, level='WARNING') as logs:
                post.return_value = respuesta_tracking(estado_api)
                self.assertEqual(self.consultar(), estado_api.capitalize())
                self.assertIn(estado_api, logs.output[0])

    def test_un_error_de_chilexpress_muestra_no_disponible_sin_la_llave_en_el_log(self, post):
        for respuesta in (respuesta_tracking('', status_code=400, codigo=-41), respuesta_tracking('', codigo=-41),
                          requests.ConnectionError('sin conexión')):
            with self.subTest(respuesta=respuesta), self.assertLogs(ADAPTADOR, level='ERROR') as logs:
                if isinstance(respuesta, Exception):
                    post.side_effect = respuesta
                else:
                    post.side_effect, post.return_value = None, respuesta
                self.assertEqual(self.consultar(), 'Estado no disponible temporalmente')
                self.assertNotIn(ENVIOS, '\n'.join(logs.output))

    def test_sin_llaves_no_consulta_a_chilexpress(self, post):
        sin_llaves_guardadas()
        self.assertEqual(self.consultar(), 'Estado no disponible temporalmente')
        post.assert_not_called()

    def test_el_invitado_ve_el_estado_traducido_en_el_portal(self, post):
        post.return_value = respuesta_tracking('EN PRE-RECEPCION')
        orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSBANK', estado='PAGADO',
            direccion_envio_snapshot={}, subtotal=10000, costo_envio=3500, total_final=13500,
            proveedor_logistico='CHILEXPRESS', numero_seguimiento_tracking='712678906520')
        response = self.client.post(reverse('tracking-envio'),
                                    {'numero_orden': orden.id, 'email': 'invitado@example.test'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['estado_actual'], 'En origen')
        self.assertIn(response.data['estado_actual'], response.data['linea_tiempo_estandar'])
