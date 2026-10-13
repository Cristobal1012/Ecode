from django.test import SimpleTestCase

from ecommerce.domain.ventas import (
    EstadoPedido, OrdenTransporteNoPermitida, TransicionNoPermitida, paginas_legales_faltantes,
    transiciones_desde, validar_generacion_orden_transporte, validar_transicion,
)

E = EstadoPedido

# AGENTS.md §9, escrita a mano para no repetir la tabla del dominio
PERMITIDAS = {
    (E.PENDIENTE, E.PAGADO), (E.PENDIENTE, E.CANCELADO),
    (E.PAGADO, E.EN_PREPARACION), (E.PAGADO, E.CANCELADO),
    (E.EN_PREPARACION, E.ENVIADO), (E.EN_PREPARACION, E.CANCELADO),
    (E.ENVIADO, E.ENTREGADO),
}


class MaquinaEstadosPedidoTests(SimpleTestCase):
    def test_solo_se_permiten_las_transiciones_de_la_tabla(self):
        for actual in EstadoPedido:
            for nuevo in EstadoPedido:
                with self.subTest(actual=actual, nuevo=nuevo):
                    if (actual, nuevo) in PERMITIDAS:
                        self.assertEqual(validar_transicion(actual, nuevo), nuevo)
                    else:
                        with self.assertRaises(TransicionNoPermitida):
                            validar_transicion(actual, nuevo)

    def test_transiciones_desde_cada_estado_en_orden_del_flujo(self):
        for actual in EstadoPedido:
            with self.subTest(actual=actual):
                esperadas = [nuevo for nuevo in EstadoPedido if (actual, nuevo) in PERMITIDAS]
                self.assertEqual(transiciones_desde(actual), esperadas)
        self.assertEqual(transiciones_desde('PAGADO'), [E.EN_PREPARACION, E.CANCELADO])
        self.assertEqual(transiciones_desde('RECHAZADO'), [])

    def test_acepta_los_codigos_como_texto(self):
        self.assertIs(validar_transicion('PAGADO', 'EN_PREPARACION'), E.EN_PREPARACION)

    def test_estado_desconocido_se_rechaza(self):
        for actual, nuevo in (('RECHAZADO', 'PAGADO'), ('PENDIENTE', 'RECHAZADO')):
            with self.subTest(actual=actual, nuevo=nuevo):
                with self.assertRaises(TransicionNoPermitida):
                    validar_transicion(actual, nuevo)

    def test_el_mensaje_usa_los_nombres_de_la_interfaz(self):
        with self.assertRaisesMessage(TransicionNoPermitida,
                                      'Un pedido Cancelado no puede pasar a Pagado.'):
            validar_transicion(E.CANCELADO, E.PAGADO)


class GeneracionOrdenTransporteTests(SimpleTestCase):
    def test_solo_pedidos_pagados_sin_despachar_y_sin_revision(self):
        for estado in (E.PAGADO, E.EN_PREPARACION):
            validar_generacion_orden_transporte(estado, requiere_revision=False)
        for estado in (E.PENDIENTE, E.ENVIADO, E.ENTREGADO, E.CANCELADO):
            with self.subTest(estado=estado), self.assertRaises(OrdenTransporteNoPermitida):
                validar_generacion_orden_transporte(estado, requiere_revision=False)
        with self.assertRaisesMessage(OrdenTransporteNoPermitida, 'Resuelve la revisión'):
            validar_generacion_orden_transporte(E.PAGADO, requiere_revision=True)


class PaginasLegalesParaVenderTests(SimpleTestCase):
    def test_faltan_terminos_y_privacidad_hasta_publicarlas(self):
        self.assertEqual(paginas_legales_faltantes([]), ['TERMINOS', 'PRIVACIDAD'])
        self.assertEqual(paginas_legales_faltantes(['REEMBOLSOS', 'PRIVACIDAD']), ['TERMINOS'])
        self.assertEqual(paginas_legales_faltantes(['PRIVACIDAD', 'TERMINOS']), [])
