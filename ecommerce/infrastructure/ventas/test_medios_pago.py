from unittest.mock import patch

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings

from ecommerce.domain.medios_pago import CodigoMedioPago, MedioPagoConfigurado

from .cifrado import CredencialesIlegibles, cifrar_json, descifrar_json
from .models import MedioPago
from .repositorio_medios_pago import DjangoRepositorioMediosPago

TOKEN_MP = 'APP_USR-1234567890-secreto-abcd'


class CifradoTests(TestCase):
    def test_ida_y_vuelta_y_texto_cifrado_sin_el_secreto(self):
        cifrado = cifrar_json({'access_token': TOKEN_MP})
        self.assertNotIn(TOKEN_MP, cifrado)
        self.assertEqual(descifrar_json(cifrado), {'access_token': TOKEN_MP})
        self.assertEqual((cifrar_json({}), descifrar_json('')), ('', {}))

    def test_otra_clave_no_puede_descifrar(self):
        cifrado = cifrar_json({'access_token': TOKEN_MP}, clave='clave-original')
        with self.assertRaises(CredencialesIlegibles):
            descifrar_json(cifrado, clave='otra-clave')


class RepositorioMediosPagoTests(TestCase):
    def setUp(self):
        self.repo = DjangoRepositorioMediosPago()

    def test_medio_sin_configurar_esta_deshabilitado_y_vacio(self):
        medio = self.repo.obtener('MERCADO_PAGO')
        self.assertEqual((medio.habilitado, medio.datos), (False, {}))

    def test_las_credenciales_se_guardan_cifradas_y_los_datos_visibles_no(self):
        self.repo.guardar(MedioPagoConfigurado(CodigoMedioPago.TRANSBANK, True, {
            'ambiente': 'PRODUCCION', 'commerce_code': '597012345678', 'api_key': TOKEN_MP}))

        fila = MedioPago.objects.get(codigo='TRANSBANK')
        self.assertEqual(fila.datos, {'ambiente': 'PRODUCCION', 'commerce_code': '597012345678'})
        self.assertNotIn(TOKEN_MP, fila.credenciales_cifradas)
        self.assertEqual(self.repo.obtener('TRANSBANK').datos['api_key'], TOKEN_MP)

    def test_si_cambia_la_clave_el_medio_queda_incompleto_y_no_se_ofrece(self):
        self.repo.guardar(MedioPagoConfigurado(CodigoMedioPago.MERCADO_PAGO, True, {
            'access_token': TOKEN_MP, 'webhook_secret': 'secreto-de-webhook-1234'}))
        self.assertTrue(self.repo.obtener('MERCADO_PAGO').disponible)

        with override_settings(CLAVE_CIFRADO_CREDENCIALES='otra-clave'), \
                self.assertLogs('ecommerce.infrastructure.ventas.repositorio_medios_pago', level='ERROR') as logs:
            medio = self.repo.obtener('MERCADO_PAGO')

        self.assertFalse(medio.disponible)
        self.assertEqual(medio.faltantes, ['access_token', 'webhook_secret'])
        # El log no revela credenciales
        self.assertNotIn(TOKEN_MP, '\n'.join(logs.output))


class MigracionMediosPagoTests(TransactionTestCase):
    """0017 copia los medios de api_keys_pagos a MedioPago, con las credenciales cifradas."""

    ANTERIOR = [('ventas', '0015_orden_paquete_error_ot')]
    COPIA = [('ventas', '0017_copiar_medios_pago')]

    def migrar(self, destino):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(destino)
        return executor.loader.project_state(destino).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def crear_config(self, api_keys_pagos):
        apps = self.migrar(self.ANTERIOR)
        apps.get_model('ventas', 'ConfiguracionGlobal').objects.create(
            id=1, nombre_tienda='QA', api_keys_pagos=api_keys_pagos)

    def medio(self, codigo):
        fila = self.migrar(self.COPIA).get_model('ventas', 'MedioPago').objects.get(codigo=codigo)
        return fila, descifrar_json(fila.credenciales_cifradas)

    @patch.dict('os.environ', {'TRANSBANK_ENVIRONMENT': 'INTEGRACION'})
    def test_transbank_de_integracion_respeta_activo_y_no_guarda_credenciales(self):
        self.crear_config({'TRANSBANK': {'activo': False, 'commerce_code': 'x', 'api_key': 'y'},
                           'MERCADO_PAGO': {'activo': True, 'access_token': TOKEN_MP}})

        transbank, secretos = self.medio('TRANSBANK')
        self.assertEqual((transbank.habilitado, transbank.datos, secretos), (False, {'ambiente': 'INTEGRACION'}, {}))
        mercado_pago, secretos = self.medio('MERCADO_PAGO')
        self.assertTrue(mercado_pago.habilitado)
        self.assertEqual(secretos, {'access_token': TOKEN_MP})
        self.assertNotIn(TOKEN_MP, mercado_pago.credenciales_cifradas)

    @patch.dict('os.environ', {'TRANSBANK_ENVIRONMENT': 'PRODUCCION', 'TRANSBANK_WEBPAY_COMMERCE_CODE': '597099999999',
                               'TRANSBANK_WEBPAY_API_KEY': TOKEN_MP})
    def test_transbank_de_produccion_toma_las_credenciales_que_usaba_del_env(self):
        self.crear_config({'TRANSBANK': {'activo': True}})
        transbank, secretos = self.medio('TRANSBANK')
        self.assertEqual(transbank.datos, {'ambiente': 'PRODUCCION', 'commerce_code': '597099999999'})
        self.assertEqual(secretos, {'api_key': TOKEN_MP})

    def test_sin_configuracion_no_crea_medios(self):
        self.migrar(self.ANTERIOR)
        self.assertFalse(self.migrar(self.COPIA).get_model('ventas', 'MedioPago').objects.exists())
