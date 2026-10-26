from decimal import Decimal

from django.test import SimpleTestCase

from ecommerce.domain.logistica import (
    AVISO_ENTREGA_COORDINADA, ENTREGA_COORDINADA, RETIRO_LOCAL, EntregaNoHabilitada, EntregasDeLaTienda,
    aviso_entrega_coordinada, error_direccion_entrega, estado_entrega_de_la_tienda,
)
from ecommerce.domain.ventas import EstadoPedido


class SeguimientoEntregaDeLaTiendaTests(SimpleTestCase):
    """RF-02.4: sin courier, el comprador ve el avance según el estado del pedido."""

    def test_el_estado_sigue_al_pedido_y_cambia_al_final_segun_la_entrega(self):
        for proveedor, enviado, entregado in (
            (ENTREGA_COORDINADA, 'La tienda coordinará la entrega contigo', 'Entregado'),
            (RETIRO_LOCAL, 'Listo para retirar', 'Retirado'),
        ):
            with self.subTest(proveedor=proveedor):
                self.assertEqual(estado_entrega_de_la_tienda(proveedor, EstadoPedido.PAGADO), 'Pago confirmado')
                self.assertEqual(estado_entrega_de_la_tienda(proveedor, 'EN_PREPARACION'), 'En preparación')
                self.assertEqual(estado_entrega_de_la_tienda(proveedor, EstadoPedido.ENVIADO), enviado)
                self.assertEqual(estado_entrega_de_la_tienda(proveedor, EstadoPedido.ENTREGADO), entregado)
                self.assertEqual(estado_entrega_de_la_tienda(proveedor, 'CANCELADO'), 'Cancelado')

    def test_el_aviso_usa_las_instrucciones_del_admin_o_el_aviso_por_defecto(self):
        self.assertEqual(aviso_entrega_coordinada('  Te escribimos por WhatsApp. '), 'Te escribimos por WhatsApp.')
        self.assertEqual(aviso_entrega_coordinada(''), AVISO_ENTREGA_COORDINADA)
        self.assertEqual(aviso_entrega_coordinada(None), AVISO_ENTREGA_COORDINADA)


class EntregasDeLaTiendaTests(SimpleTestCase):
    def test_el_retiro_en_local_es_gratis(self):
        self.assertEqual(EntregasDeLaTienda(retiro_activo=True).costo(RETIRO_LOCAL), Decimal('0'))

    def test_la_entrega_coordinada_cobra_lo_que_definio_el_admin(self):
        entregas = EntregasDeLaTienda(coordinada_activa=True, costo_coordinada=Decimal('2500'))
        self.assertEqual(entregas.costo(ENTREGA_COORDINADA), Decimal('2500'))

    def test_la_entrega_coordinada_puede_ser_gratis(self):
        self.assertEqual(EntregasDeLaTienda(coordinada_activa=True).costo(ENTREGA_COORDINADA), Decimal('0'))

    def test_rechaza_la_entrega_que_el_admin_no_activo(self):
        # Activar una no habilita la otra
        for entregas, proveedor in (
            (EntregasDeLaTienda(coordinada_activa=True), RETIRO_LOCAL),
            (EntregasDeLaTienda(retiro_activo=True), ENTREGA_COORDINADA),
        ):
            with self.subTest(proveedor=proveedor), self.assertRaises(EntregaNoHabilitada):
                entregas.costo(proveedor)

    def test_un_transportista_no_es_una_entrega_de_la_tienda(self):
        with self.assertRaises(EntregaNoHabilitada):
            EntregasDeLaTienda(retiro_activo=True, coordinada_activa=True).costo('CHILEXPRESS')


class DireccionEntregaTests(SimpleTestCase):
    """RF-02.3: la dirección que pide cada forma de entrega."""

    def test_el_retiro_en_local_no_pide_direccion(self):
        self.assertIsNone(error_direccion_entrega(RETIRO_LOCAL, {}))

    def test_la_entrega_coordinada_puede_ir_sin_direccion(self):
        for direccion in ({}, None, {'calle': ' ', 'comuna': ''}, {'dpto_casa': 'Casa 2'}):
            with self.subTest(direccion=direccion):
                self.assertIsNone(error_direccion_entrega(ENTREGA_COORDINADA, direccion))

    def test_la_entrega_coordinada_con_direccion_exige_calle_y_comuna(self):
        self.assertIsNone(error_direccion_entrega(ENTREGA_COORDINADA, {'calle': 'Los Aromos', 'comuna': 'Ñuñoa'}))
        for direccion in ({'calle': 'Los Aromos'}, {'comuna': 'Ñuñoa'}, {'numero': '1550'}):
            with self.subTest(direccion=direccion):
                self.assertIn('calle y la comuna', error_direccion_entrega(ENTREGA_COORDINADA, direccion))

    def test_un_transportista_exige_la_comuna(self):
        self.assertIsNone(error_direccion_entrega('CHILEXPRESS', {'comuna': 'Ñuñoa'}))
        for direccion in ({}, None, 'Ñuñoa', {'calle': 'Los Aromos'}):
            with self.subTest(direccion=direccion):
                self.assertEqual(error_direccion_entrega('CHILEXPRESS', direccion), 'Se requiere la comuna de destino.')
