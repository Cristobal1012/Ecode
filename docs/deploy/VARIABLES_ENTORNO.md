# Documentación de Variables de Entorno (.env)

Este documento resume las variables necesarias para desplegar el proyecto. Copia el archivo `.env.example` a `.env`
y configura los siguientes valores. El detalle y los valores de ejemplo están en `.env.example` (backend) y
`frontend/.env.example` (frontend); si agregas una variable, actualiza el `.env.example` que corresponda y este
documento.

## 1. Configuración Core y Seguridad (Django)
| Variable | Descripción |
| :--- | :--- |
| `DEBUG` | `True` para desarrollo. En producción omitir o usar `False` para activar ajustes de seguridad por defecto. |
| `SECRET_KEY` | Llave criptográfica de Django. Obligatoria si `DEBUG=False`. Cambiarla cierra todas las sesiones e invalida los enlaces de reseña ya enviados. |
| `CLAVE_CIFRADO_CREDENCIALES` | Cifra las credenciales de pago y de Chilexpress que el admin carga desde el panel. Obligatoria si `DEBUG=False`. Si cambia, hay que volver a cargar las credenciales. |
| `ALLOWED_HOSTS` | Dominios que atiende el backend (separados por coma). |
| `CORS_ALLOWED_ORIGINS` | URLs del frontend autorizadas para consumir la API. |
| `CSRF_TRUSTED_ORIGINS` | Orígenes HTTPS de confianza para formularios con CSRF. |
| `FRONTEND_URL` | URL pública del frontend. La usan las redirecciones tras el pago (Webpay) y los enlaces de los correos (seguimiento y reseñas). |
| `EXIGIR_PAGINAS_LEGALES` | Exige Términos y Condiciones y Política de Privacidad publicadas para comprar (activo por defecto en producción). |

## 2. Bases de Datos (PostgreSQL y MongoDB)
| Variable | Descripción |
| :--- | :--- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Nombre, usuario y contraseña de la base de datos relacional. |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Dirección y puerto del servidor PostgreSQL (ej. `5432`). |
| `MONGO_URI` | Cadena de conexión completa para MongoDB. |
| `MONGO_TEST_URI` | Opcional: Servidor donde los tests del catálogo crean bases temporales. |

## 3. Correos Electrónicos (Resend o SMTP)
El sistema prioriza Resend (`RESEND_API_KEY`) sobre SMTP (`EMAIL_HOST`). Si ambas faltan, los correos se imprimen en
consola. Los pasos para Gmail y Resend están en `README.md` de esta carpeta.

| Variable | Descripción |
| :--- | :--- |
| `RESEND_API_KEY` | Llave de API para usar el servicio de envío Resend. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS` | Configuración del servidor SMTP (ej. `smtp.gmail.com`, `587`, `True`). |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Cuenta de correo y su contraseña de aplicación (nunca la contraseña normal). |
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
| `MEDIA_ROOT`, `MEDIA_URL` | Ruta y URL de almacenamiento (por defecto `/media/`). La carpeta tiene que estar en un disco persistente. |
| `CATALOGO_IMAGEN_MAX_BYTES` | Peso máximo por imagen (ej. `5242880` = 5MB). |
| `CATALOGO_IMAGEN_MAX_ARCHIVOS`, `CATALOGO_IMAGEN_MAX_GALERIA` | Límites de subida por petición y por galería de producto. |
| `CATALOGO_IMAGEN_MAX_PIXELES` | Límite de megapíxeles para evitar ataques de descompresión (ej. `20000000`). |

## 6. Servidor
| Variable | Descripción |
| :--- | :--- |
| `STATIC_ROOT` | Carpeta donde `python manage.py collectstatic` junta los estilos del admin de Django (los sirve whitenoise). |
| `LOG_LEVEL` | Nivel de los registros en la consola: `DEBUG`, `INFO` (por defecto), `WARNING` o `ERROR`. |

## 7. Frontend (`frontend/.env`)
Vite las lee al compilar (`npm run build`) y quedan dentro del JavaScript publicado: aquí nunca va nada secreto.

| Variable | Descripción |
| :--- | :--- |
| `VITE_API_URL` | Dirección de la API terminada en `/api/`. En la tienda publicada, `/api/` (relativa); en desarrollo, si no se define, `http://localhost:8000/api/`. |

## 8. Publicación con Docker (`deploy/tienda.env.example`)
Además de las anteriores, el archivo de cada tienda lleva las variables del stack de `deploy/docker-compose.yml`.
`POSTGRES_HOST`, `POSTGRES_PORT`, `MONGO_URI`, `MEDIA_ROOT` y `STATIC_ROOT` las fija el stack: no van en el archivo.

| Variable | Descripción |
| :--- | :--- |
| `ARCHIVO_TIENDA` | Ruta del mismo archivo de la tienda: de ahí el backend lee todas sus variables. |
| `DIRECCION_SITIO` | `:80` detrás de un proxy que termina el HTTPS, o el dominio de la tienda para que su Caddy obtenga el certificado. |
| `IP_WEB`, `PUERTO_WEB`, `PUERTO_WEB_HTTPS` | Dónde publica la tienda. Detrás de un proxy: `127.0.0.1` y puertos distintos por tienda. Con dominio propio: `0.0.0.0`, `80` y `443`. |
| `MONGO_USUARIO`, `MONGO_CLAVE`, `MONGO_BASE` | Usuario, contraseña y base de MongoDB del stack. La contraseña, solo con letras y números. |
| `MONGO_CACHE_GB` | Caché de MongoDB en GB (por defecto `0.5`), para que varias tiendas compartan un servidor. |
| `GUNICORN_WORKERS`, `GUNICORN_THREADS` | Procesos e hilos del backend (por defecto `2` y `4`). |

## 9. Proveedores de Logística y Pago
Las credenciales de los medios de pago (Transbank, Mercado Pago, transferencia) y de Chilexpress **no van en el
`.env`**: el emprendedor las carga desde el panel (Configuración > Medios de pago y Configuración > Envíos con
Chilexpress) y se guardan cifradas con `CLAVE_CIFRADO_CREDENCIALES`. Nunca se escriben en archivos de configuración.

Las antiguas `TRANSBANK_ENVIRONMENT`, `TRANSBANK_WEBPAY_*` y `CHILEXPRESS_API_KEY_*` solo se leen una vez, al migrar,
para conservar la configuración de instalaciones anteriores. En un despliegue nuevo no se usan.
