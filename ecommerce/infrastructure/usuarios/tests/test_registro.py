from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()

URL_REGISTRO = '/api/usuarios/registro/'


class RegistroPublicoTests(APITestCase):
    """El registro público solo crea compradores: el rol no se elige desde la petición (RNF-03)."""

    def datos(self, **extra):
        return {
            'email': 'comprador@example.test',
            'nombre': 'Ana',
            'apellido_paterno': 'Pérez',
            'password': 'UnaClave-Larga-2026',
            'password2': 'UnaClave-Larga-2026',
            **extra,
        }

    def test_registro_crea_un_comprador(self):
        respuesta = self.client.post(URL_REGISTRO, self.datos(), format='json')

        self.assertEqual(respuesta.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(email='comprador@example.test').rol, 'COMPRADOR')

    def test_no_se_puede_registrar_un_administrador(self):
        respuesta = self.client.post(URL_REGISTRO, self.datos(rol='ADMIN'), format='json')

        usuario = User.objects.get(email='comprador@example.test')
        self.assertEqual(usuario.rol, 'COMPRADOR')
        self.assertFalse(usuario.is_staff)
        self.assertFalse(usuario.is_superuser)
        self.assertEqual(respuesta.data['user']['rol'], 'COMPRADOR')

    def test_no_se_pueden_elegir_permisos_de_staff(self):
        self.client.post(URL_REGISTRO, self.datos(is_staff=True, is_superuser=True), format='json')

        usuario = User.objects.get(email='comprador@example.test')
        self.assertFalse(usuario.is_staff)
        self.assertFalse(usuario.is_superuser)
