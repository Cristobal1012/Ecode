# Documentación de Variables de Entorno (.env)

Este documento detalla todas las variables necesarias para desplegar el proyecto. Copia el archivo `.env.example` a `.env` y configura los siguientes valores. 

## 1. Configuración Core y Seguridad (Django)
| Variable | Descripción |
| :--- | :--- |
| `DEBUG` | `True` para desarrollo. En producción omitir o usar `False` para activar ajustes de seguridad por defecto. |
| `SECRET_KEY` | Llave criptográfica de Django. Obligatoria si `DEBUG=False`. Cambiarla cierra todas las sesiones. |
| `CLAVE_CIFRADO_CREDENCIALES` | Semilla para cifrar credenciales de pago desde el panel. Si cambia, hay que recargar las credenciales. |
| `ALLOWED_HOSTS` | Dominios que atiende el backend (separados por coma). |
| `CORS_ALLOWED_ORIGINS` | URLs del frontend autorizadas para consumir la API. |
| `CSRF_TRUSTED_ORIGINS` | Orígenes HTTPS de confianza para formularios con CSRF. |
| `FRONTEND_URL` | URL pública del frontend (usada para redirecciones tras pagos como Webpay). |
| `EXIGIR_PAGINAS_LEGALES` | Exige Términos y Condiciones para comprar (Activo por defecto en producción). |

## 2. Bases de Datos (PostgreSQL y MongoDB)
| Variable | Descripción |
| :--- | :--- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Nombre, usuario y contraseña de la base de datos relacional. |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Dirección y puerto del servidor PostgreSQL (ej. `5432`). |
| `MONGO_URI` | Cadena de conexión completa para MongoDB. |
| `MONGO_TEST_URI` | Opcional: Servidor donde los tests del catálogo crean bases temporales. |

## 3. Correos Electrónicos (Resend o SMTP)
El sistema prioriza Resend (`RESEND_API_KEY`) sobre SMTP (`EMAIL_HOST`). Si ambas faltan, los correos se imprimen en consola.
| Variable | Descripción |
| :--- | :--- |
| `RESEND_API_KEY` | Llave de API para usar el servicio de envío Resend. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS` | Configuración del servidor SMTP (ej. `smtp.gmail.com`, `587`, `True`). |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Credenciales de la cuenta de correo o contraseña de aplicación. |
| `DEFAULT_FROM_EMAIL` | Remitente visible para el comprador (ej. `Mi Tienda <ventas@mitienda.cl>`). |
| `EMAIL_TIMEOUT` | Segundos máximos de espera al servidor de correo (por defecto 10). |

## 4. HTTPS y Autenticación de Terceros
| Variable | Descripción |
| :--- | :--- |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth. Si se deja vacío, se desactiva el inicio de sesión con Google. |
| `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` | Ajustes HTTPS (activos por defecto si `DEBUG=False`). |
| `SECURE_HSTS_SECONDS`, `SECURE_HSTS_INCLUDE_SUBDOMAINS` | Configuración de cabeceras HSTS para forzar HTTPS en el navegador. |
| `CONFIAR_PROXY_HTTPS` | Confía en el encabezado `X-Forwarded-Proto` del proxy del hosting. |

## 5. Gestión de Imágenes del Catálogo
| Variable | Descripción |
| :--- | :--- |
| `MEDIA_ROOT`, `MEDIA_URL` | Ruta y URL de almacenamiento (por defecto `/media/`). |
| `CATALOGO_IMAGEN_MAX_BYTES` | Peso máximo por imagen (ej. `5242880` = 5MB). |
| `CATALOGO_IMAGEN_MAX_ARCHIVOS`, `CATALOGO_IMAGEN_MAX_GALERIA` | Límites de subida por petición y por galería de producto. |
| `CATALOGO_IMAGEN_MAX_PIXELES` | Límite de megapíxeles para evitar ataques de descompresión (ej. `20000000`). |

## 6. Proveedores de Logística y Pago
Actualmente, las plataformas de pago (Transbank, Mercado Pago) y logística (Chilexpress) **se configuran directamente desde el panel de administración** y sus credenciales se guardan cifradas. 

Si el despliegue inicial requiere inyectar estas credenciales vía `.env` por requerimientos de migración, se debe utilizar formato JSON:
```env
CREDENCIALES_PAGO='{"provider": "mercadopago", "public_key": "TEST-123", "access_token": "TEST-456"}'
CREDENCIALES_LOGISTICA='{"provider": "chilexpress", "api_key": "api123", "secret": "sec123", "endpoint": "..."}'