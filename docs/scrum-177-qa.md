# SCRUM-177 — Reglas del admin de Django

Fecha: 19 de octubre de 2026, America/Santiago. Autor: Eidan.

## Resultado y alcance

Las tres reglas del ticket tienen pruebas automatizadas sobre las vistas reales del admin:

- `OrdenCompraAdmin` excluye `estado` y `stock_descontado` de los formularios procesados por el servidor. Las altas conservan `PENDIENTE` y stock sin descontar. Una edición permitida sí se guarda aunque el POST intente alterar los campos protegidos.
- `UsuarioAdmin` hereda de `UserAdmin`, utiliza email y los campos propios de `Usuario`, y conserva grupos, permisos, rol y operaciones administrativas. El alta y la edición usan formularios adaptados; el cambio de contraseña usa `AdminPasswordChangeForm`. Se verificó Argon2 real, sin sustituir hashers.
- `MedioPagoAdmin` muestra únicamente código, habilitación, datos públicos y fecha de actualización. El texto cifrado queda fuera del formulario. Las ediciones permitidas conservan exactamente el valor cifrado almacenado.

Los cambios funcionales están en los dos módulos `admin.py` y en el nuevo módulo de formularios de usuarios. No cambian los modelos, migraciones, contratos JSON, casos de uso, configuración de hashers, frontend ni Docker Compose.

Base verificada: `eidan` y `origin/eidan` en `6237f1b`; `origin/sprint-6` en `9bf3a1e`, con árboles idénticos. El código validado corresponde a `cd582a9`, después de los cinco commits funcionales y de pruebas. El sexto commit incorpora esta evidencia.

## Entorno y aislamiento

- Backend: Python del `venv`, Django 6.1.1, `localhost:8000`. Frontend Vite: `localhost:5173`.
- PostgreSQL 15 y MongoDB 6: servicios `db-postgres` y `db-mongo` del Compose existente.
- Bases nuevas para navegador/HTTP: `ecode_qa_scrum177_20261019_3a71`, tanto en PostgreSQL como en MongoDB. Todas las cuentas, pedidos, productos y datos de pago utilizados son ficticios.
- Django crea y elimina su base SQL de tests. Las pruebas de integración nuevas vinculan `Producto` a una base MongoDB `test_ecode_admin177_<uuid>` y eliminan únicamente esa base al terminar.
- La configuración QA temporal está bajo `venv/qa_scrum177`, fuera del contenido versionado. No se modificó `.env` ni se cambiaron contraseñas de cuentas existentes. No se eliminaron volúmenes.
- Los tests capturan correo en memoria; el servidor QA usa `MAILERS` con backend de archivos. No se enviaron correos a proveedores ni se realizaron cobros o despachos reales. El checkout utilizó transferencia manual y retiro local.
- Al terminar se detuvieron únicamente los servidores QA iniciados para esta validación y se liberaron los puertos 8000 y 5173. Se conservaron las bases QA, los mensajes originales y los servicios de Docker para revisión posterior.

## Pruebas automatizadas y controles por commit

| Cambio | Verificación previa al commit | Resultado |
|---|---|---|
| `c1cf6df` — pedidos protegidos | Tests nuevos del admin, cambios de estado y correos del panel | 16 aprobados |
| `ee8a8d4` — formularios por email | Formularios y contraseñas existentes | 11 aprobados |
| `0444546` — UserAdmin | Suite completa de usuarios | 53 aprobados |
| `f970bda` — credenciales de pago | Admin, repositorio/API de medios de pago y casos de uso | 45 aprobados |
| `cd582a9` — integración admin/panel | Suite completa de backend | 433 aprobados |

Antes de esos commits se ejecutaron también `check`, `git diff --check` y el build del frontend. Para el commit documental se verifican enlaces, integridad de los artefactos, ausencia de credenciales, `check` y build.

La línea base aprobó **398 tests**; el resultado final aprueba **433**, con **35 tests nuevos**. Las pruebas incluyen POST con sesión y CSRF válido, edición permitida que realmente persiste, cuentas SSO sin contraseña utilizable, validadores de contraseña, permisos y conservación de sesión al cambiar la clave propia. Las pruebas de inventario utilizan MongoDB real y las de notificación ejecutan los callbacks `on_commit`.

| Comprobación final | Resultado |
|---|---|
| Backend completo | 433 tests, OK |
| Frontend | 117 tests en 8 archivos, OK |
| `makemigrations --check --dry-run` | No changes detected |
| Django `check` | Sin incidencias |
| Compilación de los módulos Python modificados | Correcta |
| Frontend build | Correcto; advertencia de bundle mayor a 500 kB ya presente en la base |
| ESLint de `src`, con `--max-warnings=0` | 0 errores, 0 advertencias |
| ESLint global | 0 errores, 1 advertencia, idéntica a la base |

La advertencia global está en `frontend/coverage/block-navigation.js`, un archivo generado ya existente. Se conservó ese trabajo. El primer intento de la suite base detectó que faltaba `django-anymail`; se instaló la versión 15.2 ya declarada en `requirements.txt`, sin modificar dependencias del proyecto, y se repitió la línea base con éxito.

Comandos ejecutados desde la raíz, mediante el envoltorio que fija la configuración QA aislada:

```powershell
.\venv\Scripts\python.exe venv\qa_scrum177\run.py test --noinput --verbosity 1
.\venv\Scripts\python.exe venv\qa_scrum177\run.py makemigrations --check --dry-run
.\venv\Scripts\python.exe venv\qa_scrum177\run.py check
```

Desde `frontend`:

```powershell
npm.cmd run build
npm.cmd run test:run
npm.cmd run lint -- --format json
npm.cmd exec -- eslint src --max-warnings=0 --format json
```

El envoltorio local delega en los mismos comandos de gestión que `manage.py`. Para reproducir en otra instalación se debe seleccionar una configuración QA equivalente, con bases separadas y correo capturado. Los tests nuevos se encuentran en `ventas/test_admin.py`, `usuarios/tests/test_admin.py` y `usuarios/tests/test_admin_forms.py`.

## Recorridos realmente ejecutados

| Recorrido | Medio | Evidencia y resultado |
|---|---|---|
| Acceso del superusuario al admin | Navegador | Acceso correcto; [captura 01](scrum-177-capturas/01-admin-acceso.jpg). |
| Edición de destinatario con estado protegido | Navegador | Cambio guardado; estado y control de stock sin controles editables; [captura 02](scrum-177-capturas/02-pedido-solo-lectura.jpg). |
| Alta, edición a 15% y borrado de promoción QA | Navegador + consulta SQL | Operaciones completadas; [captura 03](scrum-177-capturas/03-promocion-editada.jpg). La configuración de bienvenida también se actualizó y verificó en SQL. |
| Gestión de medios de pago | Navegador | Listado, alta, edición, error JSON, historial y confirmación de borrado inspeccionados. Datos públicos editados; credencial conservada en BD. [Listado](scrum-177-capturas/04-pagos-listado.jpg), [edición](scrum-177-capturas/05-pagos-sin-credenciales.jpg), [error](scrum-177-capturas/06-pagos-error-sin-credenciales.jpg). |
| Alta y edición de usuario | Navegador + consulta SQL | Cuenta creada por email, perfil editado y Argon2 comprobado al crearla; [usuarios](scrum-177-capturas/07-usuarios-gestionados.jpg), [consulta sanitizada](scrum-177-evidencias/password-creation.json). |
| Cambio de contraseña e inicio de sesión | Navegador + consulta SQL | Formulario estándar completado; la tienda rechazó la clave anterior y aceptó la nueva. Se verificó Argon2 y la clave nueva contra el valor persistido. [Sesión posterior](scrum-177-capturas/08-login-nueva-clave.jpg). |
| Checkout de dos unidades por transferencia y retiro | Navegador + SQL/Mongo/correo | Pedido #2 creado pendiente, total $20.000, sin descuento prematuro de stock y con un correo capturado. [Checkout escritorio](scrum-177-capturas/09-checkout-escritorio.jpg), [móvil](scrum-177-capturas/10-checkout-movil.jpg), [confirmación](scrum-177-capturas/11-pedido-recibido.jpg). |
| Confirmación de pago del pedido #1 | Navegador + SQL/Mongo/correo | Paso a pagado, stock 5→3 en su SKU, otra variante sin cambios y un aviso adicional. [Panel](scrum-177-capturas/13-panel-pago-confirmado.jpg). |
| Cancelación y repetición del pedido #1 | HTTP autenticado contra el servidor QA | Cancelación 200, reposición 3→5 y un correo; repetición 400 sin efectos adicionales. **No se declara completada por navegador.** |
| Ciclo del pedido #2 y falta de stock del #3 | HTTP autenticado contra el servidor QA | #2: pagado→preparación→listo para retirar→entregado; un único descuento y cuatro avisos. #3: pago en revisión sin stock descontado; su cancelación no repuso unidades. **Estas transiciones se verificaron por HTTP.** |

Los POST manipulados complementan el recorrido visual y se realizaron contra el servidor en ejecución, con una sesión real y CSRF válido:

| Intento | Resultado persistido |
|---|---|
| POST sin CSRF | 403 |
| Pedido pendiente: inyectar `PAGADO` y `stock_descontado=true` | Respuesta 302 por la edición permitida; sigue pendiente, stock 5/8, sin correos y detalles intactos |
| Pedido pagado: inyectar `CANCELADO` y borrar la marca de stock | Respuesta 302 por la edición permitida; sigue pagado, marca verdadera, stock 3/8 y sin nuevos correos |
| Panel: pendiente→enviado | 400, sin cambios de stock ni correo |
| Medio de pago: inyectar reemplazo de credenciales al editar datos públicos | Datos públicos guardados y texto cifrado idéntico al anterior |
| Medio de pago: JSON inválido con credenciales inyectadas | Error de formulario sin reflejar el valor inyectado ni el cifrado almacenado |

Registros sanitizados: [POST iniciales](scrum-177-evidencias/http-checks.json), [pedido pagado](scrum-177-evidencias/http-pagado.json), [cancelación e idempotencia](scrum-177-evidencias/http-cancelacion.json) y [regresión del panel](scrum-177-evidencias/http-panel-regresion.json).

## Inventario, notificaciones y revisión visual

| Momento | SKU S | SKU M | Correos acumulados |
|---|---:|---:|---:|
| POST manipulado inicial | 5 | 8 | 0 |
| Checkout #2 creado por navegador | 5 | 8 | 1 |
| Pago #1 por navegador | 3 | 8 | 2 |
| Intento de cancelación directa en admin | 3 | 8 | 2 |
| Cancelación #1 por HTTP | 5 | 8 | 3 |
| Pago #2 por HTTP | 3 | 8 | 4 |
| Preparación, retiro y entrega #2 por HTTP | 3 | 8 | 7 |
| Revisión sin stock y cancelación #3 por HTTP | 3 | 8 | 9 |

Se conservaron los mensajes originales en el entorno QA local. La [exportación de los nueve correos](scrum-177-evidencias/correos-capturados.txt) contiene asuntos, destinatarios ficticios y cuerpos, sin credenciales ni cabeceras de autenticación. [Estado final SQL/Mongo](scrum-177-evidencias/estado-final.json).

Se midieron checkout y panel a 1440×900, y login, checkout y panel a 390×844: un único `main` visible y ancho del documento no superior al viewport en cada medición. [Métricas DOM](scrum-177-evidencias/viewport.json), [login móvil](scrum-177-capturas/12-login-movil.jpg), [panel móvil](scrum-177-capturas/14-panel-movil.jpg). La tabla de ventas mantiene su desplazamiento interno en móvil. La captura de sesión posterior al cambio de clave se tomó con el viewport inicial de la tienda, 1280×720.

## Limitación de navegador y evidencia pendiente

Al seleccionar **Cancelado** en Ventas, la herramienta de navegador dejó de responder. La API de diálogos no permitió completar la confirmación existente y los intentos documentados de recuperación no restauraron la interacción. Esa confirmación ya está en el frontend de la base; no se modificó para facilitar la prueba. No se ha demostrado un defecto del producto a partir de ese bloqueo de herramienta.

Queda pendiente completar con navegador la confirmación de cancelación y el resto del ciclo de estados posterior al bloqueo. Esas reglas sí quedaron comprobadas con tests automatizados y con HTTP real autenticado, inventario real y correos capturados, tal como se distingue en las tablas. No se atribuyen esos resultados al navegador.

El [resumen automatizado](scrum-177-evidencias/automatizadas.json) y el [manifiesto SHA-256 de los artefactos](scrum-177-evidencias/sha256.json) permiten contrastar los resultados y la integridad de las capturas. La evidencia publicada contiene únicamente datos ficticios; no incluye contraseñas, hashes de contraseña, sesiones ni credenciales de pasarelas.
