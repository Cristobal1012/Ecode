from decimal import Decimal

from django.test import SimpleTestCase

from ecommerce.application.ventas import (
    CambiarEstadoPedido, CatalogoVariantes, ConfirmarPago, InventarioVariantes, OrdenNoEncontrada,
    PedidoModificado, PrepararPedido, RepositorioOrdenes, ResultadoPago,
)
from ecommerce.domain.ventas import (
    CantidadInvalida, EstadoPedido, ItemSolicitado, OrdenRegistrada, PedidoVacio, StockInsuficiente,
    SubtotalDesactualizado, TransicionNoPermitida, VarianteCatalogo, VarianteNoDisponible,
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
        # Simula que otro proceso cambia la orden entre la lectura y la escritura
        self.cambio_concurrente = None

    def agregar(self, orden_id, estado, items, stock_descontado=False):
        self.ordenes[orden_id] = {
            'estado': EstadoPedido(estado), 'items': tuple(ItemSolicitado(*i) for i in items),
            'stock_descontado': stock_descontado, 'motivo_revision': '', 'motivo_cancelacion': '',
        }
        return self.ordenes[orden_id]

    def obtener(self, orden_id):
        datos = self.ordenes.get(orden_id)
        return datos and OrdenRegistrada(orden_id, datos['estado'], datos['items'],
                                         datos['stock_descontado'])

    def cambiar_estado(self, orden_id, desde, hacia, motivo_cancelacion=''):
        datos = self.ordenes[orden_id]
        if self.cambio_concurrente:
            datos['estado'], self.cambio_concurrente = self.cambio_concurrente, None
        if datos['estado'] != desde:
            return False
        datos['estado'] = EstadoPedido(hacia)
        if motivo_cancelacion:
            datos['motivo_cancelacion'] = motivo_cancelacion
        return True

    def registrar_stock_descontado(self, orden_id, descontado=True):
        self.ordenes[orden_id]['stock_descontado'] = descontado

    def marcar_revision(self, orden_id, motivo):
        self.ordenes[orden_id]['motivo_revision'] = motivo


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


class CambiarEstadoPedidoTests(SimpleTestCase):
    def setUp(self):
        self.ordenes = RepositorioOrdenesFalso()
        self.inventario = InventarioFalso({('camisa', 'CAMISA-S'): 5})
        self.caso = CambiarEstadoPedido(self.ordenes, self.inventario)

    def orden(self, estado, stock_descontado=False):
        return self.ordenes.agregar(1, estado, [('camisa', 'CAMISA-S', 2)], stock_descontado)

    def stock(self):
        return self.inventario.stock[('camisa', 'CAMISA-S')]

    def test_avance_normal_no_toca_el_stock(self):
        orden = self.orden('PAGADO', stock_descontado=True)
        self.assertEqual(self.caso.ejecutar(1, 'EN_PREPARACION'), EstadoPedido.EN_PREPARACION)
        self.assertEqual(orden['estado'], EstadoPedido.EN_PREPARACION)
        self.assertEqual(self.stock(), 5)

    def test_transicion_no_permitida_no_cambia_nada(self):
        orden = self.orden('CANCELADO')
        with self.assertRaises(TransicionNoPermitida):
            self.caso.ejecutar(1, 'PAGADO')
        self.assertEqual(orden['estado'], EstadoPedido.CANCELADO)
        self.assertEqual(self.stock(), 5)

    def test_pagar_a_mano_descuenta_stock_como_un_pago_en_linea(self):
        orden = self.orden('PENDIENTE')
        self.assertEqual(self.caso.ejecutar(1, 'PAGADO'), EstadoPedido.PAGADO)
        self.assertEqual(orden['estado'], EstadoPedido.PAGADO)
        self.assertTrue(orden['stock_descontado'])
        self.assertEqual(self.stock(), 3)

    def test_pagar_a_mano_sin_stock_deja_la_orden_en_revision(self):
        self.inventario.stock[('camisa', 'CAMISA-S')] = 1
        orden = self.orden('PENDIENTE')
        self.caso.ejecutar(1, 'PAGADO')
        self.assertEqual(orden['estado'], EstadoPedido.PAGADO)
        self.assertEqual(orden['motivo_revision'], 'Pago confirmado sin stock para CAMISA-S')
        self.assertEqual(self.stock(), 1)

    def test_cancelar_repone_el_stock_descontado(self):
        for estado in ('PAGADO', 'EN_PREPARACION'):
            with self.subTest(estado=estado):
                self.inventario.stock[('camisa', 'CAMISA-S')] = 3
                orden = self.orden(estado, stock_descontado=True)
                self.caso.ejecutar(1, 'CANCELADO')
                self.assertEqual(orden['estado'], EstadoPedido.CANCELADO)
                self.assertEqual(orden['motivo_cancelacion'], 'Cancelado por el administrador')
                self.assertFalse(orden['stock_descontado'])
                self.assertEqual(self.stock(), 5)

    def test_cancelar_sin_stock_descontado_no_repone(self):
        # PENDIENTE, o PAGADO en revisión porque faltó stock al confirmar
        for estado in ('PENDIENTE', 'PAGADO'):
            with self.subTest(estado=estado):
                self.orden(estado, stock_descontado=False)
                self.caso.ejecutar(1, 'CANCELADO')
                self.assertEqual(self.stock(), 5)

    def test_cambio_concurrente_se_rechaza_sin_reponer_dos_veces(self):
        orden = self.orden('PAGADO', stock_descontado=True)
        self.ordenes.cambio_concurrente = EstadoPedido.CANCELADO
        with self.assertRaises(PedidoModificado):
            self.caso.ejecutar(1, 'CANCELADO')
        self.assertEqual(self.stock(), 5)
        self.assertTrue(orden['stock_descontado'])

    def test_orden_inexistente(self):
        with self.assertRaises(OrdenNoEncontrada):
            self.caso.ejecutar(99, 'CANCELADO')
