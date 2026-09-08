from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, OrdenCompra


class CheckoutAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.buyer = create_user()
        cls.admin = create_user('admin@example.test', rol='ADMIN')
        cls.tokens = [Token.objects.create(user=user)
                      for user in (cls.buyer, cls.admin)]

    def setUp(self):
        self.payload = {
            'email_invitado': 'invitado@example.test',
            'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {
                'calle': 'Prueba', 'ciudad': 'Santiago',
            },
            'subtotal': 10000,
            'costo_envio': 1000,
            'total_final': 11000,
        }

    def configure(self, mode):
        ConfiguracionGlobal.objects.update_or_create(
            pk=1, defaults={'nombre_tienda': 'Tienda QA',
                            'modo_autenticacion': mode},
        )

    def checkout(self, payload=None):
        return self.client.post(reverse('checkout'),
                                self.payload if payload is None else payload,
                                format='json')

    def test_guest_checkout_remains_public_when_allowed(self):
        for mode in (None, 'INVITADO', 'MIXTO'):
            with self.subTest(mode=mode):
                if mode:
                    self.configure(mode)
                self.assertEqual(self.checkout().status_code, 201)
                order = OrdenCompra.objects.latest('pk')
                self.assertIsNone(order.usuario_id)
                self.assertEqual(order.email_invitado,
                                 self.payload['email_invitado'])

    def test_required_registration_rejects_anonymous_before_validation(self):
        self.configure('REGISTRO_OBLIGATORIO')
        for payload in (self.payload, {}):
            with self.subTest(payload=payload):
                response = self.checkout(payload)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response['WWW-Authenticate'], 'Token')
                self.assertFalse(OrdenCompra.objects.exists())

    def test_invalid_token_never_creates_an_order_in_any_mode(self):
        for mode in ('INVITADO', 'MIXTO', 'REGISTRO_OBLIGATORIO'):
            self.configure(mode)
            for header in ('Token', 'Token invalid', 'Token one two'):
                with self.subTest(mode=mode, header=header):
                    self.client.credentials(HTTP_AUTHORIZATION=header)
                    self.assertEqual(self.checkout().status_code, 401)
                    self.assertFalse(OrdenCompra.objects.exists())

    def test_authenticated_roles_can_checkout_in_every_mode(self):
        for mode in ('INVITADO', 'MIXTO', 'REGISTRO_OBLIGATORIO'):
            self.configure(mode)
            for token in self.tokens:
                with self.subTest(mode=mode, role=token.user.rol):
                    self.client.credentials(
                        HTTP_AUTHORIZATION=f'Token {token.key}',
                    )
                    payload = dict(self.payload, usuario=self.admin.pk,
                                   rol='ADMIN')
                    self.assertEqual(self.checkout(payload).status_code, 201)
                    order = OrdenCompra.objects.latest('pk')
                    self.assertEqual(order.usuario_id, token.user_id)
                    self.assertEqual(order.email_invitado, '')

    def test_inactive_account_cannot_fall_back_to_guest_checkout(self):
        self.configure('MIXTO')
        self.buyer.is_active = False
        self.buyer.save(update_fields=['is_active'])
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.tokens[0].key}',
        )
        self.assertEqual(self.checkout().status_code, 401)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_guest_email_is_still_required(self):
        self.payload.pop('email_invitado')
        response = self.checkout()
        self.assertEqual(response.status_code, 400)
        self.assertIn('email_invitado', response.data)
        self.assertFalse(OrdenCompra.objects.exists())

    def test_checkout_does_not_expose_order_listing(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.tokens[1].key}',
        )
        self.assertEqual(self.client.get(reverse('checkout')).status_code, 405)
