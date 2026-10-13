from decimal import Decimal
from smtplib import SMTPException
from unittest.mock import patch

from django.core import mail
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ecommerce.application.test_ventas import InventarioFalso
from ecommerce.domain.ventas import VarianteCatalogo
from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, DetalleOrden, OrdenCompra
from .tests import habilitar_medios_pago, usar_catalogo_falso

CORREO = 'ecommerce.infrastructure.ventas.adapters.correo'


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class CorreoPedidoRecibidoTests(APITestCase):
    """RF-04.2: al crear la orden el comprador recibe el resumen de la compra."""

    def setUp(self):
        habilitar_medios_pago('TRANSFERENCIA', 'TRANSBANK')
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='Tienda QA', modo_autenticacion='MIXTO')
        usar_catalogo_falso(self, {
            ('camisa', 'CAMISA-S'): VarianteCatalogo('Camisa <b>azul</b> - CAMISA-S', Decimal('10000.00'), 5, True),
        })
        cotizacion = patch('ecommerce.infrastructure.ventas.serializers.ProveedorLogisticoAdapter.cotizar_envio',
                           return_value={'precio': 1000})
        cotizacion.start()
        self.addCleanup(cotizacion.stop)
        self.payload = {
            'items': [{'producto_mongo_id': 'camisa', 'variante_sku': 'CAMISA-S', 'cantidad': 2}],
            'email_invitado': 'invitado@example.test',
            'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {'calle': 'Los Olmos', 'numero': '123', 'comuna': 'PROVIDENCIA'},
            'subtotal': 20000,
            'proveedor_logistico': 'CHILEXPRESS',
            'paquete': {'peso_kg': '1', 'alto_cm': '10', 'ancho_cm': '10', 'largo_cm': '10'},
            'acepta_terminos': True,
        }

    def checkout(self, **cambios):
        # El correo sale después del commit: en los tests hay que ejecutar esos callbacks
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(reverse('checkout'), {**self.payload, **cambios}, format='json')

    def test_invitado_recibe_el_resumen_con_los_montos_del_servidor(self):
        response = self.checkout()

        self.assertEqual(response.status_code, 201, response.data)
        correo, = mail.outbox
        orden_id = response.data['orden_id']
        self.assertEqual(correo.to, ['invitado@example.test'])
        self.assertEqual(correo.subject, f'Recibimos tu pedido #{orden_id} | Tienda QA')
        for texto in ('2 x $10.000 = $20.000', 'Envío: $1.000', 'Total: $21.000', 'Medio de pago: Transferencia',
                      'Despacho a domicilio (Chilexpress): Los Olmos 123, PROVIDENCIA',
                      f'http://tienda.test/seguimiento?orden={orden_id}'):
            self.assertIn(texto, correo.body)
        html, tipo = correo.alternatives[0]
        self.assertEqual(tipo, 'text/html')
        self.assertIn('$21.000', html)

    def test_el_html_escapa_los_datos_del_catalogo(self):
        self.checkout()
        correo, = mail.outbox
        html = correo.alternatives[0][0]
        self.assertIn('Camisa &lt;b&gt;azul&lt;/b&gt;', html)
        self.assertNotIn('<b>azul</b>', html)
        # El texto plano no se escapa: no es HTML
        self.assertIn('Camisa <b>azul</b>', correo.body)

    def test_usuario_registrado_lo_recibe_en_su_correo(self):
        comprador = create_user('registrado@example.test')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=comprador).key}')
        self.checkout(email_invitado=None)
        correo, = mail.outbox
        self.assertEqual(correo.to, ['registrado@example.test'])

    def test_sin_orden_no_hay_correo(self):
        response = self.checkout(acepta_terminos=False)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(mail.outbox, [])

    def test_si_el_servidor_de_correo_falla_la_orden_igual_se_crea(self):
        with patch(f'{CORREO}.EmailMultiAlternatives.send', side_effect=SMTPException('sin conexión')), \
                self.assertLogs(CORREO, level='ERROR') as logs:
            response = self.checkout()

        self.assertEqual(response.status_code, 201)
        self.assertTrue(OrdenCompra.objects.filter(id=response.data['orden_id']).exists())
        # El log no incluye el correo del comprador
        self.assertNotIn('invitado@example.test', '\n'.join(logs.output))


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class CorreosDelPagoTests(APITestCase):
    """RF-04.2: el retorno de Transbank avisa el resultado del pago (una vez por orden)."""

    def setUp(self):
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='Tienda QA')
        self.orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSBANK', direccion_envio_snapshot={},
            subtotal=20000, costo_envio=0, total_final=20000, proveedor_logistico='RETIRO_LOCAL',
        )
        DetalleOrden.objects.create(
            orden=self.orden, producto_mongo_id='camisa', variante_sku='CAMISA-S',
            nombre_producto_snapshot='Camisa - CAMISA-S', precio_unitario_snapshot=10000, cantidad=2,
        )
        self.inventario = InventarioFalso({('camisa', 'CAMISA-S'): 3})
        inventario = patch('ecommerce.infrastructure.ventas.views.inventario_variantes',
                           return_value=self.inventario)
        inventario.start()
        self.addCleanup(inventario.stop)
        transbank = patch('ecommerce.infrastructure.ventas.views.TransbankWebpayAdapter.confirmar_transaccion')
        self.transbank = transbank.start()
        self.addCleanup(transbank.stop)
        self.transbank.return_value = {'exito': True, 'aprobado': True,
                                       'data_completa': {'buy_order': f'ORD-{self.orden.id}'}}

    def retorno(self, **parametros):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.get(reverse('transbank_retorno'), parametros or {'token_ws': 'token-tbk'})

    def test_pago_aprobado_envia_un_solo_correo_aunque_transbank_repita(self):
        self.retorno()
        self.retorno()
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Pago confirmado: pedido #{self.orden.id} | Tienda QA')
        self.assertIn('Total: $20.000', correo.body)

    def test_pago_en_revision_no_revela_el_motivo_interno(self):
        self.inventario.stock[('camisa', 'CAMISA-S')] = 1
        with self.assertLogs('ecommerce.infrastructure.ventas.views', level='ERROR'):
            self.retorno()
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Recibimos el pago de tu pedido #{self.orden.id} | Tienda QA')
        self.assertIn('necesita revisarlo', correo.body)
        for interno in ('stock', 'CAMISA-S para', 'revisión del admin'):
            self.assertNotIn(interno, correo.body + correo.alternatives[0][0])

    def test_pago_rechazado(self):
        self.transbank.return_value = {**self.transbank.return_value, 'aprobado': False}
        self.retorno()
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'No se pudo completar el pago del pedido #{self.orden.id} | Tienda QA')
        self.assertIn('no se\nrealizó ningún cobro', correo.body)

    def test_anulacion_del_comprador_avisa_cancelacion_sin_cobro(self):
        self.retorno(TBK_TOKEN='token-anulado', TBK_ORDEN_COMPRA=f'ORD-{self.orden.id}')
        self.assertIn('no se realizó ningún cobro', mail.outbox[0].body)

    def test_anulacion_del_comprador_avisa_cancelacion(self):
        self.retorno(TBK_TOKEN='token-anulado', TBK_ORDEN_COMPRA=f'ORD-{self.orden.id}')
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Tu pedido #{self.orden.id} fue cancelado | Tienda QA')
        self.assertIn('Anulaste el pago', correo.body)


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class CorreosDelPanelTests(APITestCase):
    """RF-04.2: los cambios de estado del admin avisan al comprador; el despacho lleva el seguimiento."""

    @classmethod
    def setUpTestData(cls):
        cls.admin_token = Token.objects.create(user=create_user('admin@example.test', rol='ADMIN'))

    def setUp(self):
        ConfiguracionGlobal.objects.create(id=1, nombre_tienda='Tienda QA', calle_origen='Av. Central',
                                           numero_origen='50', comuna_origen='Providencia')
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')
        inventario = patch('ecommerce.infrastructure.ventas.views.inventario_variantes',
                           return_value=InventarioFalso({('camisa', 'CAMISA-S'): 5}))
        inventario.start()
        self.addCleanup(inventario.stop)
        transportista = patch('ecommerce.infrastructure.ventas.views.ChilexpressOrdenTransporte')
        transportista.start().return_value.generar_orden_transporte.return_value = '712678904136'
        self.addCleanup(transportista.stop)

    def crear_orden(self, proveedor):
        orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSFERENCIA', subtotal=10000, costo_envio=0,
            total_final=10000, proveedor_logistico=proveedor,
            direccion_envio_snapshot={'calle': 'Los Olmos', 'numero': '123', 'comuna': 'PROVIDENCIA'},
        )
        DetalleOrden.objects.create(
            orden=orden, producto_mongo_id='camisa', variante_sku='CAMISA-S',
            nombre_producto_snapshot='Camisa - CAMISA-S', precio_unitario_snapshot=10000, cantidad=1,
        )
        return orden

    def cambiar(self, orden, estado):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(reverse('admin-ordenes-patch', args=[orden.id]), {'estado': estado},
                                     format='json')

    def test_cada_estado_avisa_y_el_despacho_lleva_ot_y_enlace(self):
        orden = self.crear_orden('CHILEXPRESS')
        for estado in ('PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO'):
            self.assertEqual(self.cambiar(orden, estado).status_code, 200)

        self.assertEqual([correo.subject.split(' | ')[0] for correo in mail.outbox], [
            f'Pago confirmado: pedido #{orden.id}',
            f'Estamos preparando tu pedido #{orden.id}',
            f'Tu pedido #{orden.id} va en camino',
            f'Tu pedido #{orden.id} fue entregado',
        ])
        despacho = mail.outbox[2]
        self.assertIn('Número de seguimiento: 712678904136', despacho.body)
        self.assertIn(f'href="http://tienda.test/seguimiento?orden={orden.id}"', despacho.alternatives[0][0])

    def test_retiro_en_local_avisa_que_esta_listo_para_retirar(self):
        orden = self.crear_orden('RETIRO_LOCAL')
        for estado in ('PAGADO', 'EN_PREPARACION', 'ENVIADO'):
            self.cambiar(orden, estado)
        listo = mail.outbox[-1]
        self.assertEqual(listo.subject, f'Tu pedido #{orden.id} está listo para retirar | Tienda QA')
        self.assertIn('Retiro en el local: Av. Central 50 Providencia', listo.body)
        self.assertNotIn('Número de seguimiento', listo.body)

    def test_cancelacion_del_admin_avisa_devolucion_si_ya_habia_pagado(self):
        orden = self.crear_orden('RETIRO_LOCAL')
        self.cambiar(orden, 'CANCELADO')
        correo, = mail.outbox
        self.assertEqual(correo.subject, f'Tu pedido #{orden.id} fue cancelado | Tienda QA')
        self.assertIn('Tienda QA canceló tu pedido', correo.body)

    def test_transicion_rechazada_no_envia_correo(self):
        orden = self.crear_orden('RETIRO_LOCAL')
        self.assertEqual(self.cambiar(orden, 'ENVIADO').status_code, 400)
        self.assertEqual(mail.outbox, [])
