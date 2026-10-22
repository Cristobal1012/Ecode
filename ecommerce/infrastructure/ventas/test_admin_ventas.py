from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model

# Carga el modelo de usuario dinámicamente para evitar el error de importación
Usuario = get_user_model()

# IMPORTANTE: Asegúrate de que esta línea sea idéntica a la importación de OrdenCompra en tu views.py
from .models import OrdenCompra 

class AdminOrdenCompraListViewTests(APITestCase):
    def setUp(self):
        self.admin_user = Usuario.objects.create_superuser(
            email='admin@ecode.test', password='password123'
        )
        self.client.force_authenticate(user=self.admin_user)
        self.url = '/api/ventas/admin/ordenes/' 

        for _ in range(21):
            OrdenCompra.objects.create(
                estado='PENDIENTE', 
                requiere_revision=False, 
                direccion_envio_snapshot="Dirección de prueba",
                total_final=10000,
                subtotal=10000,
                costo_envio=0
            )
        
        OrdenCompra.objects.create(
            estado='PAGADO', 
            requiere_revision=False, 
            direccion_envio_snapshot="Dirección de prueba",
            total_final=10000,
            subtotal=10000,
            costo_envio=0
        )
        OrdenCompra.objects.create(
            estado='DESPACHADO', 
            requiere_revision=True, 
            direccion_envio_snapshot="Dirección de prueba",
            total_final=10000,
            subtotal=10000,
            costo_envio=0
        )
        OrdenCompra.objects.create(
            estado='PENDIENTE', 
            requiere_revision=True, 
            direccion_envio_snapshot="Dirección de prueba",
            total_final=10000,
            subtotal=10000,
            costo_envio=0
        )

    def test_paginacion_devuelve_maximo_20_elementos(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 20)
        self.assertEqual(response.data['count'], 24)

    def test_filtro_individual_por_estado(self):
        response = self.client.get(self.url, {'estado': 'PAGADO'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data['results']), 0)
        for orden in response.data['results']:
            self.assertEqual(orden['estado'], 'PAGADO')

    def test_filtro_individual_requiere_revision(self):
        response = self.client.get(self.url, {'requiere_revision': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for orden in response.data['results']:
            self.assertTrue(orden['requiere_revision'])

    def test_filtros_combinados_estado_y_revision(self):
        response = self.client.get(self.url, {'estado': 'PENDIENTE', 'requiere_revision': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for orden in response.data['results']:
            self.assertEqual(orden['estado'], 'PENDIENTE')
            self.assertTrue(orden['requiere_revision'])

    def test_filtro_estado_invalido_devuelve_lista_vacia(self):
        response = self.client.get(self.url, {'estado': 'ESTADO_INVENTADO'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 0)
        self.assertEqual(response.data['count'], 0)