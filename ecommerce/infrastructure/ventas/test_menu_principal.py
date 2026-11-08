from django.urls import reverse
from rest_framework.test import APITestCase
from ecommerce.infrastructure.usuarios.tests.factories import create_user
from .models import ConfiguracionGlobal
from .serializers import ConfiguracionNegocioSerializer


class MenuPrincipalTests(APITestCase):
    def setUp(self):
        self.config = ConfiguracionGlobal.objects.create(pk=1, nombre_tienda='Tienda')
        self.orden = ['inicio', 'catalogo', 'nosotros', 'sobre_mi', 'cotizar']

    def test_validacion_y_normalizacion(self):
        invalidos = [None, [], {'ruta': '/'}, {'orden': []},
                     {'orden': ['inicio'] * 5}, {'orden': self.orden[:-1] + [{}]},
                     {'nombres': {'otro': 'Texto'}}, {'nombres': {'inicio': 1}},
                     {'nombres': {'inicio': 'x' * 31}}, {'orden': 'inicio'},
                     {'nombres': []}]
        for valor in invalidos:
            with self.subTest(valor=valor):
                serializer = ConfiguracionNegocioSerializer(self.config, data={'menu_principal': valor}, partial=True)
                self.assertFalse(serializer.is_valid())
                self.assertIn('menu_principal', serializer.errors)
        serializer = ConfiguracionNegocioSerializer(self.config, data={'menu_principal': {
            'orden': self.orden, 'nombres': {'inicio': '  Mi   inicio ', 'catalogo': '   '}}}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['menu_principal']['nombres'], {'inicio': 'Mi inicio'})

    def test_permisos_persistencia_y_compatibilidad(self):
        url = reverse('configuracion-negocio')
        datos = {'menu_principal': {'orden': self.orden[::-1], 'nombres': {'inicio': 'Portada'}}}
        self.assertEqual(self.client.patch(url, datos, format='json').status_code, 401)
        self.client.force_authenticate(create_user('cliente-menu@example.test'))
        self.assertEqual(self.client.patch(url, datos, format='json').status_code, 403)
        self.client.force_authenticate(create_user('admin-menu@example.test', rol='ADMIN'))
        self.assertEqual(self.client.patch(url, datos, format='json').status_code, 200)
        self.config.refresh_from_db()
        self.assertEqual(self.config.menu_principal, datos['menu_principal'])
        self.assertEqual(self.config.nombre_tienda, 'Tienda')
        self.client.patch(url, {'nombre_tienda': 'Nueva'}, format='json')
        self.config.refresh_from_db()
        self.assertEqual(self.config.menu_principal, datos['menu_principal'])
        self.client.force_authenticate(None)
        respuesta = self.client.get(reverse('configuracion-global'))
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['menu_principal'], datos['menu_principal'])

    def test_configuracion_anterior_y_restauracion(self):
        self.assertEqual(self.config.menu_principal, {})
        self.client.force_authenticate(create_user('restaurar-menu@example.test', rol='ADMIN'))
        url = reverse('configuracion-negocio')
        self.client.patch(url, {'menu_principal': {'nombres': {'inicio': 'Portada'}}}, format='json')
        self.assertEqual(self.client.patch(url, {'menu_principal': {}}, format='json').status_code, 200)
        self.config.refresh_from_db()
        self.assertEqual(self.config.menu_principal, {})
