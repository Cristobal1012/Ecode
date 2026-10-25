# Tiendas de prueba en Oracle Cloud (Always Free)

Guía para publicar las tiendas de prueba que el equipo entrega a cada emprendedor: varias tiendas en una sola
máquina gratuita de Oracle Cloud, cada una con su dirección `sslip.io` y HTTPS. Usa la publicación con Docker del
[manual](README.md#publicar-con-docker). El despliegue final en los clientes lo hace otro grupo y puede usar otro
proveedor.

```
Internet ──HTTPS──> Caddy de borde (servidor, puertos 80 y 443, certificados automáticos)
                     ├─ alan.<ip>.sslip.io    ──> tienda "alan"    (127.0.0.1:8081)
                     └─ daniela.<ip>.sslip.io ──> tienda "daniela" (127.0.0.1:8082)
```

Los límites gratuitos de Oracle cambian: revísalos al crear la cuenta.

## 1. Cuenta

- Crea la cuenta Free Tier con un **correo del equipo**, no uno personal, para que cualquiera pueda administrarla.
- **Región de origen: Chile Central (Santiago).** No se puede cambiar después.
- Oracle pide una tarjeta solo para verificar la identidad; una cuenta Always Free no cobra.
- **No pases la cuenta a "Pay As You Go".** En ese modo se cobra lo que exceda el límite gratuito; en la cuenta
  gratuita, lo que lo excede solo se detiene.

## 2. Máquina virtual

- Forma **VM.Standard.A1.Flex** (ARM Ampere) con el máximo gratuito vigente de OCPU y memoria; imagen
  **Ubuntu 24.04 (aarch64)**; disco de 100 GB; la clave SSH del equipo.
- Si aparece "Out of host capacity", prueba otro dominio de disponibilidad o reintenta más tarde.
- Asigna una **IP pública reservada**: la dirección `sslip.io` depende de la IP, y si la IP cambia, cambia la
  dirección de las tiendas.

## 3. Red: se abre en dos lugares

1. **En Oracle:** en la Security List de la VCN, reglas de entrada TCP 80 y 443 desde `0.0.0.0/0`. El 22 (SSH),
   si se puede, solo desde las IPs del equipo.
2. **Dentro de Ubuntu:** las imágenes de Oracle traen reglas de `iptables` que rechazan todo salvo SSH:

   ```bash
   sudo iptables -I INPUT -p tcp -m state --state NEW -m multiport --dports 80,443 -j ACCEPT
   sudo netfilter-persistent save
   ```

## 4. Preparar el servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo timedatectl set-timezone America/Santiago
# Parches de seguridad automáticos (en Ubuntu vienen activos; esto lo confirma)
sudo dpkg-reconfigure -plow unattended-upgrades
```

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

Copia en `/home/despliegue/.ssh/authorized_keys` las claves públicas del equipo. El SSH queda solo con clave (las
imágenes de Oracle ya tienen desactivada la contraseña: compruébalo con `sudo sshd -T | grep passwordauthentication`).

## 5. Código y variables de cada tienda

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
  Daniela `8082` y `8442`. Deja `IP_WEB` en `127.0.0.1`: Docker publica los puertos sin pasar por el `iptables`
  del paso 3, y así solo el Caddy de borde llega a las tiendas.
- `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL` con la dirección de esa tienda.
- `SECRET_KEY`, `CLAVE_CIFRADO_CREDENCIALES`, `POSTGRES_PASSWORD` y `MONGO_CLAVE` **distintas en cada tienda**,
  generadas con los comandos de la plantilla.
- `GOOGLE_CLIENT_ID`: el mismo cliente OAuth sirve para las dos tiendas (paso 9).
- Correo: Gmail por SMTP con la cuenta del equipo y una contraseña de aplicación, y `DEFAULT_FROM_EMAIL` con el
  nombre de la tienda (ej. `Taller Maché <cuenta@gmail.com>`). Ver [Correo](README.md#correo).
- `SECURE_HSTS_SECONDS=3600`. Súbelo solo cuando todo funcione.

## 6. Caddy de borde

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

## 7. Levantar las tiendas

Como `despliegue`, desde `/opt/tiendas/codigo`. La primera vez la compilación tarda varios minutos:

```bash
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env up -d --build
docker compose -p daniela -f deploy/docker-compose.yml --env-file /opt/tiendas/daniela.env up -d --build
curl https://alan.203-0-113-5.sslip.io/api/salud/
```

El último comando debe responder `{"estado": "ok", "postgres": "ok", "mongo": "ok"}`. Revisa también el candado
del navegador en las dos direcciones.

## 8. Datos iniciales de cada tienda

```bash
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec backend python manage.py createsuperuser
docker compose -p alan -f deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec backend python manage.py preparar_tienda_prueba --nombre "<nombre del negocio>"
```

`createsuperuser` con el correo del emprendedor y una contraseña temporal fuerte, que se le entrega por otro canal
(nunca en el mismo correo que la dirección de la tienda). Lo mismo para Daniela.

## 9. Google y correo

- En Google Cloud Console, en el cliente OAuth: agrega `https://alan...` y `https://daniela...` en los orígenes de
  JavaScript autorizados. La pantalla de consentimiento tiene que estar **"En producción"**; en "Prueba" solo
  entran los usuarios agregados a mano.
- `docker compose -p alan ... exec backend python manage.py sendtestemail <correo que no sea del equipo>`:
  confirma que Oracle deja salir el puerto 587 (solo bloquea el 25).

## 10. Tareas programadas y respaldos

`crontab -e` como `despliegue` (la hora es la de Santiago, paso 4):

```cron
# Plazo de pago de las transferencias, cada hora
0 * * * * docker compose -p alan -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/alan.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/alan-pagos.log 2>&1
5 * * * * docker compose -p daniela -f /opt/tiendas/codigo/deploy/docker-compose.yml --env-file /opt/tiendas/daniela.env exec -T backend python manage.py cancelar_pagos_vencidos >> /opt/tiendas/daniela-pagos.log 2>&1
# Respaldos diarios (se guardan 7 días)
0 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh alan /opt/tiendas/alan.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
10 4 * * * sh /opt/tiendas/codigo/deploy/respaldar.sh daniela /opt/tiendas/daniela.env /opt/tiendas/respaldos >> /opt/tiendas/respaldos.log 2>&1
```

Una vez por semana, descarga una copia de `/opt/tiendas/respaldos/` fuera del servidor (ej. con `scp`).

## 11. Monitoreo

Un monitor gratuito (ej. UptimeRobot) que revise `https://<tienda>/api/salud/` cada 5 minutos y avise por correo al
equipo. Responde 503 si alguna base no contesta.

## Mantenimiento

- **Actualizar:** respaldar, `git pull` en `/opt/tiendas/codigo` y el mismo `up -d --build` de cada tienda (las
  migraciones corren solas). Avisa antes a los emprendedores.
- **Revisión semanal:** `docker compose -p <tienda> ... ps` (todo `healthy`), `df -h` (disco), errores en
  `docker compose -p <tienda> ... logs --since 24h backend` y el estado del monitor.
- **Recuperación por inactividad:** Oracle puede detener una máquina gratuita con muy poco uso durante 7 días, y
  avisa por correo antes. Si pasa, se vuelve a encender desde la consola sin perder datos.
- **Pasar al dominio del emprendedor:** un registro A del dominio hacia la IP; cambiar la dirección en el Caddyfile
  de borde y en `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS` y `FRONTEND_URL`; agregar el origen
  en Google; y volver a levantar la tienda con `up -d`.
