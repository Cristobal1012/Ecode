from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

ANTERIOR = [('ventas', '0012_configuracionglobal_dpto_casa_origen')]
REVISION = [('ventas', '0013_revision_y_stock_descontado')]


class MigracionRevisionYStockTests(TransactionTestCase):
    """0013 completa las órdenes existentes según las decisiones de AGENTS.md §4.1."""

    def migrar(self, destino):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(destino)
        return executor.loader.project_state(destino).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_marca_stock_descontado_en_pagadas_y_cancela_las_rechazadas(self):
        OrdenCompra = self.migrar(ANTERIOR).get_model('ventas', 'OrdenCompra')
        ids = {
            estado: OrdenCompra.objects.create(
                estado=estado, metodo_pago='TRANSBANK', direccion_envio_snapshot={},
                subtotal=1000, costo_envio=0, total_final=1000,
            ).id
            for estado in ('PENDIENTE', 'PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO',
                           'CANCELADO', 'RECHAZADO')
        }

        OrdenCompra = self.migrar(REVISION).get_model('ventas', 'OrdenCompra')

        ordenes = {estado: OrdenCompra.objects.get(id=id_) for estado, id_ in ids.items()}
        for estado in ('PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'):
            self.assertTrue(ordenes[estado].stock_descontado, estado)
        for estado in ('PENDIENTE', 'CANCELADO', 'RECHAZADO'):
            self.assertFalse(ordenes[estado].stock_descontado, estado)
        self.assertEqual(ordenes['RECHAZADO'].estado, 'CANCELADO')
        self.assertEqual(ordenes['RECHAZADO'].motivo_cancelacion, 'Pago rechazado')
        self.assertEqual(ordenes['CANCELADO'].motivo_cancelacion, '')
        self.assertFalse(any(orden.requiere_revision for orden in ordenes.values()))
