from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import ConfiguracionGlobal, OrdenCompra
from .tests import DATOS_MEDIOS_PAGO, habilitar_medios_pago


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class ComandoCancelarPagosVencidosTests(TestCase):
    """AGENTS.md §4.1: `manage.py cancelar_pagos_vencidos` cancela las transferencias vencidas y avisa."""

    def setUp(self):
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='Tienda QA')
        habilitar_medios_pago('TRANSFERENCIA')

    def crear(self, horas, metodo_pago='TRANSFERENCIA', estado='PENDIENTE'):
        orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago=metodo_pago, estado=estado,
            direccion_envio_snapshot={}, subtotal=10000, costo_envio=0, total_final=10000,
            proveedor_logistico='RETIRO_LOCAL')
        # fecha_creacion es auto_now_add: se ajusta después de crear
        OrdenCompra.objects.filter(id=orden.id).update(fecha_creacion=timezone.now() - timedelta(hours=horas))
        return orden

    def ejecutar(self):
        salida = StringIO()
        with self.captureOnCommitCallbacks(execute=True):
            call_command('cancelar_pagos_vencidos', stdout=salida)
        return salida.getvalue()

    def test_cancela_la_transferencia_vencida_y_envia_el_correo(self):
        vencida = self.crear(49)
        a_tiempo = self.crear(1)
        webpay = self.crear(49, metodo_pago='TRANSBANK')

        salida = self.ejecutar()

        self.assertIn(f'#{vencida.id}', salida)
        vencida.refresh_from_db()
        self.assertEqual((vencida.estado, vencida.motivo_cancelacion), ('CANCELADO', 'Pago no recibido a tiempo'))
        for orden in (a_tiempo, webpay):
            orden.refresh_from_db()
            self.assertEqual(orden.estado, 'PENDIENTE')
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Tu pedido #{vencida.id} fue cancelado | Tienda QA')
        self.assertIn('No recibimos el pago de tu transferencia dentro de las 48 horas', correo.body)

    def test_sin_ordenes_vencidas_no_hace_nada(self):
        self.crear(1)
        salida = self.ejecutar()
        self.assertIn('No hay órdenes con el pago vencido', salida)
        self.assertNotIn('Recordatorios', salida)
        self.assertEqual(mail.outbox, [])

    def test_a_las_24_horas_recuerda_el_pago_una_sola_vez_con_el_plazo(self):
        por_vencer = self.crear(25)
        self.crear(1)

        self.assertIn(f'Recordatorios de pago enviados: #{por_vencer.id}.', self.ejecutar())

        por_vencer.refresh_from_db()
        self.assertEqual((por_vencer.estado, por_vencer.recordatorio_pago_enviado), ('PENDIENTE', True))
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Recuerda pagar tu pedido #{por_vencer.id} | Tienda QA')
        vence = timezone.localtime(por_vencer.fecha_creacion + timedelta(hours=48))
        self.assertIn(f"Tienes hasta el {vence.strftime('%d-%m-%Y a las %H:%M')} para transferir", correo.body)
        self.assertIn(f'Número de cuenta: {DATOS_MEDIOS_PAGO["TRANSFERENCIA"]["numero_cuenta"]}', correo.body)
        self.assertIn('Tienes hasta el', correo.alternatives[0][0])

        self.ejecutar()
        self.assertEqual(len(mail.outbox), 1)

    def test_una_orden_vencida_se_cancela_sin_recordatorio(self):
        self.crear(49)
        self.assertNotIn('Recordatorios', self.ejecutar())
        correo, = mail.outbox
        self.assertIn('fue cancelado', correo.subject)
