# Manual de despliegue (RNF-04)

Un despliegue es una tienda: cada tienda se publica en su propia VPS de OpenCloud con el **plan de 4 GB de RAM**,
Ubuntu 24.04 y Docker, **una sola tienda por VPS**. Este manual explica cómo preparar el servidor, levantar la tienda,
programar sus tareas, respaldarla y ponerla en producción. El resumen de las variables está en
[`VARIABLES_ENTORNO.md`](VARIABLES_ENTORNO.md).

- Toda la configuración va por variables de entorno, en un archivo por tienda, documentadas en
  `deploy/tienda.env.example`.
- Las credenciales de los proveedores **no** van en ese archivo: el emprendedor las carga desde el panel
  (Configuración > Medios de pago y Configuración > Envíos por courier) y se guardan cifradas con
  `CLAVE_CIFRADO_CREDENCIALES`. Si esa clave cambia, hay que volver a cargarlas.
- Las cuentas de **Resend** (correo) y **Google Cloud** (inicio de sesión con Google) las crea el cliente, a su
  nombre, con el instructivo "Correo y acceso con Google para tu tienda" que se le entrega. El equipo de despliegue
  solo recibe la API key de Resend y el Client ID de Google y los pone en las variables.

La lista de pasos para dejar funcionando la tienda del cliente está en
[Poner en producción la tienda del cliente](#6-poner-en-producción-la-tienda-del-cliente).

## Qué se paga y qué no

Solo el servidor y el dominio se pagan sí o sí; el resto cobra por uso o es gratis. Precios aproximados de noviembre
de 2026: revísalos al contratar, porque cambian.

| Qué | Costo | Quién lo paga |
|---|---|---|
| Servidor: VPS de OpenCloud, plan de 4 GB de RAM | US$15 a US$20 al mes | Quien publica la tienda |
| Dominio `.cl` en NIC Chile | $9.990 al año, exento de IVA | El cliente, a su nombre |
| Dominio `.com` en Cloudflare Registrar | Unos US$10,46 al año, igual al renovar (en otras empresas, revisar el precio de renovación) | El cliente, a su nombre |
| Transbank Webpay Plus | Comisión por venta, según su contrato | El cliente |
| Mercado Pago | Comisión por venta, según el plazo en que libera el dinero | El cliente |
| Chilexpress | Tarifa de cada envío, cobrada a su TCC (el checkout se la cobra al comprador) | El cliente |
| Linkify (opcional, verifica las transferencias solo) | Según el plan | El cliente |
| Resend sobre 3.000 correos al mes o 100 al día | US$20 al mes (plan Pro) | El cliente |

**Gratis:** el software de la tienda (Django, React, PostgreSQL, MongoDB, Caddy y Docker, de código abierto), el
certificado HTTPS (Caddy lo obtiene y lo renueva con Let's Encrypt), Resend hasta 3.000 correos al mes, el DNS y el
reenvío de correos de Cloudflare (plan Free), el inicio de sesión con Google, la transferencia bancaria (solo lo que
cobre el banco del cliente), el retiro en local, la entrega coordinada, el monitoreo con un plan gratis como el de
UptimeRobot, los respaldos y las boletas y facturas con el sistema gratuito del SII u otro que elija la tienda.

## Cómo es una tienda

`deploy/docker-compose.yml` levanta la tienda completa:

```
Comprador ──HTTPS (80 y 443)──> web: Caddy (certificado automático, frontend compilado y fotos en /media/)
                                  └─ /api/ ──> backend: Django con gunicorn ──> postgres (PostgreSQL 15)
                                                                            └─> mongo (MongoDB 8.0)
```

Solo el Caddy de la tienda recibe visitas. Las bases no publican puertos, el backend corre sin permisos de root y los
datos quedan en volúmenes de Docker (las fotos en `media` y las de las cotizaciones en `privado`), que sobreviven a
cada versión nueva. El cron del servidor ejecuta las tareas programadas y los respaldos dentro del backend.

## 1. Preparar la VPS de OpenCloud

Los 4 GB son necesarios: la tienda usa unos 650 MB de RAM en reposo (medido), la mayor parte en MongoDB, y en un pico
puede acercarse a 1,5 GB (estimado a partir del código, sin medir):

- MongoDB crece hasta su caché (`MONGO_CACHE_GB`, 0,5 GB) más su propio consumo.
- El backend procesa completa en memoria cada foto que se sube: unos 200 MB por proceso con una foto de 20
  megapíxeles, y son 2 procesos (`GUNICORN_WORKERS`).

A eso se suman 300 a 400 MB de Ubuntu y Docker, más la memoria que pide compilar las imágenes en el servidor. Si falta
memoria, Linux cierra un proceso (casi siempre MongoDB) y la tienda se cae hasta que se reinicia.

Apenas OpenCloud entregue la máquina, comprueba desde tu computador que el SSH responde en el puerto **22** (el que
indique el panel puede no ser el que funciona). Después de levantar la tienda, comprueba el 80. Si el panel de
OpenCloud tiene un firewall, abre ahí el 22, el 80 y el 443.

```bash
ssh -o ConnectTimeout=10 root@<IP pública> true && echo "SSH OK"
curl -sI --max-time 10 http://<IP pública>/ | head -1
```

### Sistema y swap

\```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Santiago
# Parches de seguridad automáticos (en Ubuntu vienen activos; esto lo confirma)
sudo dpkg-reconfigure -plow unattended-upgrades
\```

Un swap de 2 GB hace que un pico de memoria ponga lenta la tienda unos segundos en vez de cerrar MongoDB. Si `swapon --show` ya muestra uno, sáltate esto:

\```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Usar el swap solo cuando falte memoria
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
\```

Compruébalo con `free -h`: la línea `Swap` debe decir `2.0Gi`.

### Configurar el firewall del servidor

Antes de activar UFW, permitir los puertos necesarios para administrar el servidor y recibir conexiones web:

\```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
\```

**Importante:** antes de activar UFW, comprobar que el acceso SSH funciona correctamente y que el puerto 22 está permitido. Así se evita perder el acceso remoto al servidor.

Activar el firewall:

\```bash
sudo ufw enable
\```

Comprobar las reglas:

\```bash
sudo ufw status verbose
\```

Deben encontrarse permitidos los siguientes puertos:

- `22/tcp`: conexión SSH.
- `80/tcp`: tráfico HTTP y validación de certificados.
- `443/tcp`: tráfico HTTPS.

Además del firewall UFW de Ubuntu, algunos proveedores VPS disponen de un firewall propio desde su panel de administración. Se deben permitir también estos puertos en dicho panel cuando corresponda.

### Usuario para administrar el servidor

Durante la preparación inicial del servidor se puede utilizar `root` para realizar tareas administrativas, como instalar paquetes, configurar SSH y crear usuarios.

Una vez creado el usuario `despliegue` y configurados sus permisos, las operaciones habituales de publicación deben realizarse con este usuario.

Para cambiar desde `root` al usuario de despliegue:

\```bash
su - despliegue
\```

Para comprobar que se está utilizando el usuario correcto:

\```bash
whoami
pwd
\```

El resultado de `whoami` debe ser `despliegue`.

Si se cierra la conexión SSH, se debe volver a conectar utilizando ese usuario:

\```bash
ssh despliegue@IP_DEL_SERVIDOR
\```

Se recomienda reservar el usuario `root` para tareas administrativas que realmente lo requieran.

### Docker
Docker Engine y el plugin `docker compose`, desde el repositorio oficial de Docker:

```bash
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Usuario y acceso por SSH

Un usuario para operar la tienda, en el grupo `docker`, y la carpeta de trabajo:

```bash
sudo adduser --disabled-password despliegue
sudo usermod -aG docker despliegue
sudo mkdir -p /opt/tiendas/respaldos && sudo chown -R despliegue: /opt/tiendas
```

Copia en `/home/despliegue/.ssh/authorized_keys` las claves públicas del equipo (con permisos `700` la carpeta y
`600` el archivo, a nombre de `despliegue`). El SSH queda solo con clave: compruébalo con
`sudo sshd -T | grep passwordauthentication`, que debe decir `no`.

Si dice `yes` (algunos proveedores lo activan en `/etc/ssh/sshd_config.d/50-cloud-init.conf`), crea un archivo que se
lea antes que ese, sin editar los del proveedor. SSH usa el primer valor que encuentra:

```bash
printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin prohibit-password' \
  | sudo tee /etc/ssh/sshd_config.d/00-solo-llave.conf > /dev/null
sudo sshd -t && sudo systemctl reload ssh
```

`sshd -t` revisa la configuración antes de aplicarla. **No cierres la sesión** hasta comprobar, desde otra terminal,
que entras con la clave. Si algo falla, la consola web de OpenCloud sigue entrando con la contraseña de root, porque
no pasa por el SSH.

### Aplicar los permisos de Docker

Después de agregar el usuario `despliegue` al grupo `docker`, es necesario iniciar una nueva sesión SSH para que los permisos se apliquen.

Desde otra terminal, ingresar al servidor:

\```bash
ssh despliegue@IP_DEL_SERVIDOR
\```

Comprobar que se está utilizando el usuario correcto y que Docker funciona sin `sudo`:

\```bash
whoami
docker ps
docker compose version
\```

El comando `whoami` debe mostrar `despliegue`. Si Docker funciona correctamente, el usuario ya puede administrar los contenedores sin utilizar `sudo`.

## 2. Configurar y levantar la tienda

### Código y archivo de variables

El repositorio en GitHub es privado: la VPS necesita una llave de solo lectura (*deploy key*) para clonarlo y
actualizarlo. Como `despliegue`, crea la llave y muestra su parte pública:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/repositorio -N "" -C "tienda mitienda"
cat ~/.ssh/repositorio.pub
```

Un administrador del repositorio la agrega en GitHub, en **Settings > Deploy keys > Add deploy key**, con un nombre
que identifique la tienda y **sin** marcar *Allow write access*. Cada VPS tiene su propia llave: si una tienda se da
de baja, se borra solo la suya. Después, como `despliegue`:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/repositorio" git clone git@github.com:<dueño>/<repositorio>.git /opt/tiendas/codigo
cd /opt/tiendas/codigo && git checkout main
# Para que los git pull de cada actualización usen la misma llave
git config core.sshCommand "ssh -i ~/.ssh/repositorio"
cp deploy/tienda.env.example /opt/tiendas/mitienda.env
chmod 600 /opt/tiendas/mitienda.env
```

La primera conexión pregunta si se confía en el servidor de GitHub: antes de responder `yes`, compara la huella que
muestra con las publicadas en la documentación de GitHub ("GitHub's SSH key fingerprints").

El archivo va **fuera del repositorio**. En él:

- `ARCHIVO_TIENDA=/opt/tiendas/mitienda.env`: la ruta del mismo archivo, de donde el backend lee sus variables.
- La dirección: `DIRECCION_SITIO=mitienda.cl`, `IP_WEB=0.0.0.0`, `PUERTO_WEB=80` y `PUERTO_WEB_HTTPS=443`. Así el
  Caddy de la tienda atiende el HTTPS y obtiene su certificado solo. El dominio tiene que apuntar al servidor
  ([6.1](#61-dominio-dns-y-servidor)); para atender también `www`, ver [6.2](#62-la-tienda-con-su-dominio).
- `ALLOWED_HOSTS` con la dirección, y `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL` con `https://`
  y la dirección.
- `SECRET_KEY`, `CLAVE_CIFRADO_CREDENCIALES`, `POSTGRES_PASSWORD` y `MONGO_CLAVE` **propias de esta tienda**. **No
  pueden tener `$`**, porque Docker Compose lo interpreta como una variable: genera las dos claves con
  `secrets.token_urlsafe(50)` y las contraseñas con `secrets.token_hex(24)`, como indica la plantilla. No uses
  `get_random_secret_key` de Django.
- `GOOGLE_CLIENT_ID`: el Client ID que entrega el cliente ([6.4](#64-inicio-de-sesión-con-google)).
- Correo: la API key de Resend que entrega el cliente ([4. Correo](#4-correo)).
- `SECURE_HSTS_SECONDS=3600`. Súbelo a `31536000` solo cuando todo funcione.

### Validar cambios en el archivo de variables

Cuando se modifica el archivo de variables de una tienda, es importante comprobar que Docker Compose puede interpretar correctamente su contenido antes de reiniciar los servicios.

Editar el archivo correspondiente:

\```bash
nano /opt/tiendas/mitienda.env
\```

Asegurar que solamente el usuario de despliegue tenga acceso al archivo:

\```bash
chmod 600 /opt/tiendas/mitienda.env
\```

Validar la configuración de Docker Compose:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env config --quiet
\```

Si el comando termina sin mostrar errores, la configuración pudo interpretarse correctamente.

Después de modificar variables que utiliza el backend, reiniciar ese servicio:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env restart backend
\```

Comprobar que el contenedor esté funcionando:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env ps
\```

Si el servicio no inicia correctamente, revisar sus registros:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=100 backend
\```

**Importante:** `config --quiet` valida la configuración de Compose, pero no garantiza que las credenciales externas sean correctas ni que los servicios puedan conectarse entre sí.

### Primer arranque

Como `despliegue`, desde `/opt/tiendas/codigo`. La primera compilación tarda varios minutos:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py createsuperuser
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py preparar_tienda_prueba --nombre "Mi Tienda"
```

- `-p` es el nombre de la tienda: nombra sus contenedores y volúmenes; usa siempre el mismo.
- Al arrancar, el backend aplica las migraciones y junta los estilos del admin de Django; no hay que hacerlo a mano.
- `createsuperuser` crea la cuenta del emprendedor (Admin): su correo, nombre, apellidos y una contraseña temporal
  fuerte, que se le entrega por otro canal (nunca en el mismo correo que la dirección de la tienda).
- `preparar_tienda_prueba` deja la configuración inicial, Transbank en integración, una transferencia con datos
  ficticios y los borradores de las páginas legales. Se puede correr de nuevo: no pisa lo que el admin cambió.
  Después, el emprendedor completa y publica las páginas legales: sin ellas no se puede comprar.
- **Los dos medios de pago que deja habilitados son de prueba.** Con Transbank en integración, un comprador puede
  pagar con una tarjeta de prueba y el pedido queda Pagado sin que entre dinero; la transferencia muestra una cuenta
  ficticia. No abras la tienda al público hasta cambiarlos o deshabilitarlos
  ([6.5](#65-medios-de-pago-reales)).

Comprueba que responde: `curl https://mitienda.cl/api/salud/` debe dar
`{"estado": "ok", "postgres": "ok", "mongo": "ok"}`, y el navegador debe mostrar el candado. `/api/salud/` responde
503 si alguna base no contesta, no muestra datos sensibles y no redirige a HTTPS, para que el chequeo interno del
contenedor funcione. Es la misma dirección que revisa el monitor externo.

Los demás comandos usan la misma forma (`docker compose -p ... exec backend python manage.py <comando>`). Los
registros se ven con `docker compose -p ... logs -f backend`.

**No corras las pruebas (`python manage.py test`) en el servidor de una tienda.** Usan las mismas bases de datos del
servidor: crean y borran bases de prueba junto a las de la tienda, y una prueba mal aislada puede borrar datos reales
(en noviembre de 2026, dos pruebas borraban el catálogo al correr; ya están corregidas). Las pruebas se corren en el
computador de desarrollo o en el CI, nunca donde hay una tienda con datos.

### Archivos que sube la tienda

Las imágenes que sube el emprendedor desde el panel se guardan en el volumen `media` de la tienda y las publica su
Caddy en `/media/`:

| Carpeta | Qué guarda |
|---|---|
| `negocio/` | Logo, favicon, portada, fotos del carrusel de la portada (`negocio/banners/`) y fotos de la página de inicio (Nosotros e Instagram) |
| `catalogo/productos/` | Fotos de los productos |
| `blog/portadas/` y `blog/fotos/` | Portada y galería de cada publicación del blog (si el emprendedor lo activa) |

- **El volumen sobrevive a cada versión nueva:** `up -d --build` no lo toca. Solo `down -v` lo borra.
- **Respaldos:** `respaldar.sh` lo guarda en `media.tar.gz`, junto con PostgreSQL, porque los registros de la base
  apuntan a estos archivos.
- **Límites de subida:** las variables `CATALOGO_IMAGEN_*` valen para todas las imágenes, también las del blog y las
  de las cotizaciones (por defecto, 5 MB por foto y 10 fotos por subida). Además, cada publicación del blog admite
  hasta 10 fotos en su galería y cada cotización hasta 3; esos topes son fijos.

Las fotos que adjunta un cliente al pedir una cotización **no** van con las demás: se guardan en el volumen `privado`
(en `cotizaciones/<número>/`), que solo monta el backend, y solo las entrega la API al admin con su sesión. Se vuelven
a codificar al subirlas, sin los datos de la cámara (ej. la ubicación GPS). **Nunca publiques esta carpeta** en el
servidor web: cualquiera con el enlace vería las fotos de los clientes. Por eso el Caddy de la tienda no la monta.
`respaldar.sh` la guarda en `privado.tar.gz`.

## 3. Tareas programadas y respaldos

Django no ejecuta estas tareas solo: se programan en el cron del servidor y corren dentro del contenedor del backend.
Correrlas de más no tiene efectos, y cada correo que envían sale una sola vez por pedido.

| Tarea | Cuándo | Qué hace | Si no se programa |
|---|---|---|---|
| `cancelar_pagos_vencidos` | Cada hora | A la mitad del plazo de una transferencia sin pago, envía un recordatorio con los datos y la fecha límite; vencido el plazo, cancela el pedido ("Pago no recibido a tiempo") y avisa al comprador | Los pedidos por transferencia quedan Pendiente |
| `procesar_suscripciones` | 3:15, solo si la tienda activó las suscripciones | Crea el pedido de cada ciclo antes de la entrega y envía el aviso de cobro; cancela los ciclos no pagados al terminar el día de la entrega, y la suscripción si nunca se pagó el primero | Solo se cobra el primer ciclo |
| `limpiar_imagenes_catalogo` | 3:30, antes del respaldo | Reintenta borrar las fotos que no se pudieron borrar del disco (hasta 100 por vez, `--limite` para cambiarlo); nunca borra una que un producto use | Se acumulan en el disco |
| `deploy/respaldar.sh` | 4:00 | Guarda PostgreSQL, MongoDB, las fotos y los archivos privados en `<carpeta>/<AAAA-MM-DD>/<tienda>/` y borra los de más de 7 días | No hay respaldos |

- **Transferencias:** el plazo lo elige la tienda en Configuración > Medios de Pago > Transferencia: 12, 24, 48 o 72
  horas (48 si no eligió). Queda fijo en cada pedido al crearse, así que cambiarlo no afecta a los que ya existen.
  Una orden cancelada no se puede volver a marcar como pagada: si el comprador transfiere tarde, el emprendedor lo
  verá en su cuenta bancaria y decide si devuelve el dinero o le arma un pedido nuevo.
- **Suscripciones** (vienen apagadas; se activan en Configuración > Suscripciones): cada ciclo es un pedido normal.
  El pedido se crea los días antes de la entrega que eligió la tienda (3 si no eligió), con el enlace "Pagar esta
  entrega". Un ciclo no pagado se cancela con el motivo "Ciclo de suscripción no pagado" y la suscripción pasa al
  siguiente; si nunca se pagó el primero, se cancela ("No se recibió el pago del primer ciclo"). Sus pedidos no los
  cancela `cancelar_pagos_vencidos`. Si un día no corre, al siguiente cierra todos los ciclos atrasados con un solo
  aviso; con el módulo apagado no hace nada.

`crontab -e` como `despliegue` (la hora es la de Santiago), con rutas absolutas:

```cron
# Plazo de pago de las transferencias, cada hora
0 * * * * docker compose -p mitienda -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/mitienda-pagos.log 2>&1
# Suscripciones (solo hacen algo si la tienda las activó): aviso de cobro y ciclos vencidos, una vez al día
15 3 * * * docker compose -p mitienda -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py procesar_suscripciones >> /opt/tiendas/mitienda-suscripciones.log 2>&1
# Fotos del catálogo que quedaron sin borrar, una vez al día y antes de los respaldos
30 3 * * * docker compose -p mitienda -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py limpiar_imagenes_catalogo >> /opt/tiendas/mitienda-imagenes.log 2>&1
# Respaldos diarios (se guardan 7 días)
0 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh mitienda /opt/tiendas/mitienda.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
```

Una vez por semana, descarga una copia de `/opt/tiendas/respaldos/` fuera del servidor (ej. con `scp`): un respaldo
que solo está en el mismo servidor se pierde con él.

## 4. Correo

El backend elige cómo enviar según las variables de entorno: la API HTTPS de **Resend** si hay `RESEND_API_KEY`; si no, **SMTP** si hay `EMAIL_HOST`; y si no hay ninguna, los correos solo se imprimen en la consola. El remitente que ve el comprador es `DEFAULT_FROM_EMAIL`.

### Probar el envío de correo desde la VPS

Para comprobar que los correos llegan correctamente, sin necesidad de realizar una compra, ejecutar el siguiente comando desde la carpeta del repositorio:

\```bash
cd /opt/tiendas/codigo

docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py sendtestemail correo@ejemplo.cl
\```

Reemplazar `correo@ejemplo.cl` por una dirección de correo a la que se tenga acceso.

Si el envío no funciona, revisar los registros del backend:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=100 backend
\```

También comprobar que `RESEND_API_KEY` y `DEFAULT_FROM_EMAIL` estén correctamente configurados en el archivo de variables de la tienda.

La prueba se considera exitosa cuando el correo llega a la bandeja de entrada del destinatario.

**Si el comprador responde un correo del pedido**, la respuesta va al **correo de contacto** de la tienda
(Configuración > Contacto y Redes), no al remitente: Resend solo envía, y una dirección como `ventas@mitienda.cl` no
recibe nada salvo que el dominio tenga un buzón. Por eso el emprendedor carga un correo de contacto que sí lea (puede
ser su Gmail). Si quiere que `ventas@mitienda.cl` también reciba, le crea un buzón (Google Workspace, Zoho u otro) o
lo reenvía a su correo con el reenvío gratuito de Cloudflare (Email Routing, en el paso 6 de
[6.1](#61-dominio-dns-y-servidor)). Sin correo de contacto, las respuestas van al remitente.

### Resend con el dominio del cliente

La cuenta de Resend la crea el cliente, a su nombre, con el instructivo "Correo y acceso con Google para tu tienda":
crea la cuenta, agrega y verifica su dominio y crea la API key. El equipo de despliegue no crea esa cuenta; recibe la
clave y:

1. Configura `RESEND_API_KEY` con la clave y `DEFAULT_FROM_EMAIL` con un remitente del dominio, ej.
   `Mi Tienda <ventas@mitienda.cl>`. Las variables `EMAIL_*` pueden quedar vacías.
2. Reinicia el backend y verifica con `sendtestemail` a una dirección que **no** sea la dueña de la cuenta de Resend.
3. Hace una compra completa con otro correo: deben llegar el pedido recibido, el pago y el despacho, sin caer en
   spam. Si no llegan, el cliente revisa en Resend (**Domains** y **Emails**) que el dominio esté **Verified** y el
   estado de cada envío.

El plan gratuito de Resend permite 1 dominio por cuenta y 3.000 correos al mes (100 al día); por eso cada cliente
tiene su propia cuenta. Un pedido envía unos 4 o 5 correos, así que alcanza para unos 20 pedidos al día; pasado el
límite diario, los correos siguientes no salen hasta el día siguiente.

### Enlaces de los correos, reseñas y contraseñas

- **`FRONTEND_URL` tiene que ser la dirección pública de la tienda.** De ella salen los enlaces de seguimiento del
  pedido, de reseña ("Cuéntanos qué te pareció", si el emprendedor activó las reseñas) y de nueva contraseña.
- **El enlace de la reseña va firmado con `SECRET_KEY`** y vence a los 60 días. Si la clave cambia, los enlaces ya
  enviados dejan de funcionar; los compradores registrados pueden dejar su reseña igual desde Mis pedidos.
- **Recuperar la contraseña** depende de que el correo funcione: sin correo configurado, el enlace solo se imprime en
  la consola del backend. El enlace vence en 1 hora, sirve una sola vez y también se invalida si cambia `SECRET_KEY`.
  Las sesiones abiertas en otros dispositivos no se cierran: vencen solas en máximo 1 día (`REFRESH_TOKEN_LIFETIME`).
- **Límites por IP:** el formulario de cotización (10 envíos por hora), el de reseñas (20 por hora), el pedido del
  enlace de contraseña (5 por hora) y elegir o cambiar la contraseña (10 por hora; con la sesión iniciada, por
  cuenta) cuentan los envíos en la caché de Django. Sin `CACHES` configurada, cada proceso del servidor lleva su
  propia cuenta, así que el límite se multiplica; no impide que la tienda funcione.

## 5. Mantenimiento

### Monitoreo y revisión semanal

- Un monitor gratuito (ej. UptimeRobot) revisa `https://mitienda.cl/api/salud/` cada 5 minutos y avisa por correo al
  equipo. Responde 503 si alguna base no contesta.
- Cada semana: `docker compose -p mitienda ... ps` (todo `healthy`), `free -h` y `df -h` (memoria y disco), los
  errores de `docker compose -p mitienda ... logs --since 24h backend` y el estado del monitor.

### Actualizar a una versión nueva

Avisa antes al emprendedor y respalda. Después, desde `/opt/tiendas/codigo`:

```bash
git pull
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
```

Las migraciones corren solas al arrancar el backend. Los datos y las fotos se conservan, porque están en volúmenes.

### Respaldar a mano

```bash
sh deploy/respaldar.sh mitienda /opt/tiendas/mitienda.env /opt/tiendas/respaldos
```

### Restaurar un respaldo

Reemplaza los datos actuales de la tienda por los del respaldo. Prueba una restauración completa antes de entregar
una tienda: un respaldo que nunca se restauró no está probado. Con `D` la carpeta del respaldo
(ej. `/opt/tiendas/respaldos/2026-11-03/mitienda`) y `C` el comando base
(`docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env`):

```bash
$C stop backend web
$C exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < $D/postgres.dump
$C exec -T mongo sh -c 'mongorestore --quiet --archive --gzip --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < $D/mongo.archive.gz
$C run --rm -T --no-deps backend sh -c 'rm -rf /app/media/* && tar xzf - -C /app/media' < $D/media.tar.gz
# Si el respaldo trae privado.tar.gz (desde que existen las fotos de las cotizaciones)
$C run --rm -T --no-deps backend sh -c 'rm -rf /app/privado/* && tar xzf - -C /app/privado' < $D/privado.tar.gz
$C start backend web
```

### Mover una tienda a otro servidor

La misma tienda, con sus claves, en otra VPS de OpenCloud de 4 GB. El servidor nuevo se prepara como en
[1. Preparar la VPS de OpenCloud](#1-preparar-la-vps-de-opencloud).

1. **Respalda en el servidor de origen** con `respaldar.sh`. Avísale al emprendedor que no haga cambios desde ese
   momento: lo que cambie después del respaldo no pasa al servidor nuevo.
2. **Copia el archivo de la tienda sin cambiar sus claves** (`scp`, y `chmod 600` en el servidor nuevo). Con otra
   `CLAVE_CIFRADO_CREDENCIALES`, las llaves de pagos y envíos cargadas en el panel quedan ilegibles. Con otra
   `SECRET_KEY`, dejan de funcionar las sesiones abiertas y los enlaces de reseña y de contraseña de los correos ya
   enviados. Cambia solo lo que depende del servidor: `ARCHIVO_TIENDA` si cambia la ruta, y la dirección si cambia.
3. **Clona el código en el servidor nuevo**, como en [Código y archivo de variables](#código-y-archivo-de-variables),
   y copia la carpeta del respaldo. Las imágenes se compilan ahí mismo en el paso siguiente.
4. **Restaura sobre la tienda vacía.** Con `C` y `D` como en [Restaurar un respaldo](#restaurar-un-respaldo), primero
   solo las bases, y la tienda completa al final:

   ```bash
   $C build
   $C up -d --wait postgres mongo
   $C exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < $D/postgres.dump
   $C exec -T mongo sh -c 'mongorestore --archive --gzip --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < $D/mongo.archive.gz
   $C run --rm -T --no-deps backend sh -c 'tar xzf - -C /app/media' < $D/media.tar.gz
   $C run --rm -T --no-deps backend sh -c 'tar xzf - -C /app/privado' < $D/privado.tar.gz
   $C up -d --wait
   ```

   `mongorestore` debe terminar con `N document(s) restored successfully. 0 document(s) failed to restore`. Si el
   servidor nuevo tiene una versión más reciente, el backend aplica sus migraciones al arrancar.
5. **Comprueba** que `/api/salud/` responde `ok`, que el catálogo y las fotos cargan, y que los couriers con llave
   aparecen en `/api/configuracion/` (`couriers`). Si no aparecen, la `CLAVE_CIFRADO_CREDENCIALES` no es la misma.
6. **Fuera del servidor:** apunta los registros **A** del dominio a la IP nueva. Si cambia la dirección de la tienda,
   el cliente la agrega en Google (inicio de sesión) y se le avisa.
7. **Apaga la tienda de origen** con `$C down` cuando la nueva funcione. Sus datos se borran con `$C down -v`: hazlo
   solo cuando estés seguro, y conserva el respaldo.

## 6. Poner en producción la tienda del cliente

Ocho pasos, en orden, para dejar funcionando la tienda del cliente. Los costos de cada paso están en
[Qué se paga y qué no](#qué-se-paga-y-qué-no).

### 6.1 Dominio, DNS y servidor

El dominio y su DNS quedan en la cuenta de Cloudflare **del cliente**, que la crea él con la guía "Cómo comprar el
dominio de tu tienda" que se le entrega. Cloudflare se usa para tres cosas:

| Uso | ¿Obligatorio? | Para qué |
|---|---|---|
| **DNS** | Sí, siempre | Los registros `@` y `www` hacia la VPS, y los de Resend |
| **Cloudflare Registrar** | Solo si el dominio es `.com` y se compra ahí | Comprar y renovar el dominio, a precio de costo |
| **Email Routing** | No, opcional | Que una dirección del dominio (ej. `ventas@mitienda.cl`) reciba correos y los reenvíe al correo del cliente |

El equipo de despliegue no necesita la clave de Cloudflare: le indica al cliente los registros, o el cliente le da
acceso de forma segura si prefiere que los agregue el equipo.

1. **La VPS** de OpenCloud de 4 GB, preparada como en
   [1. Preparar la VPS de OpenCloud](#1-preparar-la-vps-de-opencloud). Anota su IP.
2. **El dominio y la cuenta de Cloudflare**, según el tipo de dominio:
   - **Si es `.cl`:** el cliente lo compra a su nombre en NIC Chile ($9.990 al año, exento de IVA). NIC Chile solo
     registra el dominio: no guarda registros (A, TXT, MX). Por eso el cliente crea su cuenta en Cloudflare, agrega el
     dominio con el plan **Free** y pega en NIC Chile (**Mis dominios > Configuración Técnica > Servidores DNS**, y
     luego **Actualizar datos de dominio**) los dos servidores de nombre que le muestra Cloudflare (ej.
     `ana.ns.cloudflare.com` y `bob.ns.cloudflare.com`). Cloudflare le avisa por correo cuando el dominio queda
     activo: suele tardar menos de una hora, y puede llegar a 48.
   - **Si es `.com`:** el cliente lo compra a su nombre en Cloudflare Registrar (unos US$10,46 al año, el mismo
     precio al renovar). Al comprarlo ya tiene la cuenta y el DNS listos.

   Un `.com` comprado en otra empresa (Namecheap, GoDaddy, Hostinger u otra) también sirve: los registros del paso 3
   van en el panel de DNS de esa empresa, igual que en Cloudflare. En ese panel hay que desactivar el **"parking"** o
   la redirección del registrador (su página con publicidad) y cualquier opción de **proxy o CDN**. Ahí no existe el
   Email Routing de Cloudflare: algunos registradores tienen su propio reenvío.
3. **Los registros hacia la VPS (igual para `.cl` y `.com`).** En Cloudflare, **DNS > Records**, dos registros **con
   la nube gris ("Solo DNS")**:

   | Tipo | Nombre | Contenido |
   |---|---|---|
   | A | `@` (es `mitienda.cl`) | la IP de la VPS |
   | A | `www` | la IP de la VPS |

   Con la nube naranja, el tráfico pasa por Cloudflare antes de llegar al servidor y el Caddy de la tienda puede no
   obtener su certificado HTTPS. La tienda ya tiene HTTPS propio: no hace falta el proxy de Cloudflare.
4. **Comprueba desde la VPS** que el dominio ya apunta a su IP antes de levantar la tienda: `dig +short mitienda.cl` y
   `dig +short www.mitienda.cl` deben devolver esa IP.
5. **Los registros de Resend** los agrega el cliente en el mismo panel, con el instructivo
   ([Resend con el dominio del cliente](#resend-con-el-dominio-del-cliente)).
6. **Email Routing (opcional).** Si el cliente quiere que `ventas@mitienda.cl` también reciba correos, en Cloudflare
   entra a **Email > Email Routing**, crea esa dirección con destino a su correo (ej. su Gmail), confirma el destino
   con el enlace que le llega y deja que Cloudflare agregue sus registros MX en el dominio raíz. No chocan con los de
   Resend, que van en el subdominio `send`. Sin esto la tienda funciona igual: las respuestas de los compradores
   llegan al correo de contacto ([4. Correo](#4-correo)).

### 6.2 La tienda con su dominio

El Caddy de la tienda atiende el HTTPS: no hace falta otro servidor web. En su archivo de variables:

- `DIRECCION_SITIO="mitienda.cl, www.mitienda.cl"`, `IP_WEB=0.0.0.0`, `PUERTO_WEB=80` y `PUERTO_WEB_HTTPS=443`.
  Caddy obtiene un certificado para cada una, y quien entra por `www.mitienda.cl` llega a `mitienda.cl` con la misma
  ruta: la tienda queda en una sola dirección, porque la sesión y el carrito del navegador se guardan por dirección.
  Las comillas van porque el valor tiene un espacio.
- `ALLOWED_HOSTS=mitienda.cl`, y `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL` con
  `https://mitienda.cl`. No hace falta agregar `www`: Caddy redirige antes de que la visita llegue a Django.
- `SECRET_KEY`, `CLAVE_CIFRADO_CREDENCIALES` y las contraseñas de las bases **propias de esta tienda**, generadas
  como indica la plantilla.

Levántala como en [Primer arranque](#primer-arranque) y comprueba:

- `https://mitienda.cl/api/salud/` responde.
- `curl -sI https://www.mitienda.cl/catalogo` responde `301` con `Location: https://mitienda.cl/catalogo`.

Cuando todo funcione, sube `SECURE_HSTS_SECONDS` a `31536000` y vuelve a levantar la tienda.

### 6.3 Correo

El cliente crea su cuenta de Resend y verifica su dominio con el instructivo; el equipo configura la clave que él
entrega, como en [Resend con el dominio del cliente](#resend-con-el-dominio-del-cliente).

### 6.4 Inicio de sesión con Google

El cliente crea su proyecto y su cliente OAuth en Google Cloud Console con el mismo instructivo: `https://mitienda.cl`
en los orígenes de JavaScript autorizados y la pantalla de consentimiento **"En producción"** (en "Prueba" solo
entran los usuarios agregados a mano). Entrega el Client ID, que el equipo pone en `GOOGLE_CLIENT_ID` antes de
levantar la tienda.

### Verificar el inicio de sesión con Google en producción

Una vez configurado el dominio y desplegada la aplicación, se debe comprobar que el inicio de sesión con Google funciona desde la dirección pública de la tienda.

Antes de probar, verificar en Google Cloud Console que los orígenes autorizados incluyan los dominios utilizados por la tienda:

- `https://mitienda.cl`
- `https://www.mitienda.cl` (si se utiliza este dominio).

Luego realizar las siguientes comprobaciones:

1. Abrir la tienda utilizando su dominio público.
2. Comprobar que la página carga correctamente mediante HTTPS.
3. Probar el inicio de sesión tradicional.
4. Probar el inicio de sesión con Google.
5. Confirmar que el usuario puede ingresar correctamente a su cuenta.

Si el inicio de sesión tradicional funciona, pero Google devuelve un error, revisar los registros del backend:

\```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=150 backend
\```

También se debe comprobar que `GOOGLE_CLIENT_ID` esté configurado correctamente y que coincida con el identificador utilizado por el frontend y la configuración de Google Cloud.

Si la solicitud al endpoint de autenticación de Google devuelve un error HTTP `403`, se debe revisar la implementación de validación del token en el backend y los registros asociados a la solicitud.

**Importante:** que la tienda tenga HTTPS y que el inicio de sesión tradicional funcione no garantiza que Google OAuth esté correctamente implementado. Se debe probar este flujo de manera independiente.

### 6.5 Medios de pago reales

El cliente contrata cada medio directamente con el proveedor. El equipo no hace esos trámites. Después carga las
credenciales en Configuración > Medios de pago:

- **Transbank Webpay Plus:** el cliente se afilia a Transbank y pasa su proceso de validación, que le entrega el
  código de comercio y la llave secreta de producción. En el panel elige el ambiente "PRODUCCION" y carga los dos
  datos.
- **Mercado Pago:** en su panel de desarrolladores, las credenciales **de producción** (el access token de prueba no
  cobra de verdad) y la clave secreta de las notificaciones (webhooks), con la dirección
  `https://mitienda.cl/api/ventas/mercadopago/webhook/`.
- **Transferencia:** los datos de la cuenta del cliente y el plazo para pagar. Si usa Linkify, su llave secreta y la
  dirección de notificaciones `https://mitienda.cl/api/ventas/webhooks/linkify/`.

**Antes de abrir la tienda**, revisa en Configuración > Medios de pago lo que dejó `preparar_tienda_prueba`:
Transbank tiene que estar en "PRODUCCION" con las llaves del cliente, o deshabilitado; la transferencia, con los
datos reales de la cuenta del cliente, o deshabilitada. Con Transbank en integración, un comprador puede pagar con una
tarjeta de prueba y el pedido queda Pagado sin que entre dinero.

Haz una compra real de monto bajo con cada medio y anúlala o devuélvela desde el panel del proveedor.

### 6.6 Envíos

- **Retiro en local y entrega coordinada:** funcionan sin nada más; se activan en Configuración.
- **Chilexpress:** el cliente pide las credenciales de producción a `soporteintegraciones@chilexpress.cl` (lunes a
  viernes, de 9:00 a 18:00), como lo indica la página "¿Cómo me integro?" del
  [portal de desarrolladores](https://developers.wschilexpress.com/como-integrarse). Chilexpress responde en menos de
  24 horas con:
  - las llaves de producción de sus APIs (cotizador, coberturas y envíos; si falta la de coberturas o la de envíos,
    la tienda usa la del cotizador);
  - su **TCC** (Tarjeta Cliente Chilexpress), la cuenta a la que se cobran los envíos. Sin TCC no entrega las llaves
    de producción. Si el cliente no tiene cuenta de empresa, en el mismo trámite le dan una TCC de alta automática,
    limitada a 15 envíos y $50.000 al mes, que puede ampliar después del primer mes pagado.

  En Configuración > Envíos por courier, el cliente elige el ambiente **Producción** y carga las llaves, el número de
  TCC, el RUT de la empresa del contrato con Chilexpress y qué vende la tienda (es el contenido que se declara en cada
  envío). Las llaves se guardan cifradas; el ambiente, la TCC y el RUT se ven completos. Con el ambiente **Pruebas**
  (el que viene por defecto) se usan el sandbox, su TCC y su RUT, aunque el cliente cargue los suyos.

  Chilexpress usa como remitente y dirección de devolución los datos de la tienda, que deben estar completos (en
  producción, sin ellos no se genera la orden de transporte: el pedido muestra qué falta y, una vez completados, se
  genera con "Reintentar OT"):
  - el nombre de la tienda (Página de Inicio e Identidad);
  - el teléfono comercial y el correo de contacto (Contacto y Redes);
  - la calle y el número del local (Dirección del Local y Retiro en Tienda). Revisa que no siga la dirección de
    ejemplo `Av. Principal 123`, que trae una tienda nueva. La comuna del local es además el origen de las
    cotizaciones.

  Chilexpress devuelve los envíos no entregados a la sucursal donde los recibió o a la dirección donde los retiró,
  aunque la orden traiga otra dirección de devolución; para cambiarlo, el cliente se lo pide a su ejecutivo.

  Antes de abrir la tienda, haz una compra con despacho a una comuna conocida y revisa que el pedido tenga su orden de
  transporte y su etiqueta. Según las preguntas frecuentes del portal, Chilexpress solo cobra las piezas que recibe:
  si no entregas el paquete, esa orden no se cobra. Aun así, pregúntale al ejecutivo cómo anularla.

  La dirección de producción del API (`https://services.wschilexpress.com`) sale del plugin oficial de Chilexpress
  para WooCommerce: el portal de desarrolladores solo documenta la de pruebas. Si Chilexpress entrega otra, se cambia
  en `URLS` de `ecommerce/infrastructure/ventas/couriers/chilexpress.py`.

### 6.7 Contenido y datos de la tienda

- El cliente revisa y publica Términos y Condiciones, Políticas de Privacidad y Políticas de Reembolso: sin las dos
  primeras no se puede comprar.
- En Configuración, el modelo de boletas y facturas que usará la tienda.
- La cuenta del emprendedor (`createsuperuser`) con su correo y una contraseña temporal, que él cambia desde el menú
  de su cuenta al primer ingreso.

### 6.8 Operación

- Ningún medio de pago de prueba habilitado: Transbank en "PRODUCCION" o deshabilitado, y la transferencia con datos
  reales o deshabilitada ([6.5](#65-medios-de-pago-reales)).
- Las [tareas programadas y los respaldos](#3-tareas-programadas-y-respaldos) en el cron del servidor.
- Una restauración de prueba completa antes de entregar la tienda.
- El monitor de `https://mitienda.cl/api/salud/` cada 5 minutos.
- Una compra completa de punta a punta con un correo que no sea del equipo: pedido recibido, pago, despacho y
  entregado, revisando que los correos no lleguen a spam.
- Nunca correr las pruebas en el servidor de la tienda (ver [Primer arranque](#primer-arranque)).
