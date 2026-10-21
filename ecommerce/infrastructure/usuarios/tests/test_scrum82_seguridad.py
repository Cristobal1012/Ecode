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
    identify_hasher,
    make_password,
)
from django.http import HttpResponse
from django.middleware.security import SecurityMiddleware
from django.test import RequestFactory, SimpleTestCase, override_settings

from ecommerce.infrastructure.ventas.payment_services import (
    ErrorPasarelaPago,
    MercadoPagoAdapter,
    TLS12HttpAdapter,
)
from ecommerce.infrastructure.ventas.adapters.transbank_adapter import TransbankWebpayAdapter


class EstandaresCifradoContrasenasTests(SimpleTestCase):
    """
    Criterio de Aceptación 1 (SCRUM-82 / SCRUM-146):
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

    def test_migracion_transparente_de_bcrypt_a_argon2_en_login(self):
        """
        Al autenticar un usuario cuya contraseña esté guardada en bcrypt,
        Django debe verificarla exitosamente e invocar el setter para migrarla
        automáticamente al estándar vigente (Argon2).
        """
        clave_plana = "MigracionBcryptAArgon2026!"
        hash_bcrypt = make_password(clave_plana, hasher='bcrypt_sha256')

        hash_migrado = {}
        def upgrade_setter(raw_password):
            hash_migrado['nuevo_hash'] = make_password(raw_password)

        es_valido = check_password(clave_plana, hash_bcrypt, setter=upgrade_setter)
        self.assertTrue(es_valido)
        self.assertIn('nuevo_hash', hash_migrado)
        nuevo_alg = identify_hasher(hash_migrado['nuevo_hash']).algorithm
        self.assertEqual(nuevo_alg, 'argon2')

    def test_resistencia_passwords_largos_y_utf8(self):
        """Argon2 procesa contraseñas largas (>72 bytes) y caracteres UTF-8 sin truncamiento."""
        clave_larga = "Ñandú_Árbol_Criptográfico_#@$%^&*()_+" * 4
        hash_largo = make_password(clave_larga)
        self.assertTrue(check_password(clave_larga, hash_largo))
        self.assertFalse(check_password(clave_larga + "extra", hash_largo))

    def test_contrasena_incorrecta_es_rechazada(self):
        clave_hasheada = make_password("PasswordCorrecto123!")
        self.assertFalse(check_password("PasswordErroneo456!", clave_hasheada))


class EstandaresConfiguracionHTTPSTests(SimpleTestCase):
    """
    Criterio de Aceptación 2 (SCRUM-82 / SCRUM-147):
    La configuración del servidor debe forzar que toda la comunicación entre
    el cliente, el servidor y las APIs de pago se realice exclusivamente a través de HTTPS (TLS 1.2+).
    """

    def setUp(self):
        self.rf = RequestFactory()

    def test_security_middleware_es_el_primero_en_la_cadena(self):
        self.assertTrue(
            settings.MIDDLEWARE[0] == 'django.middleware.security.SecurityMiddleware',
            "SecurityMiddleware debe ser el primer middleware para interceptar y forzar HTTPS.",
        )

    def test_redireccion_301_permanente_en_http_inseguro_fuera_de_desarrollo(self):
        """Una petición HTTP sin cifrar debe ser redirigida con código 301 a su versión HTTPS."""
        with override_settings(
            ALLOWED_HOSTS=['testserver'],
            DEBUG=False,
            SECURE_SSL_REDIRECT=True,
        ):
            middleware = SecurityMiddleware(lambda r: HttpResponse("OK"))
            req = self.rf.get('/api/usuarios/login/')
            resp = middleware(req)
            self.assertEqual(resp.status_code, 301)
            self.assertEqual(resp['Location'], 'https://testserver/api/usuarios/login/')

    def test_cabecera_hsts_completa_en_peticion_https(self):
        """Peticiones HTTPS deben recibir Strict-Transport-Security con max-age=31536000, subdominios y preload."""
        with override_settings(
            ALLOWED_HOSTS=['testserver'],
            DEBUG=False,
            SECURE_HSTS_SECONDS=31536000,
            SECURE_HSTS_INCLUDE_SUBDOMAINS=True,
            SECURE_HSTS_PRELOAD=True,
        ):
            middleware = SecurityMiddleware(lambda r: HttpResponse("OK"))
            req_https = self.rf.get('/api/catalogo/', secure=True)
            resp = middleware(req_https)
            self.assertEqual(resp.status_code, 200)
            hsts = resp.get('Strict-Transport-Security', '')
            self.assertIn('max-age=31536000', hsts)
            self.assertIn('includeSubDomains', hsts)
            self.assertIn('preload', hsts)

    def test_evita_bucle_de_redireccion_detras_de_proxy_inverso(self):
        """Confiando en el proxy (HTTP_X_FORWARDED_PROTO), no se genera bucle 301 en peticiones terminadas en TLS."""
        with override_settings(
            ALLOWED_HOSTS=['testserver'],
            DEBUG=False,
            SECURE_SSL_REDIRECT=True,
            SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https'),
        ):
            middleware = SecurityMiddleware(lambda r: HttpResponse("OK"))
            req = self.rf.get('/api/catalogo/', HTTP_X_FORWARDED_PROTO='https')
            resp = middleware(req)
            self.assertEqual(resp.status_code, 200)

    def test_tls12_adapter_fuerza_version_minima_tls12_en_conexiones_directas(self):
        adapter = TLS12HttpAdapter()
        adapter.init_poolmanager(10, 10)
        min_version = adapter.poolmanager.connection_pool_kw['ssl_context'].minimum_version
        self.assertGreaterEqual(min_version, ssl.TLSVersion.TLSv1_2)

    def test_tls12_adapter_fuerza_version_minima_tls12_a_traves_de_proxies(self):
        """Garantiza que llamadas a través de proxies salientes (Egress proxy) también exigen TLS 1.2+."""
        adapter = TLS12HttpAdapter()
        proxy_pm = adapter.proxy_manager_for('http://proxy.corporativo.com:8080')
        min_version = proxy_pm.connection_pool_kw['ssl_context'].minimum_version
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

    def test_transbank_sdk_enruta_peticiones_con_tls12_adapter(self):
        """Verifica que el SDK de Transbank quede enlazado a la sesión con TLS12HttpAdapter."""
        TransbankWebpayAdapter._asegurar_tls12()
        session_tbk = TransbankWebpayAdapter._obtener_session_tls()
        adapter_https = session_tbk.adapters.get("https://")
        self.assertIsInstance(adapter_https, TLS12HttpAdapter)
        adapter_https.init_poolmanager(5, 5)
        min_ver = adapter_https.poolmanager.connection_pool_kw['ssl_context'].minimum_version
        self.assertGreaterEqual(min_ver, ssl.TLSVersion.TLSv1_2)

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
