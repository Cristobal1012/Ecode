# Manual de despliegue (RNF-04)

> En construcción: por ahora cubre las tareas programadas y el correo. Las guías por proveedor
> (plataforma administrada, VPS y nube) se agregarán en esta carpeta.

Toda la configuración va por variables de entorno, documentadas en `.env.example`. Las credenciales de los
proveedores **no** van en el entorno: el emprendedor las carga desde el panel (Configuración > Medios de pago y
Configuración > Envíos con Chilexpress) y se guardan cifradas con `CLAVE_CIFRADO_CREDENCIALES`. Si esa clave
cambia, hay que volver a cargarlas.

## Pasos después de cada versión nueva

```bash
pip install -r requirements.txt   # ej. django-anymail (correo) y argon2-cffi (sin él no se puede iniciar sesión)
python manage.py migrate
```

## Tareas programadas

### Plazo de pago de las transferencias (cada hora)

Un pedido pagado por transferencia tiene **48 horas** para pagarse. Este comando:

- a las 24 horas sin pago, le envía al comprador un recordatorio con los datos para transferir y la fecha límite
  (una sola vez por pedido);
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
- **Docker:** ejecutar el comando dentro del contenedor del backend desde el cron del servidor, por ejemplo
  `docker compose exec -T backend python manage.py cancelar_pagos_vencidos`.

En desarrollo no hace falta programarlo: se puede correr a mano cuando se quiera probar.

Una orden cancelada no se puede volver a marcar como pagada desde el panel. Si un comprador transfiere después
de la cancelación, el emprendedor lo verá en su cuenta bancaria y decide si devuelve el dinero o le arma un
pedido nuevo.

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
