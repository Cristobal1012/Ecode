
"""Pruebas de la página independiente Sobre mí."""

from django.urls import reverse
from rest_framework.test import APITestCase

from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, ProyectoDestacadoSobreMi, Publicacion


class SobreMiTests(APITestCase):
    def setUp(self):
        self.config = ConfiguracionGlobal.objects.create(
            pk=1,
            nombre_tienda='Tienda QA',
            sobre_mi_activo=False,
            sobre_mi_nombre='Mi historia',
            sobre_mi_biografia='<p>Diseñamos productos personalizados.</p>',
            correo_contacto='contacto@example.test',
            telefono_comercial='+56912345678',
            instagram_usuario='tiendaqa',
        )
        self.admin = create_user('admin-sobre-mi@example.test', rol='ADMIN')

        self.publicada = Publicacion.objects.create(
            titulo='Proyecto terminado',
            slug='proyecto-terminado',
            resumen='Un trabajo destacado',
            contenido='<p>Descripción del proyecto.</p>',
            estado='PUBLICADA',
        )
        self.borrador = Publicacion.objects.create(
            titulo='Proyecto en preparación',
            slug='proyecto-en-preparacion',
            resumen='Todavía no se publica',
            contenido='<p>Trabajo en proceso.</p>',
            estado='BORRADOR',
        )

    def como_admin(self):
        self.client.force_authenticate(self.admin)

    def test_pagina_desactivada_responde_404(self):
        respuesta = self.client.get(reverse('sobre-mi-publico'))
        self.assertEqual(respuesta.status_code, 404)

    def test_pagina_activada_muestra_biografia_y_contactos(self):
        self.config.sobre_mi_activo = True
        self.config.save(update_fields=['sobre_mi_activo'])

        respuesta = self.client.get(reverse('sobre-mi-publico'))

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['nombre'], 'Mi historia')
        self.assertEqual(
            respuesta.data['biografia'],
            '<p>Diseñamos productos personalizados.</p>',
        )
        self.assertEqual(respuesta.data['contacto']['correo'], 'contacto@example.test')
        self.assertEqual(respuesta.data['contacto']['telefono'], '+56912345678')
        self.assertEqual(respuesta.data['contacto']['instagram'], 'tiendaqa')
        self.assertEqual(respuesta.data['proyectos'], [])

    def test_contactos_vacios_no_se_muestran(self):
        self.config.sobre_mi_activo = True
        self.config.telefono_comercial = ''
        self.config.instagram_usuario = ''
        self.config.save()

        respuesta = self.client.get(reverse('sobre-mi-publico'))

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.data['contacto'], {
            'correo': 'contacto@example.test',
        })

    def test_admin_selecciona_proyectos_y_borradores_no_aparecen(self):
        self.como_admin()

        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': [self.borrador.id, self.publicada.id]},
            format='json',
        )

        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(
            respuesta.data['proyectos'],
            [self.borrador.id, self.publicada.id],
        )
        self.assertEqual(
            ProyectoDestacadoSobreMi.objects.count(),
            2,
        )

        self.config.sobre_mi_activo = True
        self.config.save(update_fields=['sobre_mi_activo'])
        self.client.force_authenticate(None)

        respuesta_publica = self.client.get(reverse('sobre-mi-publico'))

        self.assertEqual(respuesta_publica.status_code, 200)
        self.assertEqual(
            [p['slug'] for p in respuesta_publica.data['proyectos']],
            ['proyecto-terminado'],
        )

    def test_admin_puede_cambiar_el_orden(self):
        segunda = Publicacion.objects.create(
            titulo='Segundo proyecto',
            slug='segundo-proyecto',
            resumen='Otro proyecto',
            contenido='<p>Otro trabajo.</p>',
            estado='PUBLICADA',
        )
        self.como_admin()

        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': [segunda.id, self.publicada.id]},
            format='json',
        )

        self.assertEqual(respuesta.status_code, 200, respuesta.data)

        self.config.sobre_mi_activo = True
        self.config.save(update_fields=['sobre_mi_activo'])
        self.client.force_authenticate(None)

        respuesta_publica = self.client.get(reverse('sobre-mi-publico'))

        self.assertEqual(
            [p['slug'] for p in respuesta_publica.data['proyectos']],
            ['segundo-proyecto', 'proyecto-terminado'],
        )

    def test_admin_no_puede_seleccionar_ids_repetidos(self):
        self.como_admin()

        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': [self.publicada.id, self.publicada.id]},
            format='json',
        )

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(ProyectoDestacadoSobreMi.objects.count(), 0)

    def test_admin_no_puede_seleccionar_proyectos_inexistentes(self):
        self.como_admin()

        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': [self.publicada.id, 999999]},
            format='json',
        )

        self.assertEqual(respuesta.status_code, 400)
        self.assertEqual(ProyectoDestacadoSobreMi.objects.count(), 0)

    def test_usuario_no_autenticado_no_puede_modificar_proyectos(self):
        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': [self.publicada.id]},
            format='json',
        )

        self.assertIn(respuesta.status_code, [401, 403])
        self.assertEqual(ProyectoDestacadoSobreMi.objects.count(), 0)

    def test_admin_puede_quitar_todos_los_proyectos(self):
        ProyectoDestacadoSobreMi.objects.create(
            configuracion=self.config,
            publicacion=self.publicada,
            orden=0,
        )
        self.como_admin()

        respuesta = self.client.put(
            reverse('admin-sobre-mi-proyectos'),
            {'proyectos': []},
            format='json',
        )

        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(ProyectoDestacadoSobreMi.objects.count(), 0)
