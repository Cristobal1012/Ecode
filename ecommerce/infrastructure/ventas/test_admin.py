"""Reglas de SCRUM-177 en las vistas reales del admin de Django."""

import json

from django.core import mail
from django.test import Client, TestCase
from django.urls import reverse

from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, OrdenCompra, Promocion


class OrdenCompraAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.superusuario = create_user(
            'superusuario-admin@example.test', rol='ADMIN', is_staff=True, is_superuser=True,
        )
        cls.orden = OrdenCompra.objects.create(
            email_invitado='pedido-admin@example.test', metodo_pago='TRANSFERENCIA',
            direccion_envio_snapshot={'comuna': 'Santiago'},
            nombre_destinatario='Persona original', subtotal=20000, costo_envio=0, total_final=20000,
        )

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.superusuario)
        self.url = reverse('admin:ventas_ordencompra_change', args=[self.orden.pk])

    def guardar(self, url=None, **cambios):
        url = url or self.url
        self.client.get(url)
        datos = {
            'email_invitado': self.orden.email_invitado,
            'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': json.dumps(self.orden.direccion_envio_snapshot),
            'nombre_destinatario': 'Persona corregida',
            'subtotal': '20000', 'costo_envio': '0', 'total_final': '20000',
            'csrfmiddlewaretoken': self.client.cookies['csrftoken'].value,
            '_save': 'Guardar',
        }
        datos.update(cambios)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(url, datos)

    def test_estado_y_control_de_stock_son_solo_lectura_en_alta_y_edicion(self):
        for url in (self.url, reverse('admin:ventas_ordencompra_add')):
            with self.subTest(url=url):
                respuesta = self.client.get(url)
                self.assertEqual(respuesta.status_code, 200)
                formulario = respuesta.context['adminform'].form
                self.assertNotIn('estado', formulario.fields)
                self.assertNotIn('stock_descontado', formulario.fields)
                self.assertContains(respuesta, 'field-estado')

    def test_edicion_permitida_se_guarda_sin_modificar_estado_ni_enviar_correo(self):
        respuesta = self.guardar()
        self.assertEqual(respuesta.status_code, 302)
        self.orden.refresh_from_db()
        self.assertEqual(self.orden.nombre_destinatario, 'Persona corregida')
        self.assertEqual(self.orden.estado, 'PENDIENTE')
        self.assertFalse(self.orden.stock_descontado)
        self.assertEqual(mail.outbox, [])

    def test_post_manipulado_no_cambia_estado_aunque_guarde_la_edicion_permitida(self):
        for actual, nuevo in (
            ('PENDIENTE', 'PAGADO'), ('PENDIENTE', 'ENVIADO'),
            ('PAGADO', 'CANCELADO'), ('ENTREGADO', 'PENDIENTE'), ('CANCELADO', 'PAGADO'),
        ):
            with self.subTest(actual=actual, nuevo=nuevo):
                descontado = actual in ('PAGADO', 'ENTREGADO')
                OrdenCompra.objects.filter(pk=self.orden.pk).update(
                    estado=actual, stock_descontado=descontado, nombre_destinatario='Persona original',
                )
                respuesta = self.guardar(
                    estado=nuevo, stock_descontado='' if descontado else 'on',
                )
                self.assertEqual(respuesta.status_code, 302)
                self.orden.refresh_from_db()
                self.assertEqual(self.orden.estado, actual)
                self.assertEqual(self.orden.stock_descontado, descontado)
                self.assertEqual(self.orden.nombre_destinatario, 'Persona corregida')
        self.assertEqual(mail.outbox, [])

    def test_alta_manipulada_conserva_estado_inicial_y_stock_sin_descontar(self):
        respuesta = self.guardar(
            reverse('admin:ventas_ordencompra_add'), estado='PAGADO', stock_descontado='on',
        )
        self.assertEqual(respuesta.status_code, 302)
        nueva = OrdenCompra.objects.latest('pk')
        self.assertNotEqual(nueva.pk, self.orden.pk)
        self.assertEqual(nueva.estado, 'PENDIENTE')
        self.assertFalse(nueva.stock_descontado)
        self.assertEqual(mail.outbox, [])

    def test_superusuario_conserva_gestion_de_promociones_y_configuracion(self):
        alta = reverse('admin:ventas_promocion_add')
        self.client.get(alta)
        datos = {
            'codigo': 'QA-ADMIN-177', 'tipo_descuento': 'PORCENTAJE', 'valor_descuento': '10',
            'is_active': 'on', 'csrfmiddlewaretoken': self.client.cookies['csrftoken'].value,
        }
        self.assertEqual(self.client.post(alta, datos).status_code, 302)
        promocion = Promocion.objects.get(codigo='QA-ADMIN-177')
        borrar = reverse('admin:ventas_promocion_delete', args=[promocion.pk])
        self.client.get(borrar)
        self.assertEqual(self.client.post(borrar, {
            'post': 'yes', 'csrfmiddlewaretoken': self.client.cookies['csrftoken'].value,
        }).status_code, 302)
        self.assertFalse(Promocion.objects.filter(pk=promocion.pk).exists())

        configuracion = ConfiguracionGlobal.objects.create(nombre_tienda='Tienda QA')
        edicion = self.client.get(reverse('admin:ventas_configuracionglobal_change', args=[configuracion.pk]))
        self.assertEqual(edicion.status_code, 200)
        self.assertFalse(edicion.context['adminform'].form.fields['nombre_tienda'].disabled)

    def test_comprador_no_accede_y_post_sin_csrf_se_rechaza(self):
        self.assertEqual(self.client.post(self.url, {'estado': 'PAGADO'}).status_code, 403)
        comprador = create_user('comprador-admin@example.test')
        self.client.force_login(comprador)
        self.assertRedirects(self.client.get(self.url), f'{reverse("admin:login")}?next={self.url}')
