from django.test import SimpleTestCase

from ecommerce.domain.promociones import MONTO_FIJO, PORCENTAJE, PromocionInvalida, validar_promocion


class ValidarPromocionTests(SimpleTestCase):
    """RF-04.1: lo que se puede guardar como código de descuento."""

    def test_normaliza_el_codigo_y_acepta_los_valores_razonables(self):
        self.assertEqual(validar_promocion(' verano-20 ', PORCENTAJE, 100, None), 'VERANO-20')
        self.assertEqual(validar_promocion('PASCUA_5000', MONTO_FIJO, 5000, 30000), 'PASCUA_5000')
        self.assertEqual(validar_promocion('AÑONUEVO', PORCENTAJE, '12.5', None), 'AÑONUEVO')

    def test_cada_error_queda_en_su_campo(self):
        with self.assertRaises(PromocionInvalida) as error:
            validar_promocion('dos palabras', PORCENTAJE, 101, 0)
        self.assertEqual(set(error.exception.errores), {'codigo', 'valor_descuento', 'umbral_envio_gratis'})

    def test_rechaza_codigo_vacio_o_largo_y_montos_imposibles(self):
        for args in (('', PORCENTAJE, 10, None), ('A' * 51, PORCENTAJE, 10, None), ('X', PORCENTAJE, None, None),
                     ('X', MONTO_FIJO, '1000.5', None), ('X', MONTO_FIJO, -1, None)):
            with self.subTest(args=args), self.assertRaises(PromocionInvalida):
                validar_promocion(*args)
