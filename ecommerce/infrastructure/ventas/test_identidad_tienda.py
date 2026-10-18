"""RF-01.1 y RF-01.2: el admin cambia el logo, el favicon y la landing desde el panel, sin el equipo."""

import shutil
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework.test import APITestCase

from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal


def imagen_png(nombre='logo.png', color='green'):
    contenido = BytesIO()
    with Image.new('RGB', (16, 16), color=color) as imagen:
        imagen.save(contenido, format='PNG')
    return SimpleUploadedFile(nombre, contenido.getvalue(), content_type='image/png')


class IdentidadTiendaTests(APITestCase):
    def setUp(self):
        # Las imágenes se guardan en una carpeta temporal, nunca en el media/ de desarrollo
        carpeta = settings.BASE_DIR / '.tmp'
        carpeta.mkdir(exist_ok=True)
        self.media_root = (carpeta / f'identidad-test-{uuid4().hex}').resolve()
        self.media_root.mkdir()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        media = override_settings(MEDIA_ROOT=str(self.media_root), MEDIA_URL='/media/')
        media.enable()
        self.addCleanup(media.disable)

        ConfiguracionGlobal.objects.create(pk=1, nombre_tienda='Tienda QA')
        self.client.force_authenticate(create_user('admin-identidad@example.test', rol='ADMIN'))
        self.url = reverse('configuracion-negocio')

    def subir(self, **archivos):
        return self.client.patch(self.url, archivos, format='multipart')

    def archivo(self, campo):
        return getattr(ConfiguracionGlobal.objects.get(pk=1), campo)

    def test_sube_logo_favicon_portada_y_foto_de_nosotros_y_la_tienda_los_recibe_como_url(self):
        response = self.subir(logo=imagen_png(), favicon=imagen_png('icono.png'), banner=imagen_png('portada.png'),
                              nosotros_imagen=imagen_png('taller.png'))

        self.assertEqual(response.status_code, 200, response.data)
        publica = self.client.get(reverse('configuracion-global')).data
        for campo in ('logo', 'favicon', 'banner', 'nosotros_imagen'):
            with self.subTest(campo=campo):
                guardado = self.archivo(campo)
                self.assertTrue(Path(guardado.path).is_file())
                # El nombre lo pone el servidor, no el navegador
                self.assertNotIn(campo, Path(guardado.name).stem)
                self.assertTrue(publica[campo].startswith('http://testserver/media/negocio/'))

    def test_rechaza_archivos_que_no_son_imagenes(self):
        falso = SimpleUploadedFile('logo.png', b'<svg onload="alert(1)"></svg>', content_type='image/png')

        response = self.subir(logo=falso)

        self.assertEqual(response.status_code, 400)
        self.assertIn('logo', response.data)
        self.assertFalse(self.archivo('logo'))

    @override_settings(CATALOGO_IMAGEN_MAX_BYTES=20)
    def test_rechaza_imagenes_demasiado_grandes(self):
        self.assertEqual(self.subir(logo=imagen_png()).status_code, 400)
        self.assertFalse(self.archivo('logo'))

    def test_reemplazar_o_quitar_una_imagen_borra_el_archivo_anterior(self):
        self.subir(logo=imagen_png())
        primero = Path(self.archivo('logo').path)

        self.subir(logo=imagen_png(color='red'))
        segundo = Path(self.archivo('logo').path)
        self.assertFalse(primero.exists())
        self.assertTrue(segundo.is_file())

        response = self.client.patch(self.url, {'logo': None}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.archivo('logo'))
        self.assertFalse(segundo.exists())

    def test_edita_los_campos_fijos_de_la_landing(self):
        datos = {'nombre_tienda': 'Murales Alan', 'texto_bienvenida': 'Murales de Alan',
                 'subtitulo_bienvenida': 'Arte para tus paredes',
                 'texto_landing': 'Pintamos murales a pedido en todo Chile.', 'texto_boton_ingreso': 'Ver obras',
                 'nosotros_titulo': 'Nuestro taller', 'nosotros_texto': 'Desde 2015 pintamos en Valparaíso.'}

        self.assertEqual(self.client.patch(self.url, datos, format='json').status_code, 200)

        publica = self.client.get(reverse('configuracion-global')).data
        self.assertEqual({campo: publica[campo] for campo in datos}, datos)

    def test_los_textos_largos_de_la_landing_tienen_un_maximo(self):
        for campo, maximo in (('texto_landing', 1000), ('nosotros_texto', 2000)):
            with self.subTest(campo=campo):
                response = self.client.patch(self.url, {campo: 'x' * (maximo + 1)}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(campo, response.data)

    def test_un_comprador_no_puede_cambiar_la_identidad(self):
        self.client.force_authenticate(create_user('comprador-identidad@example.test'))
        self.assertEqual(self.subir(logo=imagen_png()).status_code, 403)
        self.assertFalse(self.archivo('logo'))
