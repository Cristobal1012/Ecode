from django.db import IntegrityError, transaction
from django.test import TestCase

from ecommerce.domain.ventas import EstadoPedido

from .models import OrdenCompra, Resena, ResenaProducto
from .repositorio_ordenes import DjangoRepositorioOrdenes


def crear_orden(estado='ENVIADO'):
    return OrdenCompra.objects.create(
        email_invitado='ana@example.test', metodo_pago='TRANSBANK', estado=estado,
        direccion_envio_snapshot={'comuna': 'SANTIAGO'}, subtotal=10000, costo_envio=0, total_final=10000)


class FechaEntregaTests(TestCase):
    def test_se_registra_al_pasar_a_entregado(self):
        orden = crear_orden('ENVIADO')
        self.assertTrue(DjangoRepositorioOrdenes().cambiar_estado(orden.id, EstadoPedido.ENVIADO,
                                                                  EstadoPedido.ENTREGADO))
        orden.refresh_from_db()
        self.assertIsNotNone(orden.fecha_entrega)

    def test_los_demas_cambios_de_estado_no_la_tocan(self):
        orden = crear_orden('EN_PREPARACION')
        DjangoRepositorioOrdenes().cambiar_estado(orden.id, EstadoPedido.EN_PREPARACION, EstadoPedido.ENVIADO)
        orden.refresh_from_db()
        self.assertIsNone(orden.fecha_entrega)

    def test_un_cambio_rechazado_no_la_registra(self):
        # Otro proceso ya cambió el estado: el UPDATE condicional no aplica nada
        orden = crear_orden('CANCELADO')
        self.assertFalse(DjangoRepositorioOrdenes().cambiar_estado(orden.id, EstadoPedido.ENVIADO,
                                                                   EstadoPedido.ENTREGADO))
        orden.refresh_from_db()
        self.assertIsNone(orden.fecha_entrega)


class ModelosResenaTests(TestCase):
    def setUp(self):
        self.orden = crear_orden('ENTREGADO')

    def crear_resena(self, **campos):
        return Resena.objects.create(**{'orden': self.orden, 'estrellas': 5, 'nombre_publico': 'Ana P.', **campos})

    def test_una_resena_nueva_queda_pendiente(self):
        self.assertEqual(self.crear_resena().estado, 'PENDIENTE')

    def test_una_sola_resena_por_pedido(self):
        self.crear_resena()
        with self.assertRaises(IntegrityError):
            self.crear_resena()

    def test_la_base_rechaza_estrellas_fuera_de_1_a_5(self):
        for estrellas in (0, 6):
            with self.subTest(estrellas=estrellas), self.assertRaises(IntegrityError), transaction.atomic():
                self.crear_resena(estrellas=estrellas)

    def test_cada_producto_una_vez_por_resena_y_con_estrellas_validas(self):
        resena = self.crear_resena()
        ResenaProducto.objects.create(resena=resena, producto_mongo_id='taza', producto_nombre='Taza', estrellas=4)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ResenaProducto.objects.create(resena=resena, producto_mongo_id='taza', producto_nombre='Taza',
                                          estrellas=3)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ResenaProducto.objects.create(resena=resena, producto_mongo_id='plato', producto_nombre='Plato',
                                          estrellas=0)
