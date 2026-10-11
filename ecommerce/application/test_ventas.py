from decimal import Decimal

from django.test import SimpleTestCase

from ecommerce.application.ventas import CatalogoVariantes, PrepararPedido
from ecommerce.domain.ventas import (
    CantidadInvalida, ItemSolicitado, PedidoVacio, StockInsuficiente, SubtotalDesactualizado,
    VarianteCatalogo, VarianteNoDisponible,
)


class CatalogoFalso(CatalogoVariantes):
    def __init__(self, variantes):
        self.variantes = variantes

    def obtener(self, producto_id, sku):
        return self.variantes.get((producto_id, sku))


CATALOGO = CatalogoFalso({
    ('camisa', 'CAMISA-S'): VarianteCatalogo('Camisa S', Decimal('20990.00'), 2, True),
    ('camisa', 'CAMISA-M'): VarianteCatalogo('Camisa M', Decimal('20990.00'), 0, True),
    ('gorro', 'GORRO-U'): VarianteCatalogo('Gorro', Decimal('5000.00'), 10, False),
})


def preparar(items, subtotal):
    return PrepararPedido(CATALOGO).ejecutar(
        [ItemSolicitado(*item) for item in items], Decimal(subtotal))


class PrepararPedidoTests(SimpleTestCase):
    def test_usa_nombre_y_precio_del_catalogo(self):
        pedido = preparar([('camisa', 'CAMISA-S', 2)], '41980')
        linea, = pedido.lineas
        self.assertEqual(linea.nombre, 'Camisa S')
        self.assertEqual(linea.precio_unitario, Decimal('20990.00'))
        self.assertEqual(pedido.subtotal, Decimal('41980'))

    def test_variante_sin_stock_se_rechaza_aunque_otra_del_mismo_producto_tenga(self):
        with self.assertRaises(StockInsuficiente) as error:
            preparar([('camisa', 'CAMISA-M', 1)], '20990')
        self.assertEqual(error.exception.disponible, 0)
        self.assertEqual(len(preparar([('camisa', 'CAMISA-S', 1)], '20990').lineas), 1)

    def test_cantidad_mayor_al_stock_se_rechaza(self):
        with self.assertRaises(StockInsuficiente) as error:
            preparar([('camisa', 'CAMISA-S', 3)], '62970')
        self.assertEqual(error.exception.disponible, 2)

    def test_lineas_repetidas_del_mismo_sku_suman_contra_el_stock(self):
        with self.assertRaises(StockInsuficiente):
            preparar([('camisa', 'CAMISA-S', 2), ('camisa', 'CAMISA-S', 1)], '62970')

    def test_variante_inexistente_o_producto_no_publicado_no_se_vende(self):
        for item in (('camisa', 'NO-EXISTE', 1), ('gorro', 'GORRO-U', 1)):
            with self.subTest(item=item), self.assertRaises(VarianteNoDisponible):
                preparar([item], '5000')

    def test_subtotal_distinto_al_vigente_se_rechaza(self):
        with self.assertRaises(SubtotalDesactualizado) as error:
            preparar([('camisa', 'CAMISA-S', 1)], '1')
        self.assertEqual(error.exception.subtotal_vigente, Decimal('20990.00'))
        self.assertEqual(error.exception.lineas[0].precio_unitario, Decimal('20990.00'))

    def test_carrito_vacio_o_cantidad_cero_se_rechaza(self):
        with self.assertRaises(PedidoVacio):
            preparar([], '0')
        with self.assertRaises(CantidadInvalida):
            preparar([('camisa', 'CAMISA-S', 0)], '0')
