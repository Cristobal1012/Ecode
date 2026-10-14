# Manual de despliegue (RNF-04)

> En construcción: por ahora cubre las tareas programadas y el correo. Las guías por proveedor
> (plataforma administrada, VPS y nube) se agregarán en esta carpeta.

Toda la configuración va por variables de entorno, documentadas en `.env.example`. Las credenciales de los
medios de pago **no** van en el entorno: el emprendedor las carga desde el panel (Configuración > Medios de pago).

## Pasos después de cada versión nueva

```bash
pip install -r requirements.txt   # incluye django-anymail (correo por Resend)
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

Los correos al comprador salen por la API HTTPS de **Resend** (`RESEND_API_KEY`), que funciona aunque la
plataforma bloquee el SMTP. Sin esa variable se usa SMTP (`EMAIL_HOST`) y, sin ninguna de las dos, los correos
solo se imprimen en la consola.

Antes de la demo o de la tienda real:

1. Verificar el dominio de la tienda en Resend (resend.com/domains) agregando los registros DNS que indica.
2. Usar un remitente de ese dominio en `DEFAULT_FROM_EMAIL`, por ejemplo `Mi Tienda <ventas@mitienda.cl>`.

Con el remitente de prueba `onboarding@resend.dev`, Resend solo entrega a la dirección dueña de la cuenta: sirve
para probar, no para que los compradores reciban sus correos.
