from decimal import Decimal
from unittest.mock import patch

from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ecommerce.application.test_ventas import CatalogoFalso
from ecommerce.domain.ventas import VarianteCatalogo
from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import ConfiguracionGlobal, DetalleOrden, OrdenCompra
from .serializers import ConfiguracionGlobalSerializer


def usar_catalogo_falso(test, variantes):
    """Reemplaza el catálogo de MongoDB del checkout por uno en memoria."""
    catalogo = patch('ecommerce.infrastructure.ventas.serializers.catalogo_variantes',
                     return_value=CatalogoFalso(variantes))
    catalogo.start()
    test.addCleanup(catalogo.stop)


class ConfiguracionGlobalSerializerTests(APITestCase):
    def test_exposes_only_landing_page_fields(self):
        configuracion = ConfiguracionGlobal.objects.create(
            nombre_tienda='Tienda privada',
            texto_bienvenida='Descubre nuestros productos',
            texto_boton_ingreso='Ir al catálogo',
            banner_url='https://example.com/banner.jpg',
            api_keys_pagos={'secreto': 'no-exponer'},
        )

        data = ConfiguracionGlobalSerializer(configuracion).data

        self.assertEqual(
            set(data),
            {'texto_bienvenida', 'texto_boton_ingreso', 'banner_url',
             'tema_seleccionado', 'layout_catalogo',
             'pasarelas_activas', 'modo_autenticacion',
             'comuna_origen', 'region_origen', 'calle_origen',
             'numero_origen', 'dpto_casa_origen', 'retiro_en_local_activo'}
        )
        self.assertNotIn('api_keys_pagos', data)

    def test_validates_url_and_button_length(self):
        serializer = ConfiguracionGlobalSerializer(data={
            'texto_bienvenida': 'Bienvenida',
            'texto_boton_ingreso': 'x' * 101,
            'banner_url': 'no-es-una-url',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('texto_boton_ingreso', serializer.errors)
        self.assertIn('banner_url', serializer.errors)


class ConfiguracionGlobalAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.configuracion = ConfiguracionGlobal.objects.create(
            nombre_tienda='Tienda QA',
            texto_bienvenida='Bienvenido a Tienda QA',
            texto_boton_ingreso='Ver productos',
            banner_url='https://example.com/hero.jpg',
        )

    def test_public_endpoint_matches_frontend_contract(self):
        url = reverse('configuracion-global')

        response = self.client.get(
            url,
            HTTP_AUTHORIZATION='Token credencial-invalida',
        )

        self.assertEqual(url, '/api/configuracion/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {
            'texto_bienvenida': 'Bienvenido a Tienda QA',
            'texto_boton_ingreso': 'Ver productos',
            'banner_url': 'https://example.com/hero.jpg',
            'tema_seleccionado': 1,
            'layout_catalogo': 'GRID_3',
            'pasarelas_activas': [],
            'modo_autenticacion': 'MIXTO',
            'comuna_origen': 'Santiago',
            'region_origen': 'Metropolitana',
            'calle_origen': 'Av. Principal',
            'numero_origen': '123',
            'dpto_casa_origen': None,
            'retiro_en_local_activo': True,
        })

    def test_returns_not_found_when_configuration_does_not_exist(self):
        ConfiguracionGlobal.objects.all().delete()

        response = self.client.get(reverse('configuracion-global'))

        self.assertEqual(response.status_code, 404)

    def test_endpoint_is_read_only(self):
        response = self.client.post(
            reverse('configuracion-global'),
            {'texto_bienvenida': 'Intento de cambio'},
            format='json',
        )

        self.assertEqual(response.status_code, 405)


class ConfiguracionNegocioAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.configuracion = ConfiguracionGlobal.objects.create(
            pk=1, nombre_tienda='Tienda QA', texto_bienvenida='Original',
        )
        cls.buyer_token = Token.objects.create(user=create_user())
        cls.admin_token = Token.objects.create(
            user=create_user('admin@example.test', rol='ADMIN'),
        )

    def patch(self, token=None):
        if token:
            self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        return self.client.patch(reverse('configuracion-negocio'),
                                 {'texto_bienvenida': 'Modificado'},
                                 format='json')

    def test_anonymous_cannot_read_or_modify(self):
        self.assertEqual(
            self.client.get(reverse('configuracion-negocio')).status_code, 401)
        self.assertEqual(self.patch().status_code, 401)
        self.configuracion.refresh_from_db()
        self.assertEqual(self.configuracion.texto_bienvenida, 'Original')

    def test_buyer_cannot_modify(self):
        self.assertEqual(self.patch(self.buyer_token).status_code, 403)
        self.configuracion.refresh_from_db()
        self.assertEqual(self.configuracion.texto_bienvenida, 'Original')

    def test_admin_can_modify(self):
        response = self.patch(self.admin_token)
        self.assertEqual(response.status_code, 200)
        self.configuracion.refresh_from_db()
        self.assertEqual(self.configuracion.texto_bienvenida, 'Modificado')


class CheckoutAccessTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.buyer = create_user()
        cls.admin = create_user('admin@example.test', rol='ADMIN')
        cls.tokens = [Token.objects.create(user=user)
                      for user in (cls.buyer, cls.admin)]

    def setUp(self):
        usar_catalogo_falso(self, {
            ('camisa', 'CAMISA-S'): VarianteCatalogo(
                'Camisa - CAMISA-S', Decimal('10000.00'), 3, True),
        })
        self.payload = {
            'items': [{'producto_mongo_id': 'camisa', 'variante_sku': 'CAMISA-S', 'cantidad': 1}],
            'email_invitado': 'invitado@example.test',
            'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {
                'calle': 'Prueba', 'ciudad': 'Santiago',
            },
            'subtotal': 10000,
            'costo_envio': 1000,
            'total_final': 11000,
            'acepta_terminos': True,
        }

    def configure(self, mode):
        ConfiguracionGlobal.objects.update_or_create(
            pk=1, defaults={'nombre_tienda': 'Tienda QA',
                            'modo_autenticacion': mode,
                            # Estas pruebas validan acceso, no logística
                            'retiro_en_local_activo': False},
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

    def test_checkout_rejected_without_accepting_terms(self):
        for valor in (False, None):
            with self.subTest(acepta_terminos=valor):
                payload = dict(self.payload)
                if valor is None:
                    payload.pop('acepta_terminos')
                else:
                    payload['acepta_terminos'] = valor
                response = self.checkout(payload)
                self.assertEqual(response.status_code, 400)
                self.assertIn('acepta_terminos', response.data)
                self.assertFalse(OrdenCompra.objects.exists())

    def test_order_detail_uses_catalog_name_and_price_not_the_browser_ones(self):
        self.configure('INVITADO')
        # Mismo formato que arma Checkout.jsx, con nombre y precio manipulados
        payload = dict(self.payload, subtotal=20000, items=[{
            'producto_mongo_id': 'camisa', 'variante_sku': 'CAMISA-S',
            'nombre_producto_snapshot': 'Otro nombre', 'precio_unitario_snapshot': '1',
            'cantidad': 2,
        }])
        self.assertEqual(self.checkout(payload).status_code, 201)
        detalle = DetalleOrden.objects.get(orden=OrdenCompra.objects.latest('pk'))
        self.assertEqual(detalle.nombre_producto_snapshot, 'Camisa - CAMISA-S')
        self.assertEqual(detalle.precio_unitario_snapshot, 10000.0)
        self.assertEqual(detalle.variante_sku, 'CAMISA-S')
        self.assertEqual(detalle.cantidad, 2)

    def test_tampered_subtotal_is_rejected_with_current_prices(self):
        self.configure('INVITADO')
        response = self.checkout(dict(self.payload, subtotal=1))
        self.assertEqual(response.status_code, 400)
        self.assertIn('subtotal', response.data)
        self.assertEqual(response.data['precios_vigentes'][0]['precio'], '10000.00')
        self.assertFalse(OrdenCompra.objects.exists())

    def test_insufficient_stock_or_empty_cart_creates_no_order(self):
        self.configure('INVITADO')
        sin_stock = [{'producto_mongo_id': 'camisa', 'variante_sku': 'CAMISA-S', 'cantidad': 4}]
        for items, subtotal in ((sin_stock, 40000), ([], 0)):
            with self.subTest(items=items):
                response = self.checkout(dict(self.payload, items=items, subtotal=subtotal))
                self.assertEqual(response.status_code, 400)
                self.assertIn('items', response.data)
                self.assertFalse(OrdenCompra.objects.exists())

    def test_checkout_does_not_expose_order_listing(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Token {self.tokens[1].key}',
        )
        self.assertEqual(self.client.get(reverse('checkout')).status_code, 405)


@patch('ecommerce.infrastructure.ventas.views.ProveedorLogisticoAdapter.consultar_estado',
       return_value='En tránsito')
class SeguimientoEnvioTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSBANK',
            direccion_envio_snapshot={'comuna': 'SANTIAGO'},
            subtotal=10000, costo_envio=1000, total_final=11000,
            proveedor_logistico='CHILEXPRESS', numero_seguimiento_tracking='712678903156',
        )

    def consultar(self, numero_orden, email='invitado@example.test'):
        return self.client.post(reverse('tracking-envio'),
                                {'numero_orden': numero_orden, 'email': email},
                                format='json')

    def test_guest_with_matching_order_and_email_sees_timeline(self, consultar_estado):
        response = self.consultar(self.orden.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['estado_actual'], 'En tránsito')
        self.assertEqual(response.data['codigo_seguimiento'], '712678903156')
        consultar_estado.assert_called_once_with('CHILEXPRESS', '712678903156')

    def test_mismatch_gets_same_generic_response_as_missing_order(self, consultar_estado):
        esperado = self.consultar(999999)
        self.assertEqual(esperado.status_code, 404)
        for numero_orden, email in ((self.orden.id, 'otro@example.test'),
                                    ('abc', 'invitado@example.test')):
            with self.subTest(numero_orden=numero_orden, email=email):
                response = self.consultar(numero_orden, email)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.data, esperado.data)
        consultar_estado.assert_not_called()


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class AnulacionTransbankTests(APITestCase):
    def anular(self, orden_compra):
        return self.client.get(reverse('transbank_retorno'),
                               {'TBK_TOKEN': 'token-anulado', 'TBK_ORDEN_COMPRA': orden_compra})

    def test_anulacion_cancela_la_orden_y_lleva_a_pagina_publica(self):
        orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSBANK',
            direccion_envio_snapshot={}, subtotal=10000, costo_envio=0, total_final=10000,
        )
        response = self.anular(f'ORD-{orden.id}')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], f'http://tienda.test/pago-cancelado?orden={orden.id}')
        orden.refresh_from_db()
        self.assertEqual(orden.estado, 'CANCELADO')

    def test_orden_invalida_redirige_sin_numero(self):
        for orden_compra in ('ORD-999999', 'ORD-abc'):
            with self.subTest(orden_compra=orden_compra):
                response = self.anular(orden_compra)
                self.assertEqual(response.status_code, 302)
                self.assertEqual(response['Location'], 'http://tienda.test/pago-cancelado')


@patch.dict('os.environ', {'FRONTEND_URL': 'http://tienda.test'})
class PagoAprobadoTransbankTests(APITestCase):
    @patch('ecommerce.infrastructure.ventas.views.Producto.reducir_stock_variante', return_value=True)
    @patch('ecommerce.infrastructure.ventas.views.TransbankWebpayAdapter.confirmar_transaccion')
    def test_pago_aprobado_descuenta_stock_de_cada_detalle(self, confirmar, reducir_stock):
        orden = OrdenCompra.objects.create(
            email_invitado='invitado@example.test', metodo_pago='TRANSBANK',
            direccion_envio_snapshot={}, subtotal=20000, costo_envio=0, total_final=20000,
        )
        DetalleOrden.objects.create(
            orden=orden, producto_mongo_id='camisa', variante_sku='CAMISA-S',
            nombre_producto_snapshot='Camisa - CAMISA-S', precio_unitario_snapshot=10000, cantidad=2,
        )
        confirmar.return_value = {
            'exito': True, 'aprobado': True, 'data_completa': {'buy_order': f'ORD-{orden.id}'},
        }

        response = self.client.get(reverse('transbank_retorno'), {'token_ws': 'token-tbk'})

        self.assertEqual(response['Location'], f'http://tienda.test/pago-exitoso?orden={orden.id}')
        orden.refresh_from_db()
        self.assertEqual(orden.estado, 'PAGADO')
        reducir_stock.assert_called_once_with(producto_id='camisa', sku='CAMISA-S', cantidad=2)
