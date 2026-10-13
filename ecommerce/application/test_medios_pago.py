from django.test import SimpleTestCase

from ecommerce.application.medios_pago import ConfigurarMedioPago, MediosPagoDisponibles, RepositorioMediosPago
from ecommerce.domain.medios_pago import (
    CodigoMedioPago, DatosMedioPagoInvalidos, MedioPagoConfigurado, MedioPagoNoDisponible, enmascarar,
)

C = CodigoMedioPago

DATOS_BANCO = {'banco': 'Banco Estado', 'tipo_cuenta': 'Cuenta vista', 'numero_cuenta': '12345678',
               'rut_titular': '11.111.111-1', 'nombre_titular': 'Tienda QA', 'email': 'pagos@example.test'}


class RepositorioMediosPagoFalso(RepositorioMediosPago):
    def __init__(self):
        self.medios = {}

    def obtener(self, codigo):
        return self.medios.get(CodigoMedioPago(codigo), MedioPagoConfigurado(CodigoMedioPago(codigo)))

    def guardar(self, medio):
        self.medios[medio.codigo] = medio


class ConfigurarMedioPagoTests(SimpleTestCase):
    def setUp(self):
        self.repo = RepositorioMediosPagoFalso()
        self.caso = ConfigurarMedioPago(self.repo)

    def test_las_credenciales_se_muestran_enmascaradas(self):
        medio = self.caso.ejecutar('MERCADO_PAGO', True, {'access_token': 'APP_USR-123456789-abcd',
                                                         'webhook_secret': 'secreto-largo-9876'})
        self.assertEqual(medio.datos_visibles(), {'access_token': '••••abcd', 'webhook_secret': '••••9876'})
        # Una credencial corta no revela su final
        self.assertEqual(enmascarar('abc123'), '••••')

    def test_guardar_sin_tocar_la_credencial_enmascarada_la_conserva(self):
        self.caso.ejecutar('MERCADO_PAGO', True, {'access_token': 'APP_USR-123456789-abcd',
                                                 'webhook_secret': 'secreto-largo-9876'})
        medio = self.caso.ejecutar('MERCADO_PAGO', False, {'access_token': '••••abcd', 'webhook_secret': ''})
        self.assertEqual(medio.datos, {'access_token': 'APP_USR-123456789-abcd'})
        self.assertFalse(medio.habilitado)

    def test_campo_desconocido_u_opcion_invalida_se_rechaza_sin_guardar(self):
        with self.assertRaises(DatosMedioPagoInvalidos) as error:
            self.caso.ejecutar('TRANSFERENCIA', True, {'tipo_cuenta': 'Cuenta bitcoin', 'clave_banco': 'x'})
        self.assertEqual(set(error.exception.errores), {'tipo_cuenta', 'clave_banco'})
        self.assertEqual(self.repo.medios, {})


class MediosPagoDisponiblesTests(SimpleTestCase):
    """RN-02: solo se ofrecen y aceptan los medios habilitados y configurados."""

    def setUp(self):
        self.repo = RepositorioMediosPagoFalso()
        self.casos = MediosPagoDisponibles(self.repo)

    def guardar(self, codigo, habilitado, datos):
        self.repo.guardar(MedioPagoConfigurado(C(codigo), habilitado, datos))

    def test_solo_transbank_y_transferencia_no_ofrecen_ni_aceptan_mercado_pago(self):
        self.guardar('TRANSBANK', True, {'ambiente': 'INTEGRACION'})
        self.guardar('TRANSFERENCIA', True, DATOS_BANCO)
        self.assertEqual(self.casos.disponibles(), [C.TRANSBANK, C.TRANSFERENCIA])
        with self.assertRaises(MedioPagoNoDisponible):
            self.casos.exigir('MERCADO_PAGO')
        self.assertEqual(self.casos.exigir('TRANSFERENCIA').datos['banco'], 'Banco Estado')

    def test_habilitado_pero_incompleto_no_se_ofrece(self):
        self.guardar('MERCADO_PAGO', True, {'access_token': 'APP_USR-123456789-abcd'})
        self.guardar('TRANSFERENCIA', True, {**DATOS_BANCO, 'numero_cuenta': ''})
        self.assertEqual(self.casos.disponibles(), [])
        self.assertEqual(self.repo.obtener('MERCADO_PAGO').faltantes, ['webhook_secret'])

    def test_completo_pero_deshabilitado_no_se_ofrece(self):
        self.guardar('TRANSFERENCIA', False, DATOS_BANCO)
        self.assertEqual(self.casos.disponibles(), [])

    def test_transbank_en_produccion_exige_credenciales_y_en_integracion_no(self):
        self.guardar('TRANSBANK', True, {'ambiente': 'PRODUCCION', 'commerce_code': '597012345678'})
        self.assertEqual(self.repo.obtener('TRANSBANK').faltantes, ['api_key'])
        self.assertEqual(self.casos.disponibles(), [])
        self.guardar('TRANSBANK', True, {'ambiente': 'INTEGRACION'})
        self.assertEqual(self.casos.disponibles(), [C.TRANSBANK])

    def test_medio_inexistente_no_esta_disponible(self):
        for codigo in ('PAYPAL', '', 'transbank'):
            with self.subTest(codigo=codigo), self.assertRaises(MedioPagoNoDisponible):
                self.casos.exigir(codigo)
