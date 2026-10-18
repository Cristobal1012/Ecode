from django.test import SimpleTestCase

from ecommerce.application.chilexpress import ConfigurarChilexpress, RepositorioCredencialesChilexpress
from ecommerce.domain.logistica import CredencialesChilexpress, CredencialesChilexpressInvalidas

COTIZADOR = 'llave-cotizador-0001'
ENVIOS = 'llave-envios-0002'


class RepositorioCredencialesFalso(RepositorioCredencialesChilexpress):
    def __init__(self, credenciales=None):
        self.credenciales = credenciales or CredencialesChilexpress()

    def obtener(self):
        return self.credenciales

    def guardar(self, credenciales):
        self.credenciales = credenciales


class CredencialesChilexpressTests(SimpleTestCase):
    """RNF-03: las llaves de Chilexpress se cargan en el panel y nunca se muestran completas."""

    def test_sin_la_llave_del_cotizador_no_estan_configuradas(self):
        self.assertEqual(CredencialesChilexpress().faltantes, ['cotizador'])
        self.assertFalse(CredencialesChilexpress(envios=ENVIOS).configuradas)
        self.assertTrue(CredencialesChilexpress(cotizador=COTIZADOR).configuradas)

    def test_sin_llaves_de_coberturas_o_envios_se_usa_la_del_cotizador(self):
        solo_cotizador = CredencialesChilexpress(cotizador=COTIZADOR)
        self.assertEqual((solo_cotizador.llave_coberturas, solo_cotizador.llave_envios), (COTIZADOR, COTIZADOR))
        completas = CredencialesChilexpress(cotizador=COTIZADOR, coberturas='llave-cob-0003', envios=ENVIOS)
        self.assertEqual((completas.llave_coberturas, completas.llave_envios), ('llave-cob-0003', ENVIOS))

    def test_el_panel_solo_ve_los_ultimos_4_caracteres(self):
        visibles = CredencialesChilexpress(cotizador=COTIZADOR, envios=ENVIOS).visibles()
        self.assertEqual(visibles, {'cotizador': '••••0001', 'coberturas': '', 'envios': '••••0002'})


class ConfigurarChilexpressTests(SimpleTestCase):
    def setUp(self):
        self.repositorio = RepositorioCredencialesFalso(CredencialesChilexpress(cotizador=COTIZADOR, envios=ENVIOS))
        self.caso = ConfigurarChilexpress(self.repositorio)

    def test_una_llave_que_vuelve_enmascarada_o_no_llega_se_conserva(self):
        self.caso.ejecutar({'cotizador': '••••0001'})
        self.assertEqual(self.repositorio.credenciales,
                         CredencialesChilexpress(cotizador=COTIZADOR, envios=ENVIOS))

    def test_una_llave_nueva_reemplaza_y_una_vacia_borra(self):
        guardadas = self.caso.ejecutar({'cotizador': ' llave-nueva-9999 ', 'envios': ''})
        self.assertEqual(guardadas, CredencialesChilexpress(cotizador='llave-nueva-9999'))
        self.assertEqual(self.repositorio.credenciales, guardadas)

    def test_un_campo_desconocido_se_rechaza_sin_guardar(self):
        with self.assertRaises(CredencialesChilexpressInvalidas) as error:
            self.caso.ejecutar({'cotizador': 'llave-nueva-9999', 'tcc': '123'})
        self.assertIn('tcc', error.exception.errores)
        self.assertEqual(self.repositorio.credenciales.cotizador, COTIZADOR)
