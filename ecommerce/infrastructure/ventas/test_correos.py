from decimal import Decimal
from smtplib import SMTPException
from unittest.mock import patch

from django.core import mail
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ecommerce.domain.ventas import VarianteCatalogo
from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, OrdenCompra
from .tests import usar_catalogo_falso

CORREO = 'ecommerce.infrastructure.ventas.adapters.correo'


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class CorreoPedidoRecibidoTests(APITestCase):
    """RF-04.2: al crear la orden el comprador recibe el resumen de la compra."""

    def setUp(self):
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
