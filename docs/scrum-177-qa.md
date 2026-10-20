# SCRUM-177 — Verificación del admin de Django

Guía de QA local, actualizada el 20 de octubre de 2026.

## Reglas verificadas

- Pedidos: solo se corrigen nombre, teléfono y dirección del destinatario. Los demás campos se consultan; el panel conserva pago, revisión, estados, inventario y notificaciones. Alta y clonación desde el admin devuelven 403.
- Medios de pago: `datos` admite únicamente los campos públicos definidos para su código. Rechaza secretos, claves desconocidas y estructuras no admitidas sin reflejarlos en errores. El código de un registro existente queda protegido y las ediciones públicas conservan sus credenciales cifradas.
- Registros con datos antiguos no admitidos: se muestra solo la parte pública y se bloquea el guardado, conservando los valores almacenados. Su regularización debe decidirse individualmente.
- Usuarios: se mantienen UserAdmin, identificación por email y cambio de contraseña con Argon2 real.

## Requisitos y preparación segura

Desde la raíz del repositorio, con Python 3.13 en `venv`, dependencias de `requirements.txt` instaladas, Docker Desktop y PowerShell 7.2 o posterior. Para frontend: Node 24 y dependencias del lockfile (`npm.cmd ci` en `frontend` si faltan).

Se reutilizan los servicios QA versionados, PostgreSQL 15 en 55439 y MongoDB 6 en 27049. Cada ejecución recibe bases nuevas `ecode_qa_scrum177_<id>`. El runner fija sus destinos, impide sustituir settings por argumentos y neutraliza las variables que las migraciones históricas podrían importar como credenciales.

Los tests utilizan su propia base SQL y bases Mongo temporales. El correo se captura en memoria durante los tests y en archivos al ejecutar el servidor. Los resultados y medios QA se generan fuera del repositorio, bajo `%TEMP%\ecode-qa-scrum177\<id>`. La preparación y el sembrado rechazan datos ya existentes; para repetirlos se elige otro identificador.

```powershell
docker compose -p ecode-qa149 -f tools/qa/scrum149/compose.yml up -d --wait
$env:QA177_RUN_ID = 'qa_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
.\venv\Scripts\python.exe -m unittest tools.qa.scrum177.test_prepare -v
.\venv\Scripts\python.exe tools/qa/scrum177/prepare.py
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py migrate --noinput
$env:QA177_PASSWORD = Read-Host -Prompt 'Clave ficticia QA de al menos 12 caracteres' -MaskInput
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py shell -c "from tools.qa.scrum177.seed import seed; seed()"
Remove-Item Env:QA177_PASSWORD
```

El fixture crea `qa177.admin@example.test` (superusuario) y `qa177.buyer@example.test`, con la clave introducida; 30 productos con tallas S/M, tres pedidos y medios de pago ficticios. Mercado Pago contiene deliberadamente un dato antiguo ficticio para probar su ocultación y bloqueo. La transferencia manual y el retiro local permiten recorrer el checkout sin cobros ni despachos reales.

## Comandos de comprobación

Conserva `QA177_RUN_ID` en la terminal del backend; en otra terminal del backend debe asignarse el mismo identificador. Usa exclusivamente el runner QA para estos comandos.

```powershell
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py test --noinput
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py check
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe tools/qa/scrum177/manage.py runserver 127.0.0.1:8000 --noreload
```

En otra terminal, desde `frontend`:

```powershell
$env:VITE_API_URL = 'http://localhost:8000/api/'
npm.cmd run build
npm.cmd run test:run
npm.cmd exec -- eslint src --max-warnings=0
npm.cmd run lint
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

El backend y Vite necesitan libres los puertos 8000 y 5173. El correo del servidor queda en el subdirectorio `mail` del directorio temporal de la ejecución.

## Recorridos para repetir

1. Entrar en `http://localhost:8000/admin/`. Consultar pedidos y guardar sus tres datos permitidos. Comprobar que no aparece el alta y que `/admin/ventas/ordencompra/add/` devuelve 403. Crear, editar y eliminar una promoción ficticia.
2. Editar datos públicos de Transbank; intentar introducir `access_token` dentro de `datos` y después JSON malformado. Deben aparecer errores sin el valor secreto. Abrir Mercado Pago y comprobar el bloqueo de su guardado sin limpiar sus datos antiguos.
3. Crear y editar una cuenta ficticia mediante UserAdmin, restablecer su contraseña y entrar en `http://localhost:5173/login`: la clave anterior debe fallar y la nueva funcionar.
4. En la tienda, comprobar paginación, categoría y orden por precio. Seleccionar talla y cantidad, comprar por transferencia con retiro local y verificar el pedido pendiente. Desde Ventas del panel, confirmar pago, preparación, entrega y una cancelación; resolver la revisión ficticia. Contrastar inventario y correos capturados.
5. Repetir catálogo, checkout y ventas a 1440×900 y 390×844: un único `main` visible y ausencia de desbordamiento horizontal del documento.

Las solicitudes manipuladas con sesión y CSRF, la conservación exacta del cifrado, los detalles, el stock y los correos se verifican automáticamente en `ecommerce/infrastructure/ventas/test_admin.py`. La suite de usuarios comprueba el algoritmo persistido y la autenticación sin sustituir Argon2 por un hasher rápido.

## Resultados ejecutados

- Backend: **468 tests correctos**, frente a 454 de la línea base; **5 pruebas de aislamiento** correctas. PostgreSQL y MongoDB reales mediante Docker. Preparación completa repetida con otro identificador y checkout completado en navegador sin credenciales importadas del entorno.
- Frontend: **125 tests correctos** en 9 archivos; build correcto. ESLint de `src`: cero errores y advertencias. Lint global: cero errores y una advertencia heredada en `coverage/block-navigation.js`; el build conserva el aviso heredado de bundle mayor de 500 kB.
- Django `check`, comprobación de migraciones y `git diff --check`: correctos.
- Navegador: acceso al admin; edición permitida y consulta de campos protegidos; secreto rechazado; edición pública válida; registro antiguo bloqueado; alta directa 403; gestión de promociones y usuarios; cambio de contraseña, rechazo de la anterior y login con la nueva. Argon2 comprobado contra el valor persistido sin exportar el hash.
- Servidor HTTP: **18 comprobaciones correctas**, incluidas altas y clonación 403, CSRF, POST manipulados sobre pedidos pendientes, pagados, entregados y en revisión, preservación de credenciales y rechazo de transiciones.
- Panel: checkout de dos unidades por $20.000; pago, preparación y entrega; cancelación de otro pedido y resolución de revisión por navegador. Stock del SKU: 5→3 al pagar; otro pago 3→1 y cancelación 1→3. La otra talla permaneció en 8. Siete notificaciones de negocio capturadas; repetir la cancelación devolvió 400 sin efectos adicionales.
- Regresión SCRUM-149: pruebas de consultas SQL/Mongo, lectura en lote sin secretos, catálogo, filtros, paginación, orden y actualización de contacto público correctos. Catálogo, checkout y ventas comprobados en escritorio y móvil, con un `main` visible y sin desbordamiento del documento.

Las capturas y registros de ejecución quedan fuera del contenido versionado. Todos los recorridos indicados se ejecutaron; el bloqueo temporal de una confirmación de revisión se resolvió reabriendo el panel y completando la operación.
