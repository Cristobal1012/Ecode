from decimal import Decimal

from django.test import SimpleTestCase

from ecommerce.application.ventas import (
    CatalogoVariantes, ConfirmarPago, InventarioVariantes, PrepararPedido, RepositorioOrdenes,
    ResultadoPago,
)
from ecommerce.domain.ventas import (
    CantidadInvalida, EstadoPedido, ItemSolicitado, OrdenRegistrada, PedidoVacio, StockInsuficiente,
    SubtotalDesactualizado, VarianteCatalogo, VarianteNoDisponible,
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


class InventarioFalso(InventarioVariantes):
    def __init__(self, stock):
        self.stock = dict(stock)
        self.falla_en = None

    def descontar(self, producto_id, sku, cantidad):
        if (producto_id, sku) == self.falla_en:
            raise ConnectionError('inventario no disponible')
        if self.stock.get((producto_id, sku), 0) < cantidad:
            return False
        self.stock[(producto_id, sku)] -= cantidad
        return True

    def reponer(self, producto_id, sku, cantidad):
        self.stock[(producto_id, sku)] += cantidad


class RepositorioOrdenesFalso(RepositorioOrdenes):
    def __init__(self):
        self.ordenes = {}

    def agregar(self, orden_id, estado, items):
        self.ordenes[orden_id] = {
            'estado': EstadoPedido(estado), 'items': tuple(ItemSolicitado(*i) for i in items),
            'stock_descontado': False, 'motivo_revision': '', 'motivo_cancelacion': '',
        }
        return self.ordenes[orden_id]

    def obtener(self, orden_id):
        datos = self.ordenes.get(orden_id)
        return datos and OrdenRegistrada(orden_id, datos['estado'], datos['items'])

    def marcar_pagada_si_pendiente(self, orden_id):
        return self._cambiar_si_pendiente(orden_id, EstadoPedido.PAGADO)

    def cancelar_si_pendiente(self, orden_id, motivo):
        if not self._cambiar_si_pendiente(orden_id, EstadoPedido.CANCELADO):
            return False
        self.ordenes[orden_id]['motivo_cancelacion'] = motivo
        return True

    def registrar_stock_descontado(self, orden_id):
        self.ordenes[orden_id]['stock_descontado'] = True

    def marcar_revision(self, orden_id, motivo):
        self.ordenes[orden_id]['motivo_revision'] = motivo

    def _cambiar_si_pendiente(self, orden_id, estado):
        if self.ordenes[orden_id]['estado'] != EstadoPedido.PENDIENTE:
            return False
        self.ordenes[orden_id]['estado'] = estado
        return True


class ConfirmarPagoTests(SimpleTestCase):
    def setUp(self):
        self.ordenes = RepositorioOrdenesFalso()
        self.inventario = InventarioFalso({('camisa', 'CAMISA-S'): 2, ('gorro', 'GORRO-U'): 1})
        self.caso = ConfirmarPago(self.ordenes, self.inventario)
        self.orden = self.ordenes.agregar(1, 'PENDIENTE', [('camisa', 'CAMISA-S', 2),
                                                          ('gorro', 'GORRO-U', 1)])

    def test_pago_aprobado_descuenta_todas_las_lineas(self):
        self.assertEqual(self.caso.aprobar(1), ResultadoPago.PAGADO)
        self.assertEqual(self.orden['estado'], EstadoPedido.PAGADO)
        self.assertTrue(self.orden['stock_descontado'])
        self.assertEqual(self.orden['motivo_revision'], '')
        self.assertEqual(self.inventario.stock, {('camisa', 'CAMISA-S'): 0, ('gorro', 'GORRO-U'): 0})

    def test_confirmacion_repetida_no_descuenta_otra_vez(self):
        self.caso.aprobar(1)
        self.inventario.stock = {('camisa', 'CAMISA-S'): 5, ('gorro', 'GORRO-U'): 5}
        for estado in ('PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'):
            with self.subTest(estado=estado):
                self.orden['estado'] = EstadoPedido(estado)
                self.assertEqual(self.caso.aprobar(1), ResultadoPago.REPETIDO)
        self.assertEqual(self.inventario.stock, {('camisa', 'CAMISA-S'): 5, ('gorro', 'GORRO-U'): 5})

    def test_sin_stock_en_una_linea_repone_las_demas_y_va_a_revision(self):
        self.inventario.stock[('gorro', 'GORRO-U')] = 0
        self.assertEqual(self.caso.aprobar(1), ResultadoPago.EN_REVISION)
        self.assertEqual(self.orden['estado'], EstadoPedido.PAGADO)
        self.assertFalse(self.orden['stock_descontado'])
        self.assertEqual(self.orden['motivo_revision'], 'Pago confirmado sin stock para GORRO-U')
        self.assertEqual(self.inventario.stock, {('camisa', 'CAMISA-S'): 2, ('gorro', 'GORRO-U'): 0})

    def test_pago_aprobado_sobre_orden_cancelada_va_a_revision_sin_tocar_stock(self):
        self.orden['estado'] = EstadoPedido.CANCELADO
        self.assertEqual(self.caso.aprobar(1), ResultadoPago.EN_REVISION)
        self.assertEqual(self.orden['estado'], EstadoPedido.CANCELADO)
        self.assertEqual(self.orden['motivo_revision'], 'Pago aprobado sobre una orden en estado Cancelado')
        self.assertEqual(self.inventario.stock, {('camisa', 'CAMISA-S'): 2, ('gorro', 'GORRO-U'): 1})

    def test_error_del_inventario_repone_lo_descontado_y_va_a_revision(self):
        self.inventario.falla_en = ('gorro', 'GORRO-U')
        with self.assertRaises(ConnectionError):
            self.caso.aprobar(1)
        self.assertEqual(self.inventario.stock[('camisa', 'CAMISA-S')], 2)
        self.assertEqual(self.orden['motivo_revision'], 'No se pudo descontar el stock')
        self.assertFalse(self.orden['stock_descontado'])

    def test_orden_inexistente(self):
        self.assertEqual(self.caso.aprobar(99), ResultadoPago.NO_ENCONTRADA)
        self.assertFalse(self.caso.rechazar(99, 'Pago rechazado'))

    def test_rechazo_cancela_solo_ordenes_pendientes(self):
        self.assertTrue(self.caso.rechazar(1, 'Pago rechazado'))
        self.assertEqual(self.orden['estado'], EstadoPedido.CANCELADO)
        self.assertEqual(self.orden['motivo_cancelacion'], 'Pago rechazado')

        pagada = self.ordenes.agregar(2, 'PAGADO', [])
        self.assertFalse(self.caso.rechazar(2, 'Pago rechazado'))
        self.assertEqual(pagada['estado'], EstadoPedido.PAGADO)
