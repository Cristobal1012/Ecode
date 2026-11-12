# Tiendas de prueba en un servidor propio

Guía para publicar las tiendas de prueba que el equipo entrega a cada emprendedor: **una tienda por servidor**, con
Ubuntu, una dirección gratuita de DuckDNS y HTTPS. Usa la publicación con Docker del
[manual](README.md#publicar-con-docker). El despliegue final en los clientes lo hace otro grupo y puede usar otro
proveedor.

```
Internet ──HTTPS──> Caddy de la tienda (puertos 80 y 443, certificado automático)
                     └─ mitienda-prueba.duckdns.org ──> frontend, fotos y backend de la tienda
```

Así funcionan hoy las dos tiendas de prueba, cada una en su VPS. Si alguna vez conviene juntar varias tiendas en una
sola máquina, ver [Varias tiendas en un servidor](#anexo-varias-tiendas-en-un-servidor).

## 1. La máquina

Sirve cualquier proveedor que entregue una máquina con **Ubuntu 24.04**, acceso root por SSH y una IP pública fija.
Las tiendas de prueba corren en VPS de OpenCloud (Chile).

**Memoria.** Una tienda de prueba funciona con 1 GB de RAM y el swap de 2 GB del [paso 2](#2-preparar-el-servidor),
con la caché de MongoDB y los procesos del backend reducidos ([paso 3](#3-código-y-variables-de-la-tienda)): en
reposo usa unos 485 MB. Compilar las imágenes pide bastante más memoria, así que para compilar en el mismo servidor
conviene una máquina de 2 GB. La tienda real de un cliente va en un servidor de 4 GB
([detalle](README.md#publicar-con-docker)).

Antes de pagar:

- **Confirma por escrito que los puertos 22, 80 y 443 llegan abiertos desde internet.** Hay proveedores que
  responden al ping, pero bloquean todo TCP en su red: la máquina queda inalcanzable aunque esté encendida. El puerto
  de SSH que indique el proveedor puede no ser el que funciona: prueba también el 22.
- Prefiere uno que cobre **por hora** o tenga **devolución** (ej. 30 días). Así, si la red falla, se borra la
  máquina sin perder el dinero.
- Elige una región en **Chile o Brasil**: desde Chile responde en unos 10 a 70 ms, contra 130 ms o más en Estados
  Unidos.
- Las nubes con plan gratuito para estudiantes (Azure for Students, Oracle Cloud Always Free) se probaron antes:
  Azure entrega crédito por un tiempo limitado y Oracle rechaza muchas tarjetas al registrarse.

Apenas la entreguen, desde tu computador, comprueba que el SSH responde. Después de levantar la tienda (paso 5),
haz lo mismo con el 80 y el 443:

```bash
ssh -o ConnectTimeout=10 root@<IP pública> true && echo "SSH OK"
curl -sI --max-time 10 http://<IP pública>/ | head -1
```

Si el proveedor tiene un firewall en su panel, abre ahí los mismos tres puertos. Sigue en el paso 2.

## 2. Preparar el servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Santiago
# Parches de seguridad automáticos (en Ubuntu vienen activos; esto lo confirma)
sudo dpkg-reconfigure -plow unattended-upgrades
```

Un swap de 2 GB, para que un pico de memoria ponga lenta la tienda en vez de cerrar MongoDB (si `swapon --show` ya
muestra uno, sáltate esto):

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

Un usuario para operar las tiendas, en el grupo `docker`, y la carpeta de trabajo:

```bash
sudo adduser --disabled-password despliegue
sudo usermod -aG docker despliegue
sudo mkdir -p /opt/tiendas/respaldos && sudo chown -R despliegue: /opt/tiendas
```

Copia en `/home/despliegue/.ssh/authorized_keys` las claves públicas del equipo (con permisos `700` la carpeta y
`600` el archivo, a nombre de `despliegue`). El SSH queda solo con clave: compruébalo con
`sudo sshd -T | grep passwordauthentication`, que debe decir `no`.

Si dice `yes` (algunos proveedores lo activan en `/etc/ssh/sshd_config.d/50-cloud-init.conf`), crea un archivo
que se lea antes que ese, sin editar los del proveedor. SSH usa el primer valor que encuentra:

```bash
printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin prohibit-password' \
  | sudo tee /etc/ssh/sshd_config.d/00-solo-llave.conf > /dev/null
sudo sshd -t && sudo systemctl reload ssh
```

`sshd -t` revisa la configuración antes de aplicarla. **No cierres la sesión** hasta comprobar, desde otra
terminal, que entras con la clave. Si algo falla, la consola web del proveedor sigue entrando con la contraseña de
root, porque no pasa por el SSH.

## 3. Código y variables de la tienda

Como `despliegue`:

```bash
git clone <url del repositorio> /opt/tiendas/codigo
cd /opt/tiendas/codigo && git checkout main
cp deploy/tienda.env.example /opt/tiendas/mitienda.env
chmod 600 /opt/tiendas/mitienda.env
```

En el archivo:

- `ARCHIVO_TIENDA=/opt/tiendas/mitienda.env`, la ruta del mismo archivo.
- La dirección de la tienda, que se crea en el [paso 4](#4-dirección-con-duckdns): `DIRECCION_SITIO=mitienda-prueba.duckdns.org`,
  `IP_WEB=0.0.0.0`, `PUERTO_WEB=80` y `PUERTO_WEB_HTTPS=443`. Así el Caddy de la tienda atiende el HTTPS y obtiene
  su certificado solo.
- `ALLOWED_HOSTS=mitienda-prueba.duckdns.org`, y `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL`
  con `https://mitienda-prueba.duckdns.org`.
- `SECRET_KEY`, `CLAVE_CIFRADO_CREDENCIALES`, `POSTGRES_PASSWORD` y `MONGO_CLAVE` **propias de esta tienda**,
  generadas con los comandos de la plantilla.
- Con 1 GB de RAM: `MONGO_CACHE_GB=0.25` y `GUNICORN_WORKERS=1` (están comentadas en la plantilla).
- `GOOGLE_CLIENT_ID`: el mismo cliente OAuth sirve para todas las tiendas de prueba (paso 8).
- Correo: Gmail por SMTP con una contraseña de aplicación, y `DEFAULT_FROM_EMAIL` con el nombre de la tienda
  (ej. `Taller Maché <cuenta@gmail.com>`). Ver [Correo](README.md#correo). Usa una cuenta de Gmail **solo para
  esto**, distinta de la que administra el servidor: la contraseña de aplicación queda en el servidor y da acceso
  completo a esa cuenta.
- `SECURE_HSTS_SECONDS=3600`. Súbelo solo cuando todo funcione.

## 4. Dirección con DuckDNS

[DuckDNS](https://www.duckdns.org) entrega gratis una dirección `<nombre>.duckdns.org`:

1. Entra con una cuenta del equipo (GitHub o Google).
2. Crea el subdominio (ej. `mitienda-prueba`) y escribe en **current ip** la IP pública del servidor. Presiona
   **update ip**.
3. Comprueba desde el servidor que ya apunta a su IP: `dig +short mitienda-prueba.duckdns.org`.

Como la IP del servidor es fija, no hace falta el programa que DuckDNS ofrece para actualizarla. Si la IP cambia,
se corrige a mano en la misma página. El token de la cuenta de DuckDNS no se usa en la tienda: no lo guardes en el
servidor.

Antes se usaba `sslip.io` (direcciones como `alan.203-0-113-5.sslip.io`), que dejó de responder en noviembre de
2026.

## 5. Levantar la tienda

Como `despliegue`, desde `/opt/tiendas/codigo`. La primera vez la compilación tarda varios minutos:

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env up -d --build
curl https://mitienda-prueba.duckdns.org/api/salud/
```

El último comando debe responder `{"estado": "ok", "postgres": "ok", "mongo": "ok"}`. Revisa también el candado
del navegador.

## 6. Datos iniciales de la tienda

```bash
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py createsuperuser
docker compose -p mitienda -f deploy/docker-compose.yml --env-file /opt/tiendas/mitienda.env exec backend python manage.py preparar_tienda_prueba --nombre "<nombre del negocio>"
```

`createsuperuser` con el correo del emprendedor, su nombre y apellidos, y una contraseña temporal fuerte, que se le
entrega por otro canal (nunca en el mismo correo que la dirección de la tienda).

## 7. Tareas programadas y respaldos

`crontab -e` como `despliegue` (la hora es la de Santiago, paso 2). En cada servidor, solo las líneas de su tienda:

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

Una vez por semana, descarga una copia de `/opt/tiendas/respaldos/` fuera del servidor (ej. con `scp`).

## 8. Google y correo

- En Google Cloud Console, en el cliente OAuth: agrega `https://mitienda-prueba.duckdns.org` en los orígenes de
  JavaScript autorizados. La pantalla de consentimiento tiene que estar **"En producción"**; en "Prueba" solo
  entran los usuarios agregados a mano.
- `docker compose -p mitienda ... exec backend python manage.py sendtestemail <correo que no sea del equipo>`:
  confirma que el correo sale del servidor.

## 9. Monitoreo

Un monitor gratuito (ej. UptimeRobot) que revise `https://<tienda>/api/salud/` cada 5 minutos y avise por correo al
equipo. Responde 503 si alguna base no contesta.

## Mantenimiento

- **Actualizar:** respaldar, `git pull` en `/opt/tiendas/codigo` y el mismo `up -d --build` (las migraciones corren
  solas). Avisa antes al emprendedor.
- **Revisión semanal:** `docker compose -p <tienda> ... ps` (todo `healthy`), `free -h` y `df -h` (memoria y
  disco), y errores en `docker compose -p <tienda> ... logs --since 24h backend`, además del estado del monitor.
- **Pasar al dominio del emprendedor:** un registro A del dominio hacia la IP; cambiar la dirección en
  `DIRECCION_SITIO`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL`; agregar el
  origen en Google; y volver a levantar la tienda con `up -d`. Los pasos completos están en
  [Poner en producción la tienda del cliente](README.md#poner-en-producción-la-tienda-del-cliente).

## Anexo: varias tiendas en un servidor

Varias tiendas de prueba pueden compartir una máquina (2 GB de RAM por tienda, con el swap del paso 2). En ese caso
ninguna atiende el HTTPS: lo hace un **Caddy de borde** instalado en el servidor, que reenvía cada dirección a su
tienda:

```
Internet ──HTTPS──> Caddy de borde (servidor, puertos 80 y 443)
                     ├─ alan-prueba.duckdns.org    ──> tienda "alan"    (127.0.0.1:8081)
                     └─ daniela-prueba.duckdns.org ──> tienda "daniela" (127.0.0.1:8082)
```

Lo que cambia respecto de la guía:

- **Paso 3:** un archivo por tienda, con `DIRECCION_SITIO=:80`, `IP_WEB=127.0.0.1` y puertos distintos (ej. Alan
  `PUERTO_WEB=8081` y `PUERTO_WEB_HTTPS=8441`; Daniela `8082` y `8442`). Deja `IP_WEB` en `127.0.0.1`: Docker
  publica los puertos sin pasar por el firewall de Ubuntu, y así solo el Caddy de borde llega a las tiendas.
- **Caddy de borde**, con su paquete oficial (queda como servicio de systemd):

  ```bash
  sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt update && sudo apt install -y caddy
  ```

  `/etc/caddy/Caddyfile`, una entrada por tienda, y después `sudo systemctl reload caddy`:

  ```
  alan-prueba.duckdns.org {
  	reverse_proxy 127.0.0.1:8081
  }

  daniela-prueba.duckdns.org {
  	reverse_proxy 127.0.0.1:8082
  }
  ```

- **Paso 7:** en el cron, una línea por tienda en cada tarea, con las horas desfasadas unos minutos (ej. los pagos
  de la segunda tienda a los :05 y su respaldo a las 4:10) para que no compitan por la memoria.
- **Pasar al dominio del emprendedor:** además, cambiar la dirección en el Caddyfile de borde.
