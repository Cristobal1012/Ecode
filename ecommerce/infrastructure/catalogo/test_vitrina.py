from datetime import datetime, timedelta, timezone

from django.urls import reverse
from rest_framework.test import APITestCase

from ecommerce.infrastructure.ventas.models import DetalleOrden, OrdenCompra

from .documents import Producto, Variante
from .tests import usar_mongo_de_prueba


class VitrinaAPITests(APITestCase):
    """RF-01.1: la landing recibe los más vendidos (solo pedidos pagados) y los últimos agregados."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        usar_mongo_de_prueba(cls)

    def setUp(self):
        Producto._get_collection().delete_many({})
        ahora = datetime.now(timezone.utc)
        # Del más viejo (dias=6) al más nuevo (dias=0)
        self.ids = {}
        for dias, nombre, publicado in ((6, 'Vendido', True), (5, 'Pendiente', True), (4, 'Cancelado', True),
                                        (3, 'Oculto', False), (2, 'Medio', True), (1, 'Nuevo', True),
                                        (0, 'Nuevisimo', True)):
            producto = Producto(nombre=nombre, categoria='Arte', publicado=publicado,
                                fecha_creacion=ahora - timedelta(days=dias),
                                variantes=[Variante(sku=f'{nombre}-1', precio=10000, stock=5)]).save()
            self.ids[nombre] = str(producto.id)

        self.vender('Vendido', 5, 'PAGADO')
        self.vender('Oculto', 50, 'ENTREGADO')
        self.vender('Pendiente', 10, 'PENDIENTE')
        self.vender('Cancelado', 9, 'CANCELADO')

    def vender(self, nombre, cantidad, estado):
        orden = OrdenCompra.objects.create(
            email_invitado='comprador@example.test', estado=estado, direccion_envio_snapshot={},
            subtotal=10000 * cantidad, costo_envio=0, total_final=10000 * cantidad, proveedor_logistico='RETIRO_LOCAL')
        DetalleOrden.objects.create(orden=orden, producto_mongo_id=self.ids[nombre], variante_sku=f'{nombre}-1',
                                    nombre_producto_snapshot=nombre, precio_unitario_snapshot=10000, cantidad=cantidad)

    def nombres(self, productos):
        return [p['nombre'] for p in productos]

    def test_mas_vendidos_cuenta_solo_pedidos_pagados_y_productos_publicados(self):
        response = self.client.get(reverse('vitrina'))

        self.assertEqual(response.status_code, 200)
        mas_vendidos = self.nombres(response.data['mas_vendidos'])
        # El único vendido y publicado va primero; el resto se completa (hay pocas ventas)
        self.assertEqual(mas_vendidos[0], 'Vendido')
        self.assertEqual(len(mas_vendidos), 4)
        self.assertNotIn('Oculto', mas_vendidos)

    def test_ultimos_agregados_son_los_publicados_mas_nuevos(self):
        recientes = self.nombres(self.client.get(reverse('vitrina')).data['recientes'])

        self.assertEqual(recientes, ['Nuevisimo', 'Nuevo', 'Medio', 'Cancelado'])

    def test_entrega_los_datos_que_usan_las_tarjetas_del_catalogo(self):
        producto = self.client.get(reverse('vitrina')).data['recientes'][0]

        for campo in ('id', 'nombre', 'categoria', 'imagenes', 'variantes'):
            self.assertIn(campo, producto)
