from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.urls import reverse

from ecommerce.infrastructure.usuarios.tests.factories import create_user

from .models import Promocion


class ValidarPromocionTests(APITestCase):
    def setUp(self):
        self.url = reverse('validar-promocion')
        self.ahora = timezone.now()

        # Cupón activo vigente
        self.promo_vigente = Promocion.objects.create(
            codigo='VERANO20',
            tipo_descuento='PORCENTAJE',
            valor_descuento=20.0,
            umbral_envio_gratis=50000.0,
            fecha_expiracion=self.ahora + timedelta(days=7),
            is_active=True,
        )

        # Cupón expirado
        self.promo_expirada = Promocion.objects.create(
            codigo='EXPIRADO',
            tipo_descuento='MONTO_FIJO',
            valor_descuento=5000.0,
            fecha_expiracion=self.ahora - timedelta(days=1),
            is_active=True,
        )

        # Cupón inactivo
        self.promo_inactiva = Promocion.objects.create(
            codigo='INACTIVO',
            tipo_descuento='MONTO_FIJO',
            valor_descuento=3000.0,
            fecha_expiracion=self.ahora + timedelta(days=10),
            is_active=False,
        )

    def test_valida_cupon_porcentaje_exitosamente(self):
        response = self.client.post(self.url, {'codigo': 'VERANO20', 'subtotal': 100000})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['descuento'], 20000)
        self.assertEqual(response.data['umbral_envio_gratis'], 50000.0)

    def test_valida_cupon_monto_fijo_tope_subtotal(self):
        promo_fija = Promocion.objects.create(
            codigo='FIJO5000',
            tipo_descuento='MONTO_FIJO',
            valor_descuento=5000.0,
            is_active=True,
        )
        # Subtotal menor al descuento: no debe generar totales negativos
        response = self.client.post(self.url, {'codigo': 'FIJO5000', 'subtotal': 3000})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['descuento'], 3000)

    def test_rechaza_cupon_expirado(self):
        response = self.client.post(self.url, {'codigo': 'EXPIRADO', 'subtotal': 50000})
        self.assertIn(response.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])
        self.assertIn('error', response.data)

    def test_rechaza_cupon_inactivo(self):
        response = self.client.post(self.url, {'codigo': 'INACTIVO', 'subtotal': 50000})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rechaza_codigo_vacio(self):
        response = self.client.post(self.url, {'codigo': '', 'subtotal': 50000})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_propiedad_esta_vigente(self):
        self.assertTrue(self.promo_vigente.esta_vigente)
        self.assertFalse(self.promo_expirada.esta_vigente)
        self.assertFalse(self.promo_inactiva.esta_vigente)


class CheckoutPromocionTests(APITestCase):
    def setUp(self):
        from decimal import Decimal
        from unittest.mock import patch
        from .models import ConfiguracionGlobal, OrdenCompra
        from .tests import DESTINATARIO, habilitar_medios_pago, usar_catalogo_falso
        from ecommerce.domain.ventas import VarianteCatalogo

        self.url = reverse('checkout')
        self.ahora = timezone.now()
        ConfiguracionGlobal.objects.update_or_create(
            pk=1, defaults={'nombre_tienda': 'Tienda QA', 'modo_autenticacion': 'INVITADO', 'retiro_en_local_activo': False}
        )
        habilitar_medios_pago('TRANSFERENCIA', 'TRANSBANK')
        usar_catalogo_falso(self, {
            ('prod1', 'SKU-1'): VarianteCatalogo('Producto 1 - SKU-1', Decimal('20000.00'), 5, True),
        })
        cotizacion = patch('ecommerce.infrastructure.ventas.serializers.ProveedorLogisticoAdapter.cotizar_envio',
                           return_value={'precio': 3000})
        cotizacion.start()
        self.addCleanup(cotizacion.stop)

        self.promo_valida = Promocion.objects.create(
            codigo='REINTENTO',
            tipo_descuento='PORCENTAJE',
            valor_descuento=10.0,
            umbral_envio_gratis=15000.0,
            fecha_expiracion=self.ahora + timedelta(days=5),
            is_active=True,
        )

        self.payload_base = {
            'items': [{'producto_mongo_id': 'prod1', 'variante_sku': 'SKU-1', 'cantidad': 1}],
            'email_invitado': 'comprador@example.com',
            'metodo_pago': 'TRANSFERENCIA',
            'direccion_envio_snapshot': {'calle': 'Calle 1', 'ciudad': 'Santiago', 'comuna': 'Santiago'},
            'subtotal': 20000,
            'proveedor_logistico': 'CHILEXPRESS',
            'paquete': {'peso_kg': '1', 'alto_cm': '10', 'ancho_cm': '10', 'largo_cm': '10'},
            'acepta_terminos': True,
            **DESTINATARIO,
        }

    def test_cupon_invalido_o_expirado_rechaza_checkout(self):
        # E05: El checkout debe rechazar cupones no vigentes en vez de cobrar calladamente el total completo
        payload = {**self.payload_base, 'codigo_promocion': 'NO_EXISTE_123'}
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('codigo_promocion', response.data)

    def test_cupon_no_se_desactiva_si_falla_pasarela(self):
        from unittest.mock import patch
        from .models import OrdenCompra
        # E04: Si falla el inicio de pasarela, el cupón no debe quedar consumido (is_active debe ser True)
        payload = {
            **self.payload_base,
            'metodo_pago': 'TRANSBANK',
            'codigo_promocion': 'REINTENTO'
        }
        with patch('ecommerce.infrastructure.ventas.adapters.transbank_adapter.TransbankWebpayAdapter.iniciar_transaccion',
                   return_value={'exito': False, 'error': 'Fallo simulado Transbank'}):
            response = self.client.post(self.url, payload, format='json')
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Confirmar que la orden se eliminó
        self.assertEqual(OrdenCompra.objects.count(), 0)
        # Confirmar que el cupón sigue activo y listo para reintento
        self.promo_valida.refresh_from_db()
        self.assertTrue(self.promo_valida.is_active)

    def test_cupon_con_envio_gratis_y_desactivacion_exitosa(self):
        from .models import OrdenCompra
        # E03 & E04 éxito: Envío gratis si supera el umbral y desactivación solo tras éxito
        payload = {
            **self.payload_base,
            'codigo_promocion': 'REINTENTO'
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        orden = OrdenCompra.objects.latest('pk')
        # Subtotal 20000 - 10% (2000) = 18000; umbral 15000 alcanzado => costo_envio 0, total_final 18000
        self.assertEqual(orden.costo_envio, 0.0)
        self.assertEqual(orden.total_final, 18000.0)

        # El cupón debe quedar desactivado tras compra exitosa
        self.promo_valida.refresh_from_db()
        self.assertFalse(self.promo_valida.is_active)



class GestionPromocionesPermisosTests(APITestCase):
    """Solo el admin crea, edita o borra cupones: un comprador podría crearse uno del 100 %."""

    def setUp(self):
        self.promo = Promocion.objects.create(codigo='BASE10', tipo_descuento='PORCENTAJE', valor_descuento=10.0)
        self.lista = reverse('promociones-list-create')
        self.detalle = reverse('promociones-detail', args=[self.promo.id])
        self.nueva = {'codigo': 'GRATIS100', 'tipo_descuento': 'PORCENTAJE', 'valor_descuento': 100.0}

    def test_comprador_o_visitante_no_pueden_gestionar_cupones(self):
        comprador = create_user('comprador-cupones@example.test')
        for usuario, codigo_esperado in ((None, status.HTTP_401_UNAUTHORIZED), (comprador, status.HTTP_403_FORBIDDEN)):
            self.client.force_authenticate(usuario)
            with self.subTest(usuario=usuario):
                self.assertEqual(self.client.get(self.lista).status_code, codigo_esperado)
                self.assertEqual(self.client.post(self.lista, self.nueva, format='json').status_code, codigo_esperado)
                self.assertEqual(self.client.patch(self.detalle, {'valor_descuento': 100.0}, format='json').status_code,
                                 codigo_esperado)
                self.assertEqual(self.client.delete(self.detalle).status_code, codigo_esperado)
        self.assertFalse(Promocion.objects.filter(codigo='GRATIS100').exists())
        self.promo.refresh_from_db()
        self.assertEqual(self.promo.valor_descuento, 10.0)

    def test_admin_gestiona_cupones(self):
        self.client.force_authenticate(create_user('admin-cupones@example.test', rol='ADMIN'))
        self.assertEqual(self.client.post(self.lista, self.nueva, format='json').status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.client.delete(self.detalle).status_code, status.HTTP_204_NO_CONTENT)
