from decimal import Decimal

from django.test import SimpleTestCase

from ecommerce.domain.logistica import (
    ENTREGA_COORDINADA, RETIRO_LOCAL, EntregaNoHabilitada, EntregasDeLaTienda,
)


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
