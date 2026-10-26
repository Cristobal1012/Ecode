# Manual de despliegue (RNF-04)

Un despliegue es una tienda. Este manual cubre la publicación con Docker (cualquier servidor con Docker), las
tareas programadas, los respaldos y el correo. La guía paso a paso de las tiendas de prueba en un servidor (Azure for
Students u Oracle Cloud) está en [`prueba-servidor.md`](prueba-servidor.md), y el resumen de las variables en
[`VARIABLES_ENTORNO.md`](VARIABLES_ENTORNO.md).

Toda la configuración va por variables de entorno, documentadas en `.env.example`. Las credenciales de los
proveedores **no** van en el entorno: el emprendedor las carga desde el panel (Configuración > Medios de pago y
Configuración > Envíos con Chilexpress) y se guardan cifradas con `CLAVE_CIFRADO_CREDENCIALES`. Si esa clave
cambia, hay que volver a cargarlas.

## Publicar con Docker

`deploy/docker-compose.yml` levanta una tienda completa: `web` (Caddy con el frontend compilado y las fotos),
`backend` (Django con gunicorn), `postgres` (PostgreSQL 15) y `mongo` (MongoDB 8.0). Los datos quedan en volúmenes
de Docker, las bases no publican puertos y el backend corre sin permisos de root. Requiere Docker Engine con el
plugin `docker compose`, y funciona en servidores x86 y ARM. Cada tienda usa unos 650 MB de RAM en reposo (la
mayor parte es la caché de MongoDB); calcula 1 GB por tienda.

### Variables de la tienda

Copia `deploy/tienda.env.example` **fuera del repositorio** (ej. `/opt/tiendas/mitienda.env`), completa los valores
y protégelo con `chmod 600`. Cada tienda tiene su propio archivo, con claves y contraseñas distintas.

- **Las claves no pueden tener `$`**, porque Docker Compose lo interpreta como una variable. Genera `SECRET_KEY` y
  `CLAVE_CIFRADO_CREDENCIALES` con `secrets.token_urlsafe(50)`, y las contraseñas de las bases con
  `secrets.token_hex(24)`, como indica la plantilla. No uses `get_random_secret_key` de Django.
- `ARCHIVO_TIENDA` es la ruta del mismo archivo: de ahí el backend lee todas sus variables.
- **Dos formas de atender el HTTPS:**
  - *Detrás de un proxy* que termina el HTTPS (como la prueba en Oracle): `DIRECCION_SITIO=:80`,
    `IP_WEB=127.0.0.1` y un `PUERTO_WEB` (y `PUERTO_WEB_HTTPS`) distinto por tienda. El proxy reenvía el dominio a
    `127.0.0.1:<PUERTO_WEB>`.
  - *Con el dominio propio en este Caddy*: `DIRECCION_SITIO=mitienda.cl`, `IP_WEB=0.0.0.0`, `PUERTO_WEB=80` y
    `PUERTO_WEB_HTTPS=443`. El dominio tiene que apuntar al servidor; Caddy obtiene y renueva el certificado solo.

### Primer arranque

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py createsuperuser
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py preparar_tienda_prueba --nombre "Mi Tienda"
```

- `-p` es el nombre de la tienda: separa sus contenedores y volúmenes de los de otras tiendas en el mismo servidor.
- Al arrancar, el backend aplica las migraciones y junta los estilos del admin de Django; no hay que hacerlo a mano.
- `createsuperuser` crea la cuenta del emprendedor (Admin): pide su correo, nombre, apellidos y una contraseña
  temporal fuerte.
- `preparar_tienda_prueba` deja la configuración inicial, Transbank en integración, una transferencia con datos
  ficticios y los borradores de las páginas legales. Se puede correr de nuevo: no pisa lo que el admin cambió.
  Después, el emprendedor completa y publica las páginas legales: sin ellas no se puede comprar.
- Comprueba que responde: `curl https://mitienda.cl/api/salud/` debe dar `{"estado": "ok", ...}`.

Los demás comandos usan la misma forma (`docker compose -p ... exec backend python manage.py <comando>`). Los
registros se ven con `docker compose -p ... logs -f backend`.

### Actualizar a una versión nueva

Respalda primero (abajo). Después, desde la carpeta del código:

```bash
git pull
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
```

Las migraciones corren solas al arrancar el backend. Los datos y las fotos se conservan, porque están en volúmenes.

### Respaldos

`deploy/respaldar.sh` guarda PostgreSQL, MongoDB y las fotos de una tienda en `<carpeta>/<AAAA-MM-DD>/<tienda>/`
y borra los respaldos de más de 7 días:

```bash
sh deploy/respaldar.sh mitienda /opt/tiendas/mitienda.env /opt/tiendas/respaldos
```

Prográmalo una vez al día (ej. a las 4:00 con cron) y descarga una copia fuera del servidor una vez por semana:
un respaldo que solo está en el mismo servidor se pierde con él.

### Restaurar un respaldo

Reemplaza los datos actuales de la tienda por los del respaldo. Con `D` la carpeta del respaldo
(ej. `/opt/tiendas/respaldos/2026-11-03/mitienda`) y `C` el comando base
(`docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env`):

```bash
$C stop backend web
$C exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < $D/postgres.dump
$C exec -T mongo sh -c 'mongorestore --quiet --archive --gzip --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < $D/mongo.archive.gz
$C run --rm -T --no-deps backend sh -c 'rm -rf /app/media/* && tar xzf - -C /app/media' < $D/media.tar.gz
$C start backend web
```

Prueba una restauración completa antes de entregar una tienda: un respaldo que nunca se restauró no está probado.

## Pasos después de cada versión nueva (sin Docker)

```bash
pip install -r requirements.txt   # ej. django-anymail (correo) y argon2-cffi (sin él no se puede iniciar sesión)
python manage.py migrate
python manage.py collectstatic --noinput   # estilos del admin de Django en STATIC_ROOT (los sirve whitenoise)
```

El backend se ejecuta con gunicorn (`gunicorn backend_project.wsgi --bind 0.0.0.0:8000`), no con `runserver`.
Los registros salen por la consola, con el nivel de `LOG_LEVEL`.

**Salud:** `GET /api/salud/` responde 200 con `{"estado": "ok", "postgres": "ok", "mongo": "ok"}` si las dos bases
responden, y 503 si alguna no. No muestra datos sensibles y no redirige a HTTPS, para que el chequeo interno
funcione sin pasar por el proxy. Úsalo en el healthcheck del contenedor y en el monitor externo.

## Archivos subidos por la tienda

Las imágenes que sube el emprendedor desde el panel se guardan en `MEDIA_ROOT` (por defecto `<proyecto>/media`) y
se publican en `MEDIA_URL` (por defecto `/media/`):

| Carpeta | Qué guarda |
|---|---|
| `negocio/` | Logo, favicon, portada y fotos de la página de inicio (Nosotros e Instagram) |
| `catalogo/productos/` | Fotos de los productos |
| `blog/portadas/` y `blog/fotos/` | Portada y galería de cada publicación del blog (si el emprendedor lo activa) |

- **La carpeta tiene que sobrevivir a cada versión nueva.** En un VPS o con Docker, monta un disco o volumen
  persistente en `MEDIA_ROOT`. En una plataforma sin disco persistente, las fotos se pierden al reiniciar.
- **Con `DEBUG=False`, Django no sirve estos archivos.** El servidor web (Nginx, Caddy u otro) tiene que publicar
  la carpeta `MEDIA_ROOT` en la ruta `MEDIA_URL`. Con `deploy/docker-compose.yml` ya está resuelto: las fotos van
  en el volumen `media` y las publica el Caddy de la tienda.
- **Respaldos:** respalda esta carpeta junto con PostgreSQL, porque los registros de la base apuntan a estos
  archivos.
- **Límites de subida:** las variables `CATALOGO_IMAGEN_*` de `.env.example` valen para todas las imágenes, también
  las del blog (por defecto, 5 MB por foto y 10 fotos por subida). Además, cada publicación del blog admite hasta
  10 fotos en su galería; ese tope es fijo.

## Tareas programadas

### Plazo de pago de las transferencias (cada hora)

Un pedido pagado por transferencia tiene el plazo que eligió la tienda en Configuración > Medios de Pago >
Transferencia: **12, 24, 48 o 72 horas** (48 si no eligió). El plazo queda fijo en cada pedido al crearse, así que
cambiarlo no afecta a los pedidos que ya existen. Este comando:

- a la mitad del plazo sin pago, le envía al comprador un recordatorio con los datos para transferir y la fecha
  límite (una sola vez por pedido);
- vencido el plazo, cancela el pedido con el motivo "Pago no recibido a tiempo" y avisa al comprador por correo.

```bash
python manage.py cancelar_pagos_vencidos
```

Django no lo ejecuta solo: hay que programarlo en el servidor. Se recomienda cada hora; así una orden se
cancela, a lo más, una hora después de vencer. Correrlo de más no tiene efectos: solo toca las órdenes por
transferencia que siguen Pendiente, y cada correo (recordatorio o cancelación) se envía una sola vez por orden.

- **VPS (cron):** con `crontab -e`, usando las rutas reales del proyecto y del entorno virtual, y con las
  mismas variables de entorno del backend:

  ```cron
  0 * * * * cd /ruta/al/proyecto && /ruta/al/venv/bin/python manage.py cancelar_pagos_vencidos >> /var/log/cancelar_pagos_vencidos.log 2>&1
  ```

- **Plataformas administradas (Render, Railway u otras):** crear un *Cron Job* con el mismo código y las
  mismas variables de entorno del backend, con la programación `0 * * * *` y el comando
  `python manage.py cancelar_pagos_vencidos`.
- **Docker:** ejecutar el comando dentro del contenedor del backend desde el cron del servidor, una línea por
  tienda y con rutas absolutas:

  ```cron
  0 * * * * docker compose -p mitienda -f /ruta/al/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/mitienda-pagos.log 2>&1
  ```

En desarrollo no hace falta programarlo: se puede correr a mano cuando se quiera probar.

Una orden cancelada no se puede volver a marcar como pagada desde el panel. Si un comprador transfiere después
de la cancelación, el emprendedor lo verá en su cuenta bancaria y decide si devuelve el dinero o le arma un
pedido nuevo.

## Enlaces de los correos y reseñas

- **`FRONTEND_URL` tiene que ser la dirección pública de la tienda.** Los correos llevan enlaces a ella: el
  seguimiento del pedido y, si el emprendedor activó las reseñas (Configuración > Reseñas de Clientes), el botón
  "Cuéntanos qué te pareció" del correo de pedido entregado. Con el valor de desarrollo, esos enlaces apuntan a
  `localhost` y no le sirven al comprador.
- **El enlace de la reseña va firmado con `SECRET_KEY`** y vence a los 60 días. Si la clave cambia, los enlaces
  ya enviados dejan de funcionar; los compradores registrados pueden dejar su reseña igual desde Mis pedidos.
- **Límites por IP:** el formulario de cotización (10 envíos por hora) y el de reseñas (20 por hora) cuentan los
  envíos en la caché de Django. Sin `CACHES` configurada, cada proceso del servidor lleva su propia cuenta, así que
  con varios procesos el límite se multiplica; no impide que la tienda funcione.

## Correo

El backend elige cómo enviar según las variables de entorno: la API HTTPS de **Resend** si hay
`RESEND_API_KEY`; si no, **SMTP** si hay `EMAIL_HOST`; y si no hay ninguna, los correos solo se imprimen en la
consola. El remitente que ve el comprador es `DEFAULT_FROM_EMAIL`.

Para probar que llegan, sin hacer una compra:

```bash
python manage.py sendtestemail correo@ejemplo.cl
```

### Mientras no haya dominio: Gmail por SMTP

En desarrollo y en las demos se usa una cuenta de Gmail, que entrega a cualquier dirección:

1. En la cuenta de Google, activar la verificación en 2 pasos y crear una contraseña de aplicación
   (myaccount.google.com/apppasswords).
2. Configurar `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_USE_TLS=True`, `EMAIL_HOST_USER` con la
   cuenta y `EMAIL_HOST_PASSWORD` con la contraseña de aplicación, nunca con la contraseña normal.
3. Dejar `RESEND_API_KEY` vacía (si tiene valor, se usa Resend) y poner en `DEFAULT_FROM_EMAIL` la misma
   cuenta, por ejemplo `Mi Tienda <cuenta@gmail.com>`; Gmail reemplaza cualquier otro remitente.

Limitaciones:

- Gmail permite unos 500 correos al día y algunos pueden llegar a spam: sirve para probar, no para una tienda real.
- Algunas plataformas bloquean los puertos SMTP en sus planes gratuitos (por ejemplo Render y Railway). Ahí los
  correos no salen por Gmail y hay que usar Resend.
- Con Resend y su remitente de prueba `onboarding@resend.dev`, solo se entrega a la dirección dueña de la cuenta
  de Resend: los compradores no reciben nada.

### En la tienda del cliente: Resend con dominio propio

Cuando el cliente tenga su dominio (lo compra y lo paga él), los correos salen desde ese dominio con Resend:

1. Crear la cuenta en resend.com con un correo del cliente, para que la cuenta quede a su nombre.
2. En **Domains > Add Domain**, ingresar el dominio (por ejemplo `mitienda.cl`) y elegir la región
   **South America (São Paulo)**, la más cercana a Chile.
3. Copiar en el DNS del dominio (NIC Chile, Cloudflare u otro) los registros que muestra Resend, con los
   nombres y valores exactos:
   - **DKIM:** un TXT en `resend._domainkey`.
   - **SPF:** un MX y un TXT en el subdominio `send`. No reemplazan los registros del correo que el
     cliente ya use.
   - **DMARC (opcional, recomendado):** un TXT en `_dmarc`, por ejemplo `v=DMARC1; p=none;`.
4. Presionar **Verify DNS Records** y esperar a que el dominio quede **Verified**. Suele tardar minutos,
   aunque los cambios de DNS pueden demorar hasta 48 horas.
5. En **API Keys**, crear una clave con permiso **Sending access** limitada a ese dominio.
6. Configurar `RESEND_API_KEY` con esa clave y `DEFAULT_FROM_EMAIL` con un remitente del dominio, por ejemplo
   `Mi Tienda <ventas@mitienda.cl>`. Las variables `EMAIL_*` pueden quedar vacías.
7. Reiniciar el backend y verificar:
   - `python manage.py sendtestemail` a una dirección que **no** sea la dueña de la cuenta de Resend.
   - Una compra completa con un correo de comprador distinto, que debe recibir el pedido recibido, el pago y
     el despacho, sin caer en spam. En **Emails**, Resend muestra el estado de cada envío.

El plan gratuito de Resend permite un dominio y 3.000 correos al mes (100 al día).
