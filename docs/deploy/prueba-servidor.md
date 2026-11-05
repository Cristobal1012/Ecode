# Tiendas de prueba en un servidor propio

Guía para publicar las tiendas de prueba que el equipo entrega a cada emprendedor: varias tiendas en una sola
máquina virtual con Ubuntu, cada una con su dirección `sslip.io` y HTTPS. Usa la publicación con Docker del
[manual](README.md#publicar-con-docker). El despliegue final en los clientes lo hace otro grupo y puede usar otro
proveedor.

La prueba usa **Azure for Students**, que no pide tarjeta. Oracle Cloud Always Free es la alternativa gratuita, pero
su registro rechaza muchas tarjetas. Solo el paso 1 depende del proveedor; desde el paso 2 la guía es la misma.

```
Internet ──HTTPS──> Caddy de borde (servidor, puertos 80 y 443, certificados automáticos)
                     ├─ alan.<ip>.sslip.io    ──> tienda "alan"    (127.0.0.1:8081)
                     └─ daniela.<ip>.sslip.io ──> tienda "daniela" (127.0.0.1:8082)
```

Cada tienda usa unos 650 MB de RAM en reposo y hasta 1,5 GB en un pico ([detalle](README.md#publicar-con-docker)):
dos tiendas de prueba caben en una máquina de 4 GB con el swap del [paso 2](#2-preparar-el-servidor). La tienda
real de un cliente va sola, en un servidor de 4 GB.

## 1. La máquina

### Azure for Students

**Cuenta.** En la página de Azure for Students, verifica que eres estudiante con tu correo de la universidad. No pide
tarjeta y entrega 100 USD de crédito para usar en 12 meses. Revisa las condiciones vigentes al registrarte.

- **Cuando el crédito llega a cero, Azure no cobra: desactiva la suscripción y las tiendas se caen.** Revisa el saldo
  una vez por semana en la página de saldo de Microsoft Azure Sponsorships. Una máquina de 4 GB, con su IP y su
  disco, consume del orden de 40 a 50 USD al mes según la región: el crédito alcanza para unos dos meses.
- **Nunca aceptes pasar la suscripción a pago por uso** ("Pay-As-You-Go"): desde ahí sí se cobra.

**Regiones permitidas.** Azure for Students limita las regiones donde se pueden crear recursos (suelen ser cinco),
y en otra la creación falla con `RequestDisallowedByAzure`. Antes de crear la máquina, en el portal busca
**Directiva** (Policy) > **Asignaciones**, abre "Allowed resource deployment regions" y revisa la lista. Elige la más
cercana a Chile: Chile Central si aparece; si no, Brazil South; si no, una de Estados Unidos (East US suele ser la
más barata).

**Máquina virtual.** En el portal, **Máquinas virtuales > Crear > Máquina virtual de Azure**:

- **Conceptos básicos:**
  - Suscripción "Azure for Students" y un grupo de recursos nuevo, `tiendas-prueba`.
  - Nombre `tiendas-prueba`, la región elegida y "No se requiere redundancia de la infraestructura".
  - Imagen **Ubuntu Server 24.04 LTS (x64)**.
  - Tamaño **Standard_B2s** (2 vCPU, 4 GB). Si no está disponible en la región, otro de 2 vCPU y 4 GB de la serie B
    (B2s_v2 o B2as_v2).
  - Autenticación con **clave pública SSH**, usuario `azureuser`, "Generar un nuevo par de claves" (descarga el
    `.pem` y guárdalo bien: sin él no se entra al servidor) o la clave pública del equipo.
  - Puertos de entrada públicos: **SSH (22), HTTP (80) y HTTPS (443)**.
- **Discos:** SSD estándar, de 64 GB.
- **Redes:** una IP pública nueva (SKU estándar, que es estática: la dirección `sslip.io` depende de ella). Deja
  desmarcado "Eliminar la IP pública cuando se elimine la máquina virtual".
- **Administración:** **apagado automático desactivado**: si no, las tiendas se apagan cada noche.
- **Revisar y crear.** Al terminar, anota la IP pública de la máquina.

**Red.** Las reglas de entrada quedan en el grupo de seguridad de red (NSG) de la máquina: 22, 80 y 443. Si se puede,
limita el 22 a las IPs del equipo (en la regla de SSH, origen "Mi dirección IP"). Ubuntu en Azure no trae un
firewall propio que bloquee los puertos, así que no hay que configurar nada más.

**Correo.** Azure bloquea la salida por el puerto 25, pero no por el 587 que usa Gmail.

Entra con `ssh -i <archivo .pem> azureuser@<IP pública>` y sigue en el paso 2.

### Alternativa: Oracle Cloud Always Free

- Cuenta Free Tier con un **correo del equipo**, región de origen **Chile Central (Santiago)** (no se puede cambiar
  después). Pide una tarjeta solo para verificar la identidad; suele rechazar tarjetas de débito y prepago. **No
  pases la cuenta a "Pay As You Go".**
- Forma **VM.Standard.A1.Flex** (ARM Ampere) con el máximo gratuito vigente, imagen **Ubuntu 24.04 (aarch64)**,
  disco de 100 GB y una **IP pública reservada**. Si aparece "Out of host capacity", prueba otro dominio de
  disponibilidad o reintenta más tarde.
- Red en dos lugares: en la Security List de la VCN, entrada TCP 80 y 443 desde `0.0.0.0/0` (y el 22 limitado si se
  puede); y dentro de Ubuntu, porque las imágenes de Oracle traen `iptables` que rechaza todo salvo SSH:

  ```bash
  sudo iptables -I INPUT -p tcp -m state --state NEW -m multiport --dports 80,443 -j ACCEPT
  sudo netfilter-persistent save
  ```

- Oracle puede detener una máquina gratuita con muy poco uso durante 7 días, y avisa por correo antes. Si pasa, se
  vuelve a encender desde la consola sin perder datos.

### Alternativa: cualquier VPS con Ubuntu

Sirve cualquier proveedor que entregue una máquina con **Ubuntu 24.04**, acceso root por SSH y una IP pública fija:
4 GB de RAM para dos tiendas de prueba, o 2 GB para una, siempre con el swap del [paso 2](#2-preparar-el-servidor).
Antes de pagar:

- **Confirma por escrito que los puertos 22, 80 y 443 llegan abiertos desde internet.** Hay proveedores que
  responden al ping, pero bloquean todo TCP en su red: la máquina queda inalcanzable aunque esté encendida.
- Prefiere uno que cobre **por hora** o tenga **devolución** (ej. 30 días). Así, si la red falla, se borra la
  máquina sin perder el dinero.
- Elige una región en **Chile o Brasil**: desde Chile responde en unos 10 a 70 ms, contra 130 ms o más en Estados
  Unidos.

Apenas la entreguen, desde tu computador, comprueba que el SSH responde. Después de levantar Caddy (paso 4),
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

## 3. Código y variables de cada tienda

Como `despliegue`:

```bash
git clone <url del repositorio> /opt/tiendas/codigo
cd /opt/tiendas/codigo && git checkout main
cp deploy/tienda.env.example /opt/tiendas/alan.env
cp deploy/tienda.env.example /opt/tiendas/daniela.env
chmod 600 /opt/tiendas/*.env
```

Con la IP `203.0.113.5` (ejemplo), las direcciones son `alan.203-0-113-5.sslip.io` y
`daniela.203-0-113-5.sslip.io`: ya apuntan a la IP, sin configurar nada. En cada archivo:

- `ARCHIVO_TIENDA` con su propia ruta (`/opt/tiendas/alan.env`).
- `DIRECCION_SITIO=:80`, `IP_WEB=127.0.0.1` y puertos distintos: Alan `PUERTO_WEB=8081` y `PUERTO_WEB_HTTPS=8441`;
  Daniela `8082` y `8442`. Deja `IP_WEB` en `127.0.0.1`: Docker publica los puertos sin pasar por el firewall de
  Ubuntu, y así solo el Caddy de borde llega a las tiendas.
- `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL` con la dirección de esa tienda.
- `SECRET_KEY`, `CLAVE_CIFRADO_CREDENCIALES`, `POSTGRES_PASSWORD` y `MONGO_CLAVE` **distintas en cada tienda**,
  generadas con los comandos de la plantilla.
- `GOOGLE_CLIENT_ID`: el mismo cliente OAuth sirve para las dos tiendas (paso 8).
- Correo: Gmail por SMTP con una contraseña de aplicación, y `DEFAULT_FROM_EMAIL` con el nombre de la tienda
  (ej. `Taller Maché <cuenta@gmail.com>`). Ver [Correo](README.md#correo). Usa una cuenta de Gmail **solo para
  esto**, distinta de la que administra el servidor: la contraseña de aplicación queda en el servidor y da acceso
  completo a esa cuenta.
- `SECURE_HSTS_SECONDS=3600`. Súbelo solo cuando todo funcione.

## 4. Caddy de borde

Instala Caddy con su paquete oficial (queda como servicio de systemd):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`, una entrada por tienda:

```
alan.203-0-113-5.sslip.io {
	reverse_proxy 127.0.0.1:8081
}

daniela.203-0-113-5.sslip.io {
	reverse_proxy 127.0.0.1:8082
}
```

`sudo systemctl reload caddy`. Caddy obtiene y renueva los certificados de Let's Encrypt solo, la primera vez que
alguien entra a cada dirección.

## 5. Levantar las tiendas

Como `despliegue`, desde `/opt/tiendas/codigo`. La primera vez la compilación tarda varios minutos:

```bash
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env up -d --build
docker compose -p daniela -f deploy/docker-compose.yml --env-file /opt/tiendas/daniela.env up -d --build
curl https://alan.203-0-113-5.sslip.io/api/salud/
```

El último comando debe responder `{"estado": "ok", "postgres": "ok", "mongo": "ok"}`. Revisa también el candado
del navegador en las dos direcciones.

## 6. Datos iniciales de cada tienda

```bash
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec backend python manage.py createsuperuser
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec backend python manage.py preparar_tienda_prueba --nombre "<nombre del negocio>"
```

`createsuperuser` con el correo del emprendedor, su nombre y apellidos, y una contraseña temporal fuerte, que se le
entrega por otro canal (nunca en el mismo correo que la dirección de la tienda). Lo mismo para Daniela.

## 7. Tareas programadas y respaldos

`crontab -e` como `despliegue` (la hora es la de Santiago, paso 2):

```cron
# Plazo de pago de las transferencias, cada hora
0 * * * * docker compose -p alan -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/alan-pagos.log 2>&1
5 * * * * docker compose -p daniela -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/daniela.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/daniela-pagos.log 2>&1
# Respaldos diarios (se guardan 7 días)
0 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh alan /opt/tiendas/alan.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
10 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh daniela /opt/tiendas/daniela.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
```

Una vez por semana, descarga una copia de `/opt/tiendas/respaldos/` fuera del servidor (ej. con `scp`).

## 8. Google y correo

- En Google Cloud Console, en el cliente OAuth: agrega `https://alan...` y `https://daniela...` en los orígenes de
  JavaScript autorizados. La pantalla de consentimiento tiene que estar **"En producción"**; en "Prueba" solo
  entran los usuarios agregados a mano.
- `docker compose -p alan ... exec backend python manage.py sendtestemail <correo que no sea del equipo>`:
  confirma que el correo sale del servidor.

## 9. Monitoreo

Un monitor gratuito (ej. UptimeRobot) que revise `https://<tienda>/api/salud/` cada 5 minutos y avise por correo al
equipo. Responde 503 si alguna base no contesta.

## Mantenimiento

- **Actualizar:** respaldar, `git pull` en `/opt/tiendas/codigo` y el mismo `up -d --build` de cada tienda (las
  migraciones corren solas). Avisa antes a los emprendedores.
- **Revisión semanal:** `docker compose -p <tienda> ... ps` (todo `healthy`), `df -h` (disco), errores en
  `docker compose -p <tienda> ... logs --since 24h backend`, el estado del monitor y, en Azure, el saldo del crédito.
- **Pasar al dominio del emprendedor:** un registro A del dominio hacia la IP; cambiar la dirección en el Caddyfile
  de borde y en `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL`; agregar el origen
  en Google; y volver a levantar la tienda con `up -d`.
