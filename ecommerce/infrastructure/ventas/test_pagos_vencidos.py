from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core import mail
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import ConfiguracionGlobal, OrdenCompra


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class ComandoCancelarPagosVencidosTests(TestCase):
    """AGENTS.md §4.1: `manage.py cancelar_pagos_vencidos` cancela las transferencias vencidas y avisa."""

    def setUp(self):
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='Tienda QA')

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
        self.assertIn('No hay órdenes con el pago vencido', self.ejecutar())
        self.assertEqual(mail.outbox, [])
