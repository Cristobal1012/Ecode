"""Settings restricted to fresh SCRUM-177 databases and captured local mail."""
import os

from tools.qa.scrum177.prepare import targets

_destination = targets()  # Validate before base settings connect to MongoDB or read .env.
QA_ROOT = _destination['root']
os.environ.update({
    'DEBUG': 'True',
    'SECRET_KEY': 'scrum177-local-qa-signing-only-no-production',
    'CLAVE_CIFRADO_CREDENCIALES': 'scrum177-local-qa-encryption-only',
    'POSTGRES_DB': _destination['name'],
    'POSTGRES_USER': 'qa149', 'POSTGRES_PASSWORD': 'qa149-local-only',
    'POSTGRES_HOST': '127.0.0.1', 'POSTGRES_PORT': '55439',
    'MONGO_URI': 'mongodb://127.0.0.1:27049/' + _destination['name'],
    'MONGO_TEST_URI': 'mongodb://127.0.0.1:27049/',
    'RESEND_API_KEY': '', 'EMAIL_HOST': '', 'GOOGLE_CLIENT_ID': '',
    'DEFAULT_FROM_EMAIL': 'qa177@example.test',
    'SECURE_SSL_REDIRECT': 'False', 'SESSION_COOKIE_SECURE': 'False',
    'CSRF_COOKIE_SECURE': 'False', 'SECURE_HSTS_SECONDS': '0',
    'EXIGIR_PAGINAS_LEGALES': 'False',
    'ALLOWED_HOSTS': 'localhost,127.0.0.1,testserver',
    'CORS_ALLOWED_ORIGINS': 'http://localhost:5173,http://127.0.0.1:5173',
    'CSRF_TRUSTED_ORIGINS': 'http://localhost:5173,http://127.0.0.1:5173',
    'FRONTEND_URL': 'http://127.0.0.1:5173',
    'MEDIA_ROOT': str(QA_ROOT / 'media'),
})

from backend_project.settings import *  # noqa: F403,E402

DATABASES['default']['TEST'] = {'NAME': _destination['test_name']}
MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.filebased.EmailBackend',
                       'OPTIONS': {'file_path': str(QA_ROOT / 'mail')}}}
