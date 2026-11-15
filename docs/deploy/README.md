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

Son cuatro servicios:

| Servicio | Tecnología | Función |
|---|---|---|
| `backend` | Django + Gunicorn | API y lógica de negocio |
| `web` | Caddy | Frontend, proxy inverso y HTTPS |
| `postgres` | PostgreSQL 15 | Datos relacionales |
| `mongo` | MongoDB 8.0 | Catálogo de productos |

El nombre del proyecto Compose (`-p`) es el de la tienda: en este manual, `mitienda`; en la instalación de referencia
(Taller Maché), `mache`.

Solo el Caddy de la tienda recibe visitas. Las bases no publican puertos, el backend corre sin permisos de root y los
datos quedan en volúmenes de Docker (las fotos en `media` y las de las cotizaciones en `privado`), que sobreviven a
cada versión nueva. El cron del servidor ejecuta las tareas programadas y los respaldos dentro del backend.

### Seguridad y persistencia

Además de lo anterior, la instalación de referencia (Taller Maché) tiene estas características, verificadas en el
servidor:

- Solo Caddy publica puertos al exterior: el 80 y el 443.
- El backend se ejecuta con Gunicorn, no con el servidor de desarrollo de Django.
- Caddy guarda sus certificados y su configuración en volúmenes propios, para no perderlos al reconstruir.
- Los registros de Docker rotan: máximo 10 MB por archivo y tres archivos por servicio, así que no crecen sin límite.
- Los servicios usan la política de reinicio `unless-stopped`: vuelven a levantarse solos tras un reinicio del
  servidor o una caída, salvo que los hayas detenido a mano.

Los volúmenes de la tienda son:

| Volumen | Qué guarda |
|---|---|
| `postgres` | Datos de PostgreSQL |
| `mongo` | Datos de MongoDB (catálogo) |
| `media` | Fotos públicas |
| `privado` | Archivos privados (fotos de las cotizaciones) |
| `caddy_datos` | Datos de Caddy, como sus certificados HTTPS |
| `caddy_config` | Configuración de Caddy |

> **ADVERTENCIA: `docker compose down -v` borra los volúmenes.** Los volúmenes sobreviven a las reconstrucciones
> normales (`up -d --build`), a `stop`, a `restart` y a `down` sin `-v`, pero `down -v` elimina la base de datos, el
> catálogo y las fotos de la tienda. No lo ejecutes en una tienda con datos sin tener antes un respaldo copiado fuera
> del servidor.

## 1. Preparar la VPS de OpenCloud

Los 4 GB son necesarios: la tienda usa unos 650 MB de RAM en reposo (medido), la mayor parte en MongoDB, y en un pico
puede acercarse a 1,5 GB (estimado a partir del código, sin medir):

- MongoDB crece hasta su caché (`MONGO_CACHE_GB`, 0,5 GB) más su propio consumo.
- El backend procesa completa en memoria cada foto que se sube: unos 200 MB por proceso con una foto de 20
  megapíxeles, y son 2 procesos (`GUNICORN_WORKERS`).

A eso se suman 300 a 400 MB de Ubuntu y Docker, más la memoria que pide compilar las imágenes en el servidor. Si falta
memoria, Linux cierra un proceso (casi siempre MongoDB) y la tienda se cae hasta que se reinicia.

Apenas OpenCloud entregue la máquina, comprueba desde tu computador que el SSH responde en el puerto **22** (el que
indique el panel puede no ser el que funciona). Una VPS recién entregada usa el 22; si más adelante cambias el puerto
de SSH, ver [Puerto SSH personalizado](#puerto-ssh-personalizado). Después de levantar la tienda, comprueba el 80. Si
el panel de OpenCloud tiene un firewall, abre ahí el 22 (o el puerto SSH personalizado, si lo usas), el 80 y el 443.

```bash
ssh -o ConnectTimeout=10 root@<IP pública> true && echo "SSH OK"
curl -sI --max-time 10 http://<IP pública>/ | head -1
```

### Versiones y requisitos

**Requisitos:** una VPS con Ubuntu 24.04 y 4 GB de RAM (ver arriba), con Docker Engine y el plugin `docker compose`
([Docker](#docker)). Para correr la tienda no hace falta instalar Python, Node, PostgreSQL, MongoDB ni Caddy en el
servidor: corren dentro de los contenedores.

**Servidor de referencia (Taller Maché).** Valores verificados directamente en esa VPS, como referencia; no son
requisitos:

| Elemento | Valor verificado |
|---|---|
| Proveedor | OpenCloud |
| Sistema operativo | Ubuntu 24.04.5 LTS (Noble Numbat), kernel 6.8.0-149-generic |
| RAM | 4 GB (unos 3,8 GiB disponibles para el sistema) |
| Swap | 2 GB |
| Disco | 77 GB (unos 68 GB libres al revisar) |
| Zona horaria | `America/Santiago` |
| Usuario operativo | `despliegue` |
| Rutas | `/opt/tiendas/codigo` (código), `/opt/tiendas/respaldos` (respaldos) y `/opt/tiendas/mache.env` (variables; `mitienda.env` en este manual) |

**Versiones de software verificadas.** Distingue las de ejecución de las de compilación:

| Componente | Versión verificada | Dónde corre |
|---|---|---|
| Docker Engine | 29.9.3 | Servidor |
| Docker Compose | v5.7.1 | Servidor (plugin) |
| Python | 3.13 (3.13.18) | Contenedor `backend` |
| Django | 6.1.2 | Contenedor `backend` |
| PostgreSQL | 15.20 | Contenedor `postgres` |
| MongoDB | 8.0.38 | Contenedor `mongo` |
| Caddy | 2.11.9 | Contenedor `web` |
| Node.js | 22-slim | **Solo al compilar** el frontend (etapa intermedia del Dockerfile): no se instala en el servidor ni corre en el contenedor final |

Las dependencias del backend tienen versiones fijadas en `requirements.txt` (entre ellas Django REST Framework 3.18.3,
Gunicorn 26.2.0, MongoEngine 0.29.3, PyMongo 4.18.2, psycopg2-binary 2.9.12, Pillow 13.0.0 y whitenoise 6.12.0). Las del
frontend (React 19.2.8, Vite 8.3.5, Axios 1.20.0, React Router 7.18.3) están en `frontend/package.json`, y
`frontend/package-lock.json` (`lockfileVersion` 3) fija el resto. Son las versiones de la verificación: ante cualquier
diferencia, mandan las del repositorio.

### Sistema y swap

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Santiago
# Parches de seguridad automáticos (en Ubuntu vienen activos; esto lo confirma)
sudo dpkg-reconfigure -plow unattended-upgrades
```

Un swap de 2 GB hace que un pico de memoria ponga lenta la tienda unos segundos en vez de cerrar MongoDB. Si `swapon --show` ya muestra uno, sáltate esto:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Usar el swap solo cuando falte memoria
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
```

Compruébalo con `free -h`: la línea `Swap` debe decir `2.0Gi`.

### Configurar el firewall del servidor

Antes de activar UFW, permitir los puertos necesarios para administrar el servidor y recibir conexiones web:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

**Importante:** antes de activar UFW, comprobar que el acceso SSH funciona correctamente y que el puerto por el que escucha SSH está permitido (el 22 en una instalación estándar; si ya cambiaste el puerto, ver [Puerto SSH personalizado](#puerto-ssh-personalizado)). Así se evita perder el acceso remoto al servidor.

Activar el firewall:

```bash
sudo ufw enable
```

Comprobar las reglas:

```bash
sudo ufw status verbose
```

Deben encontrarse permitidos los siguientes puertos:

- `22/tcp`: conexión SSH.
- `80/tcp`: tráfico HTTP y validación de certificados.
- `443/tcp`: tráfico HTTPS.

Si la VPS usa un puerto SSH personalizado (`PUERTO_SSH/tcp`), ese puerto también debe estar permitido; el procedimiento completo está en [Puerto SSH personalizado](#puerto-ssh-personalizado).

Además del firewall UFW de Ubuntu, algunos proveedores VPS disponen de un firewall propio desde su panel de administración. Se deben permitir también estos puertos en dicho panel cuando corresponda.

### Usuario para administrar el servidor

Durante la preparación inicial del servidor se puede utilizar `root` para realizar tareas administrativas, como instalar paquetes, configurar SSH y crear usuarios.

Una vez creado el usuario `despliegue` y configurados sus permisos, las operaciones habituales de publicación deben realizarse con este usuario.

Para cambiar desde `root` al usuario de despliegue:

```bash
su - despliegue
```

Para comprobar que se está utilizando el usuario correcto:

```bash
whoami
pwd
```

El resultado de `whoami` debe ser `despliegue`.

Si se cierra la conexión SSH, se debe volver a conectar utilizando ese usuario, con el puerto que use la VPS:

```bash
# Puerto 22 estándar
ssh despliegue@IP_DEL_SERVIDOR
# Puerto SSH personalizado de la VPS
ssh -p PUERTO_SSH despliegue@IP_DEL_SERVIDOR
```

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

`adduser --disabled-password` crea la cuenta sin contraseña de acceso, pero no define por sí solo si tendrá permisos de
administrador. Varios pasos de este manual usan `sudo` con `despliegue`: comprueba con `sudo -l` que los tiene (en
Taller Maché, `despliegue` pertenece a los grupos `sudo` y `docker`) o haz esos pasos como `root`. Ver el caso
[6](#6-errores-de-permisos-al-ejecutar-comandos-administrativos).

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

### Puerto SSH personalizado

Por defecto SSH escucha en el puerto 22, y así queda una VPS recién entregada. Cambiarlo es **opcional**: cada tienda
puede mantener el 22 o usar otro puerto. Si no vas a cambiarlo, sáltate esta sección y usa los comandos con el 22. Si
lo cambias, reemplaza `PUERTO_SSH` por el puerto que elijas para esa VPS.

**Ejemplo (Taller Maché):** en esa VPS el acceso SSH se configuró por el puerto `5358`, con el usuario `despliegue`.
Es la decisión de esa implementación, no una regla para las demás tiendas.

Hazlo con el usuario `despliegue` ya creado y con su clave probada
([Usuario y acceso por SSH](#usuario-y-acceso-por-ssh)).

1. **Permite primero el puerto nuevo**, tanto en el firewall de Ubuntu como en el panel del proveedor VPS (si el panel
   tiene firewall, abre ahí `PUERTO_SSH/tcp`). Si cambias el puerto sin permitirlo antes, quedas fuera del servidor.
   Deja por ahora la regla del 22.

   ```bash
   sudo ufw allow PUERTO_SSH/tcp
   sudo ufw status verbose
   ```

2. **Configura el puerto** en un archivo propio, sin editar los del proveedor:

   ```bash
   echo 'Port PUERTO_SSH' | sudo tee /etc/ssh/sshd_config.d/00-puerto-personalizado.conf > /dev/null
   ```

   Con una directiva `Port`, SSH deja de escuchar en el 22 cuando se recarga. Por eso la sesión original debe seguir
   abierta en los pasos siguientes.

3. **Valida la configuración y recarga el servicio SSH:**

   ```bash
   sudo sshd -t && sudo systemctl reload ssh
   sudo ss -tlnp | grep PUERTO_SSH
   ```

   `sshd -t` revisa la configuración antes de aplicarla: si muestra un error, no recargues y corrígelo. El segundo
   comando debe mostrar SSH escuchando en `PUERTO_SSH`. Si no aparece, en Ubuntu 24.04 SSH puede estar activado por
   socket (`ssh.socket`), que mantiene su propio puerto: revisa `systemctl status ssh.socket` y, si corresponde,
   fija el puerto también ahí con `sudo systemctl edit ssh.socket` (las líneas `[Socket]`, `ListenStream=` y
   `ListenStream=PUERTO_SSH`), seguido de `sudo systemctl daemon-reload && sudo systemctl restart ssh.socket`.

4. **Comprueba la conexión desde otra terminal**, sin cerrar la original:

   ```bash
   ssh -p PUERTO_SSH despliegue@IP_DEL_SERVIDOR
   ```

   **No cierres la sesión SSH original** hasta comprobar que el puerto nuevo funciona y que entras con tu clave.
   Si falla, desde esa sesión abierta borra el archivo y recarga
   (`sudo rm /etc/ssh/sshd_config.d/00-puerto-personalizado.conf && sudo systemctl reload ssh`), o entra por la
   consola web de OpenCloud.

5. **Cuando el puerto nuevo funcione**, si SSH ya no escucha en el 22, quita esa regla (`sudo ufw delete allow 22/tcp`)
   y ciérralo también en el panel del proveedor. Deja el 22 abierto solo si esa instalación todavía lo usa.

Con un puerto personalizado, `scp` lo recibe con `-P` en mayúscula (`scp -P PUERTO_SSH ...`), a diferencia de
`ssh -p`.

Si usas una clave específica para esa VPS, indícala con `-i`. Desde Windows PowerShell, con la clave en
`%USERPROFILE%\.ssh`:

```powershell
ssh -i "$env:USERPROFILE\.ssh\NOMBRE_DE_LA_CLAVE" -p PUERTO_SSH despliegue@IP_DEL_SERVIDOR
```

Ejemplo de la instalación de Taller Maché:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_mache" -p 5358 despliegue@45.7.228.140
```

### Aplicar los permisos de Docker

Después de agregar el usuario `despliegue` al grupo `docker`, es necesario iniciar una nueva sesión SSH para que los permisos se apliquen.

Desde otra terminal, ingresar al servidor (con el puerto que use la VPS):

```bash
# Puerto 22 estándar
ssh despliegue@IP_DEL_SERVIDOR
# Puerto SSH personalizado de la VPS
ssh -p PUERTO_SSH despliegue@IP_DEL_SERVIDOR
```

Comprobar que se está utilizando el usuario correcto y que Docker funciona sin `sudo`:

```bash
whoami
docker ps
docker compose version
```

El comando `whoami` debe mostrar `despliegue`. Si Docker funciona correctamente, el usuario ya puede administrar los contenedores sin utilizar `sudo`.

## 2. Configurar y levantar la tienda

### Qué contiene el repositorio

Estructura principal; para desplegar no hace falta conocer cada carpeta interna:

```text
Ecode/
├── backend_project/        # Proyecto Django (el que arranca Gunicorn)
├── deploy/                 # Lo necesario para desplegar una tienda
│   ├── Caddyfile
│   ├── docker-compose.yml
│   ├── entrypoint.sh
│   ├── respaldar.sh
│   ├── salud.py
│   └── tienda.env.example
├── docs/
│   └── deploy/
│       └── README.md       # Este manual
├── ecommerce/              # Aplicación de la tienda
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   └── migrations/
├── frontend/               # Frontend React
│   ├── e2e/
│   ├── e2e-qa/
│   ├── public/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── package-lock.json
├── negocio/
├── tools/
├── Dockerfile
├── docker-compose.yml
├── manage.py
└── requirements.txt
```

| Archivo | Para qué sirve |
|---|---|
| `deploy/docker-compose.yml` | Define los cuatro servicios y los volúmenes de la tienda. Es el que se usa para desplegar (el `docker-compose.yml` de la raíz no) |
| `deploy/Caddyfile` | Configuración de Caddy: HTTPS, servir el frontend, gestionar las rutas de `/api/` y entregar los archivos multimedia públicos. `frontend/Dockerfile` lo copia dentro de la imagen `web` al construirla; no se monta como volumen, así que un cambio en él solo se aplica reconstruyendo `web` |
| `deploy/entrypoint.sh` | Arranque del backend: migraciones, archivos estáticos y Gunicorn ([Migraciones y arranque del backend](#migraciones-y-arranque-del-backend)) |
| `deploy/respaldar.sh` | Respaldo de las bases y los archivos ([3. Tareas programadas y respaldos](#3-tareas-programadas-y-respaldos)) |
| `deploy/salud.py` | Healthcheck del backend: Docker lo ejecuta periódicamente ([Verificar el funcionamiento](#verificar-el-funcionamiento)). El endpoint público es `/api/salud/` ([Primer arranque](#primer-arranque)) |
| `deploy/tienda.env.example` | Plantilla del archivo de variables de cada tienda |
| `Dockerfile` (raíz) | Imagen del backend: parte de `python:3.13-slim`, instala `requirements.txt`, copia el proyecto Django y ejecuta `deploy/entrypoint.sh` |
| `frontend/Dockerfile` | Construcción de la imagen del frontend (multi-stage, ver abajo) |
| `requirements.txt` | Dependencias de Python con versiones exactas |
| `frontend/package.json` y `package-lock.json` | Dependencias del frontend con versiones exactas |
| `manage.py` | Comandos de Django (`createsuperuser`, `preparar_tienda_prueba` y las tareas programadas) |

#### Cómo se construye cada imagen

- **Backend:** imagen basada en `python:3.13-slim`: instala las dependencias de `requirements.txt`, copia el proyecto Django
  y ejecuta `deploy/entrypoint.sh`, que inicia Gunicorn (no el servidor de desarrollo de Django).
- **Frontend:** Dockerfile multi-stage. (1) Una etapa de compilación con Node 22-slim, (2) instala las dependencias
  con `npm ci`, (3) compila con `npm run build` y (4) la imagen final, basada en Caddy, sirve los archivos generados.
  Esa imagen también trae `deploy/Caddyfile` copiado dentro (`COPY deploy/Caddyfile /etc/caddy/Caddyfile`); el servicio
  `web` no lo monta como volumen.
  Node solo existe durante la compilación: no se instala en el servidor ni corre en el contenedor final.
- Como el frontend se compila y el Caddyfile se copia al construir la imagen, un cambio en cualquiera de los dos solo
  se ve después de reconstruirla con
  `up -d --build` ([Actualizar a una versión nueva](#actualizar-a-una-versión-nueva)).

### Código y archivo de variables

El repositorio de GitHub es público, por lo que la VPS puede descargar el código mediante HTTPS sin necesidad de llaves SSH ni credenciales de acceso.

Como usuario `despliegue`, clona el repositorio y selecciona la rama `main`:

```bash
git clone https://github.com/Cristobal1012/Ecode.git /opt/tiendas/codigo
cd /opt/tiendas/codigo
git checkout main
```
Crea el archivo de variables de entorno a partir de la plantilla y restringe sus permisos:

```bash
cp deploy/tienda.env.example /opt/tiendas/mitienda.env
chmod 600 /opt/tiendas/mitienda.env
```

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

```bash
nano /opt/tiendas/mitienda.env
```

Asegurar que solamente el usuario de despliegue tenga acceso al archivo:

```bash
chmod 600 /opt/tiendas/mitienda.env
```

Validar la configuración de Docker Compose:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env config --quiet
```

Si el comando termina sin mostrar errores, la configuración pudo interpretarse correctamente.

Después de modificar variables que utiliza el backend, reiniciar ese servicio:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env restart backend
```

Comprobar que el contenedor esté funcionando:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env ps
```

Si el servicio no inicia correctamente, revisar sus registros:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=100 backend
```

**Importante:** `config --quiet` valida la configuración de Compose, pero no garantiza que las credenciales externas sean correctas ni que los servicios puedan conectarse entre sí.

### Bases de datos (PostgreSQL y MongoDB)

La tienda usa las dos al mismo tiempo, cada una en su contenedor y sin publicar puertos:

| | PostgreSQL | MongoDB |
|---|---|---|
| Imagen | `postgres:15` | `mongo:8.0` |
| Puerto interno | 5432 | 27017 |
| Qué guarda | Datos relacionales | Catálogo de productos (el backend lo usa con MongoEngine) |
| Variables de la tienda | `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` | `MONGO_USUARIO` y `MONGO_CLAVE`, que Compose asigna a `MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD` |
| Cómo se inicializa | La base y el rol se crean al iniciar el contenedor por primera vez, con esas variables | Se crea el usuario inicial con esas variables; la autenticación es contra la base `admin` |
| En Taller Maché | Base `tienda_mache` y rol `tienda_mache` | — |

- **Variables:** se definen en el archivo de variables de la tienda ([Código y archivo de variables](#código-y-archivo-de-variables)).
  PostgreSQL usa `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`. MongoDB usa `MONGO_USUARIO` y `MONGO_CLAVE`,
  que Docker Compose asigna a `MONGO_INITDB_ROOT_USERNAME` y `MONGO_INITDB_ROOT_PASSWORD` dentro del contenedor (los
  nombres que usan los comandos de [Restaurar un respaldo](#restaurar-un-respaldo)). El backend lee las suyas del mismo
  archivo (`ARCHIVO_TIENDA`). Las credenciales viven solo en ese archivo y no deben exponerse.
- **Solo la primera vez:** las imágenes oficiales usan esas variables únicamente cuando el volumen está vacío. Cambiar
  después una contraseña en el archivo no la cambia en una base que ya existe, y el backend quedaría con una clave
  distinta de la de la base.
- **Permisos:** en Taller Maché el rol `tienda_mache` tiene privilegios amplios sobre su base. Es una característica
  de esa instalación comprobada, no una recomendación de seguridad: para producción conviene evaluar los permisos
  mínimos necesarios.
- **Secretos:** nunca publiques contraseñas, claves, tokens, URI con credenciales ni el contenido completo del archivo
  de variables, tampoco en capturas, mensajes de soporte o registros que pegues a otra persona.

### Primer arranque

Como `despliegue`, desde `/opt/tiendas/codigo`. La primera compilación tarda varios minutos:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py createsuperuser
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py preparar_tienda_prueba --nombre "Mi Tienda"
```

- `-p` es el nombre de la tienda: nombra sus contenedores y volúmenes; usa siempre el mismo (en Taller Maché, `mache`).
- Al arrancar, el backend aplica las migraciones y junta los estilos del admin de Django; no hay que hacerlo a mano
  ([detalle](#migraciones-y-arranque-del-backend)).
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

### Migraciones y arranque del backend

`deploy/entrypoint.sh` ejecuta esto cada vez que arranca el backend:

```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

Y después inicia Gunicorn:

```bash
gunicorn backend_project.wsgi \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --threads "${GUNICORN_THREADS:-4}" \
    --timeout 60 \
    --no-control-socket \
    --access-logfile -
```

- Las migraciones de Django (PostgreSQL) se aplican solas al arrancar: una versión nueva con migraciones las aplica en
  el `up -d --build`, y si una migración falla, el backend no queda disponible (ver
  [Problemas frecuentes durante el despliegue y cómo resolverlos](#problemas-frecuentes-durante-el-despliegue-y-cómo-resolverlos)).
- Gunicorn usa por defecto 2 procesos (`GUNICORN_WORKERS`) y 4 hilos (`GUNICORN_THREADS`), y escribe cada solicitud en
  el registro del contenedor (`--access-logfile -`).
- MongoDB (el catálogo) se usa con MongoEngine, por lo que no se debe asumir que su estructura se administra con las
  migraciones de Django.

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
| `procesar_suscripciones` (opcional) | 3:15, solo si la tienda activó las suscripciones | Crea el pedido de cada ciclo antes de la entrega y envía el aviso de cobro; cancela los ciclos no pagados al terminar el día de la entrega, y la suscripción si nunca se pagó el primero | Solo se cobra el primer ciclo |
| `limpiar_imagenes_catalogo` | 3:00, antes del respaldo | Reintenta borrar las fotos que no se pudieron borrar del disco (hasta 100 por vez, `--limite` para cambiarlo); nunca borra una que un producto use | Se acumulan en el disco |
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
# Fotos del catálogo que quedaron sin borrar, una vez al día y antes de los respaldos
0 3 * * * docker compose -p mitienda -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py limpiar_imagenes_catalogo >> /opt/tiendas/mitienda-imagenes.log 2>&1
# Respaldos diarios (se guardan 7 días)
0 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh mitienda /opt/tiendas/mitienda.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
```

**Opcional: suscripciones.** Solo si la tienda activa las suscripciones, agrega además esta línea. Con el módulo
apagado no hace nada, así que programarla antes tampoco tiene efectos:

```cron
# Suscripciones: aviso de cobro y ciclos vencidos, una vez al día
15 3 * * * docker compose -p mitienda -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec -T backend python manage.py procesar_suscripciones >> /opt/tiendas/mitienda-suscripciones.log 2>&1
```

Los horarios son un ejemplo coherente (limpieza 3:00, respaldo 4:00), no una obligación. En la instalación de
referencia (Taller Maché) hay tres tareas: pagos vencidos cada hora, limpieza de imágenes a las 3:00 y respaldo a las
4:00. No tiene tarea de suscripciones porque no las activó; no todas las tiendas las necesitan. Sus registros están en
`/opt/tiendas/respaldos.log`, `/opt/tiendas/mache-pagos.log` y `/opt/tiendas/mache-imagenes.log`.

`respaldar.sh` deja cada respaldo así (aquí con el nombre `mitienda`; `mache` en la instalación de referencia):

```text
/opt/tiendas/respaldos/
└── AAAA-MM-DD/
    └── mitienda/
        ├── postgres.dump
        ├── mongo.archive.gz
        ├── media.tar.gz
        └── privado.tar.gz
```

`respaldar.sh` crea la carpeta del día con `mkdir -p` y escribe los archivos con redirecciones (`>`): si se ejecuta otra
vez el mismo día para la misma tienda (por ejemplo, un respaldo a mano antes de actualizar y luego el de las 4:00),
**sobrescribe los archivos de ese día**. Antes de repetirlo, copia la carpeta (`cp -a`).

**Importante: copia los respaldos fuera de la VPS.** Una vez por semana, descarga una copia de
`/opt/tiendas/respaldos/` fuera del servidor: un respaldo que solo está en el mismo servidor se pierde con él. Desde tu
computador, con `scp` (el `-P` va solo si la VPS usa un puerto SSH personalizado):

```bash
scp -P PUERTO_SSH -r despliegue@IP_DEL_SERVIDOR:/opt/tiendas/respaldos ./copia-respaldos
```

## 4. Correo

El backend elige cómo enviar según las variables de entorno: la API HTTPS de **Resend** si hay `RESEND_API_KEY`; si no, **SMTP** si hay `EMAIL_HOST`; y si no hay ninguna, los correos solo se imprimen en la consola. El remitente que ve el comprador es `DEFAULT_FROM_EMAIL`.

### Probar el envío de correo desde la VPS

Para comprobar que los correos llegan correctamente, sin necesidad de realizar una compra, ejecutar el siguiente comando desde la carpeta del repositorio:

```bash
cd /opt/tiendas/codigo

docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py sendtestemail correo@ejemplo.cl
```

Reemplazar `correo@ejemplo.cl` por una dirección de correo a la que se tenga acceso.

Si el envío no funciona, revisar los registros del backend:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=100 backend
```

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

### Verificar el funcionamiento

Después de levantar la tienda, de actualizarla o de moverla de servidor:

```bash
curl -sS -o /dev/null -w "HTTP: %{http_code}\n" https://mitienda.cl/api/salud/
```

Debe responder `HTTP: 200`; el cuerpo es el JSON de [Primer arranque](#primer-arranque). Si una base no contesta,
responde HTTP 503. Además:

- Los cuatro contenedores (`backend`, `web`, `postgres` y `mongo`) están activos y, donde hay chequeo de salud, en
  `healthy` (`docker compose ... ps`).
- HTTPS funciona con candado y Caddy tiene certificado para `mitienda.cl` y `www.mitienda.cl`.
- El monitor externo consulta `/api/salud/` cada 5 minutos y recibe 200.
- El registro del backend muestra esas consultas con respuesta 200:
  `docker compose ... logs --since 15m backend | grep salud`.

**Healthcheck del backend.** Docker ejecuta `deploy/salud.py` cada 30 segundos, con un timeout de 10 segundos, tres
reintentos y un período inicial de 60 segundos. Durante ese primer minuto el backend puede aparecer como `starting`
sin que sea un problema. El endpoint público `/api/salud/` responde HTTP 200 cuando PostgreSQL y MongoDB responden y
HTTP 503 cuando alguna falla.

En Taller Maché se comprobó así: `https://mache.cl/api/salud/` respondió HTTP 200, los cuatro contenedores estaban
activos, `mache.cl` y `www.mache.cl` tenían certificado automático, UptimeRobot consultaba cada cinco minutos y el
registro del backend mostraba esos GET con 200. Es el resultado de esa instalación, no una garantía para otras: verifica
cada tienda por separado.

### Operación básica

Desde `/opt/tiendas/codigo`, con el nombre de la tienda (`-p`) y su archivo de variables (en Taller Maché, `-p mache` y
`/opt/tiendas/mache.env`):

```bash
cd /opt/tiendas/codigo

# Iniciar los servicios (también los crea si no existen)
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d

# Detener los servicios sin borrarlos
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env stop

# Reiniciar los servicios
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env restart

# Consultar el estado de cada contenedor
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env ps

# Seguir los registros en vivo (Ctrl+C para salir)
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs -f
```

`up -d` levanta o actualiza la tienda en segundo plano; `stop` y `restart` conservan contenedores y datos; `ps` muestra
si todo está activo y `healthy`; `logs -f` muestra lo que escriben los servicios (agrega el nombre de un servicio, ej.
`logs -f backend`, para ver solo ese).

> **ADVERTENCIA:** no uses `down -v`. `down` quita los contenedores y conserva los datos, pero `down -v` borra también
> los volúmenes: la base de datos, el catálogo y las fotos.

### Actualizar a una versión nueva

Avisa antes al emprendedor y respalda. Después, desde `/opt/tiendas/codigo`:

1. **Anota el commit actual**, para poder volver a él si algo falla:

   ```bash
   git rev-parse HEAD
   git log -5 --oneline
   ```

2. **Respalda** ([Respaldar a mano](#respaldar-a-mano)) y comprueba que la carpeta del día tiene los cuatro archivos.
   `respaldar.sh` sobrescribe los archivos si se ejecuta de nuevo el mismo día para la misma tienda (también el de las
   4:00): copia esa carpeta a otro lugar (`cp -a`) hasta terminar la actualización.
3. **Actualiza el código y reconstruye:**

   ```bash
   git pull
   docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
   ```

4. **Verifica** ([Verificar el funcionamiento](#verificar-el-funcionamiento)): contenedores activos, `/api/salud/` con
   200 y los registros del backend sin errores.

Las migraciones corren solas al arrancar el backend. Los datos y las fotos se conservan, porque están en volúmenes: por
eso una actualización nunca lleva `down -v`.

### Recuperar la versión anterior si una actualización falla

Primero descarta un error simple con [Problemas frecuentes durante el despliegue y cómo resolverlos](#problemas-frecuentes-durante-el-despliegue-y-cómo-resolverlos). Si hay que volver atrás:

1. **Recupera el código anterior** con el commit que anotaste (o el que muestre `git log -5 --oneline`) y reconstruye:

   ```bash
   cd /opt/tiendas/codigo
   git status
   git reset --hard COMMIT_ANTERIOR
   docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
   ```

   `git reset --hard` descarta los cambios sin commit en los archivos versionados: revisa `git status` antes y
   confirma que `COMMIT_ANTERIOR` es el correcto. No toca el archivo de variables (está fuera del repositorio) ni los
   volúmenes. Mientras el problema no se corrija en el repositorio, un nuevo `git pull` volverá a traer la versión con
   el error.
2. **Verifica** ([Verificar el funcionamiento](#verificar-el-funcionamiento)).
3. **Si sigue fallando con errores de base de datos**, ten presente que volver a un commit anterior **no revierte las
   migraciones**: si la versión nueva ya modificó la estructura de PostgreSQL, el código anterior puede no funcionar con
   ella. En ese caso la salida es restaurar el respaldo previo a la actualización
   ([Restaurar un respaldo](#restaurar-un-respaldo)).

La restauración **reemplaza todos los datos actuales**: lo que se haya registrado después de ese respaldo (pedidos,
cambios del emprendedor) se pierde. Antes de restaurar, copia la carpeta del respaldo a otro lugar (`cp -a`) y haz un
respaldo del estado actual, por si hace falta volver a él. Nunca uses `down -v` para "empezar de cero".

La instalación de referencia conserva imágenes Docker etiquetadas como `anterior`, pero volver atrás con ellas no está
documentado ni probado, y por eso este manual recupera con el commit anterior y la reconstrucción.

### Respaldar a mano

```bash
sh deploy/respaldar.sh mitienda /opt/tiendas/mitienda.env /opt/tiendas/respaldos
```

Genera los cuatro archivos descritos en [3. Tareas programadas y respaldos](#3-tareas-programadas-y-respaldos). Si ya hay
un respaldo de hoy de esa tienda, lo sobrescribe: copia antes la carpeta del día (`cp -a`).

### Restaurar un respaldo

Reemplaza los datos actuales de la tienda por los del respaldo: vacía y vuelve a llenar el contenido de los volúmenes
sin borrarlos (no uses `down -v`). Prueba una restauración completa antes de entregar
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
2. **Copia el archivo de la tienda sin cambiar sus claves** (`scp`, y `chmod 600` en el servidor nuevo; si el servidor
   usa un puerto SSH personalizado, `scp -P <puerto>`). Con otra
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
   el cliente la agrega en Google (inicio de sesión) y se le avisa. Actualiza también el
   [registro de datos del cliente](#registro-de-datos-para-entregar-al-cliente).
7. **Apaga la tienda de origen** con `$C down` cuando la nueva funcione. Sus datos se borran con `$C down -v`: hazlo
   solo cuando estés seguro, y conserva el respaldo.

## Problemas frecuentes durante el despliegue y cómo resolverlos

Problemas que pueden aparecer al instalar, configurar y operar una tienda. Cada caso indica su origen: **Vivido en Taller Maché**
si ocurrió en ese despliegue, o **Preventivo** si está deducido de la arquitectura y de los procedimientos de este manual.
Las soluciones son diagnósticos y pasos seguros para una VPS en producción: ninguna empieza por eliminar volúmenes o
bases de datos, y ninguna se da por probada salvo que se indique. Al pedir ayuda, no pegues contraseñas ni el archivo de
variables completo.

Los comandos usan `$C` como comando base y se ejecutan desde `/opt/tiendas/codigo` (es el mismo `C` de
[Restaurar un respaldo](#restaurar-un-respaldo)):

```bash
cd /opt/tiendas/codigo
C="docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env"
```

| Caso | Problema | Origen |
|---|---|---|
| [1](#1-docker-muestra-errores-de-permisos) | Docker muestra errores de permisos | Preventivo |
| [2](#2-no-conecta-el-ssh-después-de-cambiar-el-puerto) | No conecta el SSH después de cambiar el puerto | Preventivo |
| [3](#3-el-backend-aparece-como-starting-o-unhealthy) | El backend aparece como `starting` o `unhealthy` | Preventivo |
| [4](#4-el-dominio-no-carga-o-https-no-se-genera) | El dominio no carga o HTTPS no se genera | Preventivo |
| [5](#5-google-login-da-errores-403-cors-o-csrf) | Google Login da errores 403, CORS o CSRF | Preventivo |
| [6](#6-errores-de-permisos-al-ejecutar-comandos-administrativos) | Errores de permisos al ejecutar comandos administrativos | Preventivo |
| [7](#7-el-backend-se-reinicia-pero-la-tienda-sigue-sin-funcionar) | El backend se reinicia pero la tienda sigue sin funcionar | Preventivo |
| [8](#8-se-ejecuta-más-de-una-vez-el-respaldo-en-el-mismo-día) | Se ejecuta más de una vez el respaldo en el mismo día | Preventivo |
| [9](#9-falla-una-restauración) | Falla una restauración | Preventivo |
| [10](#10-se-pierden-modificaciones-locales-al-actualizar-el-repositorio) | Se pierden modificaciones locales al actualizar el repositorio | Vivido en Taller Maché |
| [11](#11-postgresql-o-mongodb-no-responden) | PostgreSQL o MongoDB no responden | Preventivo |
| [12](#12-el-frontend-no-refleja-los-cambios) | El frontend no refleja los cambios | Preventivo |
| [13](#13-el-correo-no-se-envía) | El correo no se envía | Preventivo |
| [14](#14-el-servidor-se-queda-sin-espacio) | El servidor se queda sin espacio | Preventivo |
| [15](#15-no-se-ejecuta-una-tarea-programada) | No se ejecuta una tarea programada | Preventivo |

### 1. Docker muestra errores de permisos

**Origen:** Preventivo.

**Síntoma:** `docker ps` o `docker compose ...` responden `permission denied while trying to connect to the Docker
daemon socket`.

**Causa probable:** el usuario no pertenece al grupo `docker`, o se agregó al grupo pero la sesión SSH es anterior al
cambio y todavía no lo refleja.

**Solución:**

1. Comprueba el usuario y sus grupos:

   ```bash
   whoami
   id
   ```

   `whoami` debe decir `despliegue` y `docker` debe aparecer en la lista de `id`.
2. Si `docker` no aparece, desde una cuenta administradora (`root` o con `sudo`):

   ```bash
   sudo usermod -aG docker despliegue
   ```

3. Cierra la sesión y entra de nuevo, con el puerto de tu VPS ([Aplicar los permisos de Docker](#aplicar-los-permisos-de-docker)),
   y prueba `docker ps` y `docker compose version`.

No cambies los permisos de `/var/run/docker.sock` como atajo. Pertenecer al grupo `docker` equivale a tener control
administrativo sobre el servidor: agrégalo solo a usuarios de confianza.

### 2. No conecta el SSH después de cambiar el puerto

**Origen:** Preventivo.

**Síntoma:** `ssh -p PUERTO_SSH despliegue@IP_DEL_SERVIDOR` responde `Connection timed out` o `Connection refused`.

**Causa probable:** el puerto no está permitido en UFW o en el firewall del panel del proveedor (suele dar *timed out*);
SSH no está escuchando en ese puerto (suele dar *refused*) porque el archivo de configuración tiene un error, no se
recargó el servicio o, en Ubuntu 24.04, `ssh.socket` mantiene el puerto anterior; o se intenta el 22 después de haberlo
cerrado.

**Solución:**

> **No cierres la sesión SSH actual** hasta comprobar una conexión nueva desde otra terminal. Si ya la perdiste, entra
> por la consola web de OpenCloud.

1. En la sesión abierta, revisa el firewall: `sudo ufw status verbose` debe mostrar `PUERTO_SSH/tcp`. Revisa también
   el firewall del panel del proveedor.
2. Revisa la configuración:

   ```bash
   sudo sshd -t
   cat /etc/ssh/sshd_config.d/00-puerto-personalizado.conf
   ```

   `sshd -t` no debe mostrar errores y el archivo debe decir `Port PUERTO_SSH`.
3. Comprueba que el servicio escucha en el puerto correcto:

   ```bash
   sudo ss -tlnp | grep PUERTO_SSH
   ```

   Si no aparece, `sudo systemctl reload ssh` y, si sigue sin aparecer, revisa `ssh.socket` como indica el paso 3 de
   [Puerto SSH personalizado](#puerto-ssh-personalizado).
4. Prueba desde otra terminal. Si no logras que funcione, vuelve al estado anterior y conéctate por el 22 (si ya
   cerraste esa regla, ábrela antes con `sudo ufw allow 22/tcp`):

   ```bash
   sudo rm /etc/ssh/sshd_config.d/00-puerto-personalizado.conf && sudo systemctl reload ssh
   ```

### 3. El backend aparece como `starting` o `unhealthy`

**Origen:** Preventivo.

**Síntoma:** `$C ps` muestra el `backend` en `starting` por más de un minuto, o en `unhealthy`, o `/api/salud/` responde
HTTP 503.

**Causa probable:** el healthcheck espera 60 segundos antes de contar fallos y marca `unhealthy` tras tres fallos
seguidos (uno cada 30 segundos), así que `starting` durante el primer minuto es normal. Pasado ese tiempo, la causa
puede estar en las bases (PostgreSQL o MongoDB caídas o sin responder), en un error de migración al arrancar (el
backend aplica las migraciones antes de iniciar Gunicorn), en una variable mal escrita o en falta de memoria o disco.
No asumas que el problema está en Django: revisa primero lo que el backend necesita.

**Solución:**

1. Estado de los cuatro contenedores y respuesta pública:

   ```bash
   $C ps
   curl -sS -o /dev/null -w "HTTP: %{http_code}\n" https://mitienda.cl/api/salud/
   ```

   Un 503 indica que alguna base no responde.
2. Registros, empezando por las bases y terminando por el backend:

   ```bash
   $C logs --tail=100 postgres
   $C logs --tail=100 mongo
   $C logs --tail=100 backend
   ```

3. Recursos del servidor: `free -h` y `df -h`.
4. Si alguna base falla, sigue el caso [11](#11-postgresql-o-mongodb-no-responden). Si el error es de migración y
   ocurrió después de una actualización, ver [Recuperar la versión anterior](#recuperar-la-versión-anterior-si-una-actualización-falla).
   Cuando corrijas la causa, `$C restart backend` y [Verificar el funcionamiento](#verificar-el-funcionamiento).

### 4. El dominio no carga o HTTPS no se genera

**Origen:** Preventivo.

**Síntoma:** el navegador no abre `https://mitienda.cl`, no muestra el candado o advierte de un certificado inválido;
`curl -sI https://mitienda.cl` falla.

**Causa probable:** el DNS aún no propagó o apunta a otra IP; hay un registro **AAAA** antiguo; la nube de Cloudflare
está naranja (proxy) o el registrador tiene "parking" activo; los puertos 80 y 443 están cerrados en UFW o en el panel
del proveedor; o `DIRECCION_SITIO` no coincide con el dominio. Con cualquiera de esas causas, Caddy puede no obtener
su certificado.

**Solución:**

1. DNS, desde la VPS: ambos deben devolver la IP de la VPS y el AAAA no debería devolver nada si no usas IPv6.

   ```bash
   dig +short mitienda.cl
   dig +short www.mitienda.cl
   dig +short AAAA mitienda.cl
   ```

2. Puertos: `sudo ufw status verbose` debe permitir `80/tcp` y `443/tcp`; revisa también el firewall del panel.
3. Registros de Caddy (el servicio `web`): `$C logs --tail=100 web`.
4. Corrige lo que encuentres: DNS y nube gris en [6.1](#61-dominio-dns-y-servidor), la variable en
   [6.2](#62-la-tienda-con-su-dominio). Si Caddy no obtiene el certificado después de corregir el DNS o los puertos, reinicia el
   servicio con `$C restart web` y vuelve a mirar el registro. Si cambiaste una variable (como `DIRECCION_SITIO`),
   aplícala con `$C up -d web`: un `restart` no recrea el contenedor.

No borres el volumen `caddy_datos` para "forzar" un certificado nuevo: guarda los datos de Caddy.

### 5. Google Login da errores 403, CORS o CSRF

**Origen:** Preventivo.

**Síntoma:** el inicio de sesión tradicional funciona, pero el de Google falla; o aparece un error 403, 400 o un mensaje
de CORS o CSRF al iniciar sesión, pagar o abrir un enlace de la tienda. No todos los 403 tienen la misma causa: primero
hay que ubicar dónde se produce el error.

**Causa probable:** alguno de estos ajustes no coincide con la dirección pública con que se abre la tienda. Cada uno
cumple una función distinta:

| Variable o ajuste | Qué hace | Valor esperado |
|---|---|---|
| `ALLOWED_HOSTS` | Dominios que el backend (Django) acepta atender | El dominio, sin `https://`: `mitienda.cl` |
| `CSRF_TRUSTED_ORIGINS` | Orígenes de confianza para las solicitudes que Django protege contra CSRF | Con esquema: `https://mitienda.cl` |
| `CORS_ALLOWED_ORIGINS` | Orígenes desde los que el navegador puede llamar a la API | Con esquema: `https://mitienda.cl` |
| `FRONTEND_URL` | Dirección pública que el backend usa para armar enlaces y redirecciones; **no** autoriza el inicio de sesión con Google | La dirección pública de la tienda: `https://mitienda.cl` |
| `GOOGLE_CLIENT_ID` | Client ID de Google que el backend usa para el inicio de sesión con Google; si falta, queda vacío | El Client ID del proyecto de Google Cloud del cliente |
| Google Cloud | Orígenes de JavaScript autorizados y estado de la pantalla de consentimiento | `https://mitienda.cl` autorizado y consentimiento "En producción" |

`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` y `CORS_ALLOWED_ORIGINS` son listas (el backend las lee con `env_lista` en
`backend_project/settings.py`): si usas varios valores, sigue el formato de `deploy/tienda.env.example`.
`FRONTEND_URL` no aparece en `settings.py`, pero el código la lee directamente del entorno para las redirecciones de
pagos (`ecommerce/infrastructure/ventas/views.py`), los enlaces de los correos (`.../ventas/adapters/correo.py`), los de
reseñas (`.../ventas/enlaces_resena.py`) y la recuperación de contraseñas (`ecommerce/infrastructure/usuarios/cuentas.py`).
Un valor incorrecto rompe esos enlaces y redirecciones, pero no es la causa de un error de Google.

**Solución:**

1. Ubica dónde ocurre el error (mensaje en pantalla, o la pestaña *Network* de las herramientas del navegador) y revisa
   lo que corresponde:

   | Qué ves | Qué suele indicar | Qué revisar |
   |---|---|---|
   | `403` con `CSRF verification failed` | Django no confía en el origen de la solicitud | `CSRF_TRUSTED_ORIGINS` |
   | `400 Bad Request` al abrir la tienda o la API | El dominio no está permitido | `ALLOWED_HOSTS` |
   | Mensaje de CORS en la consola del navegador | El origen no está permitido para llamar a la API | `CORS_ALLOWED_ORIGINS` |
   | El botón o la ventana de Google falla antes de llegar al backend (por ejemplo, un error de origen no autorizado) | Configuración en Google Cloud | Orígenes autorizados, consentimiento "En producción" y Client ID |
   | `403` del endpoint de autenticación de Google después de elegir la cuenta | Rechazo en el backend; la causa no es única | `GOOGLE_CLIENT_ID` y el registro del backend (paso 4) |
   | El inicio de sesión funciona, pero los enlaces o redirecciones (pago, correos, reseñas, contraseña) apuntan a otra dirección | La dirección pública configurada | `FRONTEND_URL` |

2. Abre la tienda por su dirección principal, `https://mitienda.cl`, y revisa en el servidor solo las variables que
   importan, sin mostrar el archivo completo:

   ```bash
   grep -E '^(ALLOWED_HOSTS|CSRF_TRUSTED_ORIGINS|CORS_ALLOWED_ORIGINS|FRONTEND_URL|GOOGLE_CLIENT_ID)=' /opt/tiendas/mitienda.env
   ```

   Deben llevar el dominio de la tienda (`mitienda.cl` en `ALLOWED_HOSTS`, `https://mitienda.cl` en las demás) y el
   Client ID del cliente ([6.2](#62-la-tienda-con-su-dominio)).
3. En Google Cloud Console, comprueba que los orígenes de JavaScript autorizados incluyan `https://mitienda.cl` (y
   `https://www.mitienda.cl` si se usa) y que la pantalla de consentimiento esté "En producción"
   ([6.4](#64-inicio-de-sesión-con-google)). Si el proyecto de Google tiene URI de redireccionamiento configuradas,
   revisa que sean las que indica el instructivo de esa tienda: este manual no define una URI de callback.
4. Si cambias una variable, valida el archivo y reinicia el backend
   ([Validar cambios en el archivo de variables](#validar-cambios-en-el-archivo-de-variables)). Luego repite el intento
   mirando el registro: `$C logs --tail=150 backend`.
5. Si el `403` persiste con las variables correctas, sigue
   [Verificar el inicio de sesión con Google en producción](#verificar-el-inicio-de-sesión-con-google-en-producción):
   ese caso se revisa en la validación del token del backend y en su registro.

### 6. Errores de permisos al ejecutar comandos administrativos

**Origen:** Preventivo.

**Síntoma:** `Permission denied`, o `... is not in the sudoers file`, al ejecutar comandos de sistema (UFW, `apt`,
configuración de SSH), o al leer o escribir archivos en `/opt/tiendas`.

**Causa probable:** el usuario no tiene los permisos que la tarea requiere (por ejemplo, no pertenece al grupo `sudo`
o al grupo `docker`), se usa `despliegue` para algo que necesita administrador sin anteponer `sudo`, o se operó la
tienda como `root` y quedaron archivos con otro dueño (por ejemplo, el archivo de variables, que `despliegue` ya no
puede leer).

**Solución:**

1. Comprueba con qué usuario estás y qué permisos tiene:

   ```bash
   whoami
   groups
   sudo -l
   ```

   `groups` debe incluir `docker` para operar la tienda y, si ese usuario también administra el servidor, `sudo`.
   `sudo -l` lista lo que puede ejecutar con `sudo` (puede pedir la contraseña del usuario).

   En la VPS de Taller Maché se comprobó que `whoami` devuelve `despliegue`, `groups` devuelve
   `despliegue sudo users docker` y `sudo -l` confirma `(ALL : ALL) ALL`: ese usuario tiene permisos administrativos
   mediante `sudo` y pertenece al grupo `docker`. Es un dato de esa instalación: no lo des por hecho en otra.
2. `adduser --disabled-password` solo crea la cuenta sin contraseña de acceso; **no implica ausencia de permisos
   administrativos**. Los permisos dependen de los grupos (como `sudo`) o de las reglas de `sudoers`, así que verifícalos
   con `sudo -l` en vez de suponerlos.
3. Usa cada permiso donde corresponde: Docker, git y cron se ejecutan como `despliegue`, sin `sudo`; UFW, `apt`, SSH y
   `systemctl` requieren `sudo` (o `root`). Si el usuario no tiene `sudo`, haz esas tareas como `root` o por la consola
   web, y vuelve a `despliegue` con `su - despliegue`.
4. Si otro usuario necesita `sudo` y no lo tiene, un administrador puede agregarlo y verificarlo:

   ```bash
   sudo usermod -aG sudo NOMBRE_DE_USUARIO
   sudo -l -U NOMBRE_DE_USUARIO
   ```

   El usuario debe abrir una sesión nueva para que el grupo se aplique. Da `sudo` solo a quien lo necesite, edita las
   reglas de `sudoers` únicamente con `visudo`, y si la cuenta no tiene contraseña y `sudo` la pide, define la forma de
   autenticación según la política del equipo (por ejemplo, con `sudo passwd NOMBRE_DE_USUARIO`).
5. Si hay archivos que `despliegue` no puede leer, revisa los dueños y corrígelos:

   ```bash
   ls -l /opt/tiendas/mitienda.env
   sudo chown -R despliegue: /opt/tiendas
   chmod 600 /opt/tiendas/mitienda.env
   ```

6. Evita `sudo` con `git` y `docker compose`: deja archivos de `root` dentro del repositorio y vuelve a producir este
   mismo error en la siguiente actualización.

### 7. El backend se reinicia pero la tienda sigue sin funcionar

**Origen:** Preventivo.

**Síntoma:** el `backend` aparece como `Restarting`, o `Up` con un tiempo de actividad de segundos, y la tienda responde
errores (502 o 503), una página en blanco o no carga datos, sin un error evidente.

**Causa probable:** la política `unless-stopped` reinicia un contenedor que falla una y otra vez, y eso puede ocultar un
fallo continuo; un contenedor `Up` no prueba que la tienda funcione. Las causas pueden estar en las dependencias
(PostgreSQL o MongoDB), en la configuración (variables), en que Caddy no llega al backend o en un frontend sin
reconstruir.

**Solución:**

1. Estado y reinicios: `$C ps -a`.
2. Qué dice el backend al arrancar: `$C logs --tail=100 backend`. Si se repite el mismo error en cada intento, esa es
   la causa a resolver y no conviene seguir reiniciando.
3. Revisa las capas de a una:

   ```bash
   curl -sS -o /dev/null -w "HTTP: %{http_code}\n" https://mitienda.cl/api/salud/
   curl -sI https://mitienda.cl/ | head -1
   $C logs --tail=100 web
   ```

   El primero prueba el backend con las bases; el segundo, que Caddy sirve el frontend; el tercero, los registros de
   Caddy.
4. Si falla una base, ve al caso [11](#11-postgresql-o-mongodb-no-responden); si el healthcheck no pasa, al caso
   [3](#3-el-backend-aparece-como-starting-o-unhealthy).
5. Al corregir la causa, `$C restart backend` y comprueba que todo funcione de verdad con
   [Verificar el funcionamiento](#verificar-el-funcionamiento). No uses `down -v`.

### 8. Se ejecuta más de una vez el respaldo en el mismo día

**Origen:** Preventivo.

**Síntoma:** ya existe un respaldo de hoy (el de las 4:00 o uno a mano) y hay que volver a ejecutar `respaldar.sh`, o se
ejecutó y no se sabe si el anterior se perdió.

**Causa probable:** `deploy/respaldar.sh` crea la carpeta del día con `mkdir -p` y escribe los archivos con
redirecciones (`>`). Si se ejecuta otra vez el mismo día para la misma tienda, **sobrescribe** los archivos de ese día.

**Solución:**

1. Antes de repetirlo, copia la carpeta del día fuera de la carpeta de respaldos (ajusta la fecha):

   ```bash
   cp -a /opt/tiendas/respaldos/AAAA-MM-DD/mitienda /opt/tiendas/mitienda-respaldo-previo-AAAA-MM-DD
   ```

   Al quedar fuera de `/opt/tiendas/respaldos`, no la alcanza el borrado automático de los respaldos de más de 7 días.
2. Ejecuta el respaldo ([Respaldar a mano](#respaldar-a-mano)).
3. Comprueba la carpeta del día: `ls -lh /opt/tiendas/respaldos/AAAA-MM-DD/mitienda` debe mostrar los cuatro archivos
   (`postgres.dump`, `mongo.archive.gz`, `media.tar.gz` y `privado.tar.gz`) con tamaños razonables.
4. Conserva la copia previa hasta confirmar que ya no la necesitas, y revisa `df -h` si el disco está justo.

### 9. Falla una restauración

**Origen:** Preventivo.

**Síntoma:** al seguir [Restaurar un respaldo](#restaurar-un-respaldo) aparecen errores como `No such file or directory`,
`unexpected end of file` o fallos de `pg_restore`, `mongorestore` o `tar`.

**Causa probable:** la ruta `D` es incorrecta; falta un archivo (un respaldo antiguo puede no traer `privado.tar.gz`); un
archivo quedó dañado o incompleto (por ejemplo, una copia interrumpida o un disco lleno); o los servicios no se
detuvieron antes de restaurar.

**Solución:** la restauración **reemplaza los datos actuales**, así que no experimentes con la base de datos de
producción y asegúrate de poder volver al estado actual antes de seguir.

1. Detente si un paso falló: no ejecutes `$C start backend web` hasta resolverlo.
2. Haz una copia aparte del estado actual (respaldo y copia de la carpeta, como en el caso
   [8](#8-se-ejecuta-más-de-una-vez-el-respaldo-en-el-mismo-día)) si aún no la tienes.
3. Comprueba que los archivos existen, que no están vacíos y que sus tamaños son razonables (compáralos con otros días):

   ```bash
   ls -lh $D
   for f in postgres.dump mongo.archive.gz media.tar.gz privado.tar.gz; do
     [ -s "$D/$f" ] && echo "$f: con contenido" || echo "$f: FALTA O VACÍO"
   done
   ```

   Los dos comprimidos de archivos se pueden leer sin tocar ningún dato:

   ```bash
   tar tzf $D/media.tar.gz > /dev/null && echo "media: legible"
   tar tzf $D/privado.tar.gz > /dev/null && echo "privado: legible"
   ```

   Estas comprobaciones **no prueban** que `postgres.dump` o `mongo.archive.gz` se puedan restaurar: no existe en este
   manual un comando que valide su integridad sin restaurarlos.
4. Para comprobarlo de verdad, haz una **restauración de prueba en otro servidor o en un entorno aislado**, no en
   producción ([Mover una tienda a otro servidor](#mover-una-tienda-a-otro-servidor) explica cómo restaurar sobre una
   tienda vacía).
5. Corrige lo que indique el error y repite el paso que falló, siguiendo el orden de
   [Restaurar un respaldo](#restaurar-un-respaldo). `mongorestore` debe terminar con `0 document(s) failed to restore`.
6. Al terminar, `$C start backend web` y [Verificar el funcionamiento](#verificar-el-funcionamiento). No uses `down -v`.

### 10. Se pierden modificaciones locales al actualizar el repositorio

**Origen:** Vivido en Taller Maché.

**Síntoma:** `git pull` se niega a continuar con `Your local changes to the following files would be overwritten by
merge`, o, después de un `git reset --hard` o un `git checkout`, un archivo vuelve a su versión del repositorio y las
modificaciones hechas en la VPS desaparecen. Otro síntoma: se edita `deploy/Caddyfile` en la VPS y el sitio no cambia.

**Causa probable:** se editó un archivo versionado directamente en la VPS. En Taller Maché ocurrió con
`deploy/Caddyfile`: había modificaciones locales en ese archivo y se hizo un respaldo adicional antes de actualizar.
Además, ese archivo no se lee desde el repositorio mientras la tienda funciona: `frontend/Dockerfile` lo copia dentro de
la imagen del servicio `web` al construirla (`COPY deploy/Caddyfile /etc/caddy/Caddyfile`) y `deploy/docker-compose.yml`
no lo monta como volumen. Por eso un cambio en él, hecho a mano o traído por `git pull`, no se aplica hasta reconstruir
`web`.

**Solución:**

1. Antes de actualizar, mira qué cambió:

   ```bash
   cd /opt/tiendas/codigo
   git status
   git diff deploy/Caddyfile
   ```

2. Guarda copias fuera del repositorio (nombres de ejemplo):

   ```bash
   cp -a deploy/Caddyfile /opt/tiendas/Caddyfile.local-AAAA-MM-DD
   git diff HEAD > /opt/tiendas/cambios-locales-AAAA-MM-DD.patch
   ```

3. Decide qué hacer con el cambio. Si sirve para todas las tiendas, hazlo en el repositorio y no en la VPS. Si es solo
   de esa tienda, vuelve a aplicarlo después de actualizar, a partir de la copia. `git stash push` antes del `git pull` y
   `git stash pop` después también conservan los cambios, pero pueden dar conflictos si la versión nueva modificó el
   mismo archivo.
4. **Evita como primera medida** `git reset --hard`, `git checkout -- ARCHIVO` y `git clean -fd`: descartan los cambios
   locales sin que git pueda recuperarlos. `git reset --hard` también aparece en
   [Recuperar la versión anterior](#recuperar-la-versión-anterior-si-una-actualización-falla), y las mismas copias
   valen allí.
5. Después de modificar `deploy/Caddyfile` (o de dejarlo como quieres tras actualizar), **reconstruye el servicio
   `web`** para incorporarlo a la imagen:

   ```bash
   $C up -d --build web
   ```

   En Taller Maché, el comando completo es:

   ```bash
   docker compose -p mache -f deploy/docker-compose.yml --env-file /opt/tiendas/mache.env up -d --build web
   ```

   `restart web` **no basta**: reinicia el contenedor con la imagen anterior, que no trae el archivo nuevo. La
   reconstrucción vuelve a compilar el frontend y puede tardar varios minutos.
6. Comprueba el resultado: `$C ps web`, `$C logs --tail=100 web`, `curl -sI https://mitienda.cl/ | head -1` y
   [Verificar el funcionamiento](#verificar-el-funcionamiento) (HTTPS y el sitio). Si el `Caddyfile` nuevo tiene un
   error, `web` puede no arrancar y la tienda quedar inaccesible: vuelve a la copia guardada en el paso 2 y repite el
   `up -d --build web`.

### 11. PostgreSQL o MongoDB no responden

**Origen:** Preventivo.

**Síntoma:** `/api/salud/` responde HTTP 503, o un contenedor de base de datos está detenido o `unhealthy`.

**Causa probable:** contenedor detenido, falta de memoria (Linux cierra un proceso, casi siempre MongoDB) o de disco, o
una contraseña del archivo distinta de la que se usó al crear la base (las variables de inicialización solo se aplican
con el volumen vacío).

**Solución:**

1. `$C ps postgres mongo`, `$C logs --tail=100 postgres` (o `mongo`), `free -h` y `df -h`.
2. Reinicia solo el servicio afectado (`$C restart postgres` o `$C restart mongo`) y observa su registro.
3. Si el error es de autenticación, vuelve a las contraseñas con que se creó la base; cambiar el archivo no cambia una
   base ya creada ([Bases de datos](#bases-de-datos-postgresql-y-mongodb)).
4. Si es memoria, comprueba que el swap de 2 GB esté activo ([Sistema y swap](#sistema-y-swap)).

No borres volúmenes para "empezar de cero".

### 12. El frontend no refleja los cambios

**Origen:** Preventivo.

**Síntoma:** después de actualizar, el sitio sigue mostrando la versión anterior del frontend.

**Causa probable:** el frontend se compila al construir la imagen `web`: un `git pull` sin reconstruir sigue sirviendo
la versión anterior. También puede ser la caché del navegador.

**Solución:**

1. Comprueba qué código hay descargado: `git log -1 --oneline`.
2. Reconstruye: `$C up -d --build`.
3. Recarga sin caché (Ctrl+F5) o abre una ventana privada.

### 13. El correo no se envía

**Origen:** Preventivo.

**Síntoma:** los compradores no reciben los correos del pedido o los de recuperar la contraseña.

**Causa probable:** `RESEND_API_KEY` ausente o inválida, `DEFAULT_FROM_EMAIL` de un dominio no verificado en Resend o el
límite diario del plan gratuito. Sin ninguna configuración de correo, los correos solo se imprimen en la consola del
backend.

**Solución:**

1. Prueba el envío con `sendtestemail` ([Probar el envío de correo desde la VPS](#probar-el-envío-de-correo-desde-la-vps)).
2. Revisa `$C logs --tail=100 backend` y, en Resend, **Domains** y **Emails**.
3. Corrige la variable, valida el archivo y reinicia con `$C restart backend`.

### 14. El servidor se queda sin espacio

**Origen:** Preventivo.

**Síntoma:** errores de escritura, bases que no arrancan o `df -h` con el disco casi lleno.

**Causa probable:** imágenes Docker antiguas acumuladas tras varias reconstrucciones, respaldos (se conservan 7 días) o
crecimiento de las bases y las fotos. Los registros de Docker ya rotan (10 MB por archivo, tres por servicio).

**Solución:**

1. Diagnóstico: `df -h`, `du -sh /opt/tiendas/respaldos` y `docker system df`.
2. Copia los respaldos fuera del servidor ([3. Tareas programadas y respaldos](#3-tareas-programadas-y-respaldos)).
3. Libera las imágenes sin uso con `docker image prune`.

**No uses** `docker volume prune` ni `docker system prune --volumes`: pueden borrar los volúmenes con los datos de la
tienda.

### 15. No se ejecuta una tarea programada

**Origen:** Preventivo.

**Síntoma:** los pedidos por transferencia no se cancelan al vencer, no hay respaldos nuevos o un registro de tarea no se
actualiza.

**Causa probable:** una línea del cron con error o con rutas relativas, otro usuario distinto de `despliegue`, una hora
distinta de la esperada o falta de `-T` en `exec` (el cron no tiene terminal).

**Solución:**

1. Revisa el cron como `despliegue`: `crontab -l`, y la zona horaria con `date` (debe ser `America/Santiago`).
2. Mira el final del registro de la tarea, por ejemplo `tail -n 20 /opt/tiendas/mitienda-pagos.log`.
3. Ejecuta el comando a mano. Correr una tarea de más no tiene efectos
   ([3. Tareas programadas y respaldos](#3-tareas-programadas-y-respaldos)).

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

#### Cómo deben quedar los registros

Esto vale para cualquier tienda; reemplaza `mitienda.cl` y la IP por los datos de ese cliente.

- `@` representa el dominio principal (`mitienda.cl`) y `www` representa `www.mitienda.cl`.
- Ambos deben apuntar a la **IPv4 pública** de la VPS, la que entrega OpenCloud. No la confundas con las direcciones
  internas de Docker (como las `172.x.x.x` que ves dentro de los contenedores) ni con `IP_WEB=0.0.0.0`, que solo
  indica en qué interfaz escucha el Caddy de la tienda.
- Si la tienda no usa IPv6, revisa que no existan registros **AAAA** antiguos que apunten a una dirección incorrecta:
  un AAAA equivocado puede impedir que los visitantes lleguen o que Caddy obtenga el certificado.
  `dig +short AAAA mitienda.cl` no debería devolver nada.
- La propagación se verifica con los `dig` del paso 4: ambos deben devolver la IP de la VPS.
- Caddy usa el dominio configurado en `DIRECCION_SITIO` ([6.2](#62-la-tienda-con-su-dominio)) para obtener y renovar el
  certificado HTTPS automáticamente. Para eso el DNS ya debe apuntar a la VPS y los puertos 80 y 443 deben estar
  abiertos.

#### Ejemplo: Taller Maché

Datos de la VPS de Taller Maché, solo como referencia:

- Dominio: `mache.cl`
- Dominio con www: `www.mache.cl`
- IPv4 pública de la VPS: `45.7.228.140`

| Tipo | Nombre | Valor |
|---|---|---|
| A | @ | 45.7.228.140 |
| A | www | 45.7.228.140 |

```bash
dig +short mache.cl
dig +short www.mache.cl
```

Ambos devuelven `45.7.228.140`, y en el archivo de variables queda `DIRECCION_SITIO="mache.cl, www.mache.cl"`.

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

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env logs --tail=150 backend
```

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
- El monitor de `https://mitienda.cl/api/salud/` cada 5 minutos ([Verificar el funcionamiento](#verificar-el-funcionamiento)).
- Una compra completa de punta a punta con un correo que no sea del equipo: pedido recibido, pago, despacho y
  entregado, revisando que los correos no lleguen a spam.
- Los datos del despliegue registrados para el cliente
  ([Registro de datos para entregar al cliente](#registro-de-datos-para-entregar-al-cliente)).
- Nunca correr las pruebas en el servidor de la tienda (ver [Primer arranque](#primer-arranque)).

### Registro de datos para entregar al cliente

Al terminar el despliegue, deja registrados estos datos de la tienda (sin claves ni contraseñas):

- **Dominio principal** (ej. `mitienda.cl`).
- **Dominio alternativo con www** (ej. `www.mitienda.cl`).
- **Dirección IPv4 pública de la VPS** (la que entregó OpenCloud).
- **Proveedor DNS utilizado** (ej. Cloudflare, o el panel de DNS del registrador).
- **Fecha en que se verificó la configuración** (DNS, HTTPS y `/api/salud/`).

Si se cambia la IP de la VPS, hay que:

1. Actualizar los registros DNS (`@` y `www`) con la IP nueva, como en [6.1](#61-dominio-dns-y-servidor).
2. Revisar la configuración del dominio en Caddy (`DIRECCION_SITIO`, ver [6.2](#62-la-tienda-con-su-dominio)) y los
   orígenes autorizados de Google OAuth ([6.4](#64-inicio-de-sesión-con-google)). Ambos dependen del dominio y no de la
   IP: si el dominio sigue siendo el mismo, normalmente no hay nada que cambiar, pero si cambió también el dominio o
   su dirección, deben actualizarse.
3. Actualizar el registro con la IP nueva y la fecha de la nueva verificación.