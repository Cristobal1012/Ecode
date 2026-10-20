import os
import ssl
from unittest.mock import MagicMock, patch

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_project.settings')
django.setup()

from django.conf import settings
from django.contrib.auth.hashers import (
    Argon2PasswordHasher,
    BCryptSHA256PasswordHasher,
    check_password,
    get_hasher,
    make_password,
)
from django.test import SimpleTestCase, override_settings

from ecommerce.infrastructure.ventas.payment_services import (
    ErrorPasarelaPago,
    MercadoPagoAdapter,
    TLS12HttpAdapter,
)
from ecommerce.infrastructure.ventas.adapters.transbank_adapter import TransbankWebpayAdapter


class EstandaresCifradoContrasenasTests(SimpleTestCase):
    """
    Criterio de Aceptación 1 (SCRUM-82):
    Las contraseñas de todos los usuarios (emprendedores y compradores) deben
    almacenarse utilizando algoritmos de hashing fuertes, específicamente Argon2 o bcrypt.
    """

    def test_argon2_es_el_hasher_primario_por_defecto(self):
        hasher_por_defecto = get_hasher('default')
        self.assertIsInstance(hasher_por_defecto, Argon2PasswordHasher)
        self.assertEqual(hasher_por_defecto.algorithm, 'argon2')

    def test_bcrypt_esta_disponible_y_soportado(self):
        hasher_bcrypt = get_hasher('bcrypt_sha256')
        self.assertIsInstance(hasher_bcrypt, BCryptSHA256PasswordHasher)
        self.assertEqual(hasher_bcrypt.algorithm, 'bcrypt_sha256')

    def test_hasheo_por_defecto_genera_hash_argon2(self):
        clave_plana = "SuperPasswordSeguro2026!"
        clave_hasheada = make_password(clave_plana)
        self.assertTrue(clave_hasheada.startswith('argon2$'))
        self.assertTrue(check_password(clave_plana, clave_hasheada))

    def test_hasheo_con_bcrypt_es_reconocido_y_verificado(self):
        clave_plana = "SuperPasswordSeguro2026!"
        clave_hasheada = make_password(clave_plana, hasher='bcrypt_sha256')
        self.assertTrue(clave_hasheada.startswith('bcrypt_sha256$'))
        self.assertTrue(check_password(clave_plana, clave_hasheada))

    def test_contrasena_incorrecta_es_rechazada(self):
        clave_hasheada = make_password("PasswordCorrecto123!")
        self.assertFalse(check_password("PasswordErroneo456!", clave_hasheada))


class EstandaresConfiguracionHTTPSTests(SimpleTestCase):
    """
    Criterio de Aceptación 2 (SCRUM-82):
    La configuración del servidor debe forzar que toda la comunicación entre
    el cliente, el servidor y las APIs de pago se realice exclusivamente a través de HTTPS (TLS 1.2+).
    """

    def test_security_middleware_es_el_primero_en_la_cadena(self):
        self.assertTrue(
            settings.MIDDLEWARE[0] == 'django.middleware.security.SecurityMiddleware',
            "SecurityMiddleware debe ser el primer middleware para interceptar y forzar HTTPS.",
        )

    def test_politicas_hsts_y_cookies_seguras_fuera_de_desarrollo(self):
        # Verificar que settings tiene definidos los parámetros críticos de HTTPS
        self.assertTrue(hasattr(settings, 'SECURE_SSL_REDIRECT'))
        self.assertTrue(hasattr(settings, 'SESSION_COOKIE_SECURE'))
        self.assertTrue(hasattr(settings, 'CSRF_COOKIE_SECURE'))
        self.assertTrue(hasattr(settings, 'SECURE_HSTS_SECONDS'))
        self.assertTrue(hasattr(settings, 'SECURE_HSTS_INCLUDE_SUBDOMAINS'))
        self.assertTrue(hasattr(settings, 'SECURE_HSTS_PRELOAD'))

    def test_tls12_adapter_fuerza_version_minima_tls12(self):
        adapter = TLS12HttpAdapter()
        adapter.init_poolmanager(10, 10)
        # Verifica que el contexto SSL configure TLS 1.2 como versión mínima
        min_version = adapter.poolmanager.connection_pool_kw['ssl_context'].minimum_version
        self.assertGreaterEqual(min_version, ssl.TLSVersion.TLSv1_2)


class EstandaresPasarelasPagoHTTPSTests(SimpleTestCase):
    """
    Verifica que las comunicaciones hacia las APIs de pago (Mercado Pago, Transbank)
    exijan HTTPS y rechacen cualquier canal no seguro.
    """

    def test_mercadopago_adapter_rechaza_api_base_url_insegura(self):
        adapter = MercadoPagoAdapter(access_token="TEST-TOKEN", webhook_secret="TEST-SECRET")
        adapter.API_BASE_URL = "http://api.mercadopago.inseguro.com"

        with self.assertRaises(ErrorPasarelaPago) as ctx:
            adapter.consultar_pago("12345")
        self.assertIn("HTTPS", str(ctx.exception))

        with self.assertRaises(ErrorPasarelaPago) as ctx:
            adapter.crear_preferencia("101", 5000, {"success": "https://motienda.com/exito"})
        self.assertIn("HTTPS", str(ctx.exception))

    @override_settings(DEBUG=False)
    def test_mercadopago_adapter_rechaza_webhook_no_https_en_produccion(self):
        adapter = MercadoPagoAdapter(access_token="TEST-TOKEN", webhook_secret="TEST-SECRET")
        with self.assertRaises(ErrorPasarelaPago) as ctx:
            adapter.crear_preferencia(
                "101",
                5000,
                {"success": "https://motienda.com/exito"},
                notification_url="http://inseguro.com/api/ventas/webhooks/mercadopago/",
            )
        self.assertIn("HTTPS", str(ctx.exception))

    def test_mercadopago_session_usa_tls12_adapter(self):
        session = MercadoPagoAdapter._obtener_session()
        adapter_https = session.adapters.get("https://")
        self.assertIsInstance(adapter_https, TLS12HttpAdapter)

    @override_settings(DEBUG=False)
    def test_transbank_adapter_rechaza_return_url_no_https_en_produccion(self):
        with self.assertRaises(ValueError) as ctx:
            TransbankWebpayAdapter.iniciar_transaccion(
                orden_id="101",
                monto=15000,
                return_url="http://motienda.com/api/ventas/transbank/retorno/",
                session_id="ses-123",
            )
        self.assertIn("HTTPS", str(ctx.exception))
