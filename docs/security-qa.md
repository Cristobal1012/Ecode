# SCRUM-94 / SCRUM-98: seguridad y contratos de acceso

## Estado y alcance

La inspección inicial de `eidan` encontró cero tests, URLs vacías en usuarios y
catálogo, y un único endpoint de negocio: `POST /ventas/api/checkout/`.
Login, registro, Google SSO y operaciones administrativas todavía no existen.
El modelo tampoco contiene actualmente campos de auditoría de consentimiento
ni una restricción única sobre `google_sso_id`.

La suite verifica la política reutilizable de seguridad con vistas de prueba y
el checkout real contra la base SQL de pruebas. **No demuestra seguridad de
endpoints administrativos o de autenticación que aún no están implementados.**
Cuando se incorporen, deben agregarse a la matriz de integración usando sus URLs
reales y comprobar también que las peticiones denegadas no producen cambios.

## Política implementada

- Las vistas DRF requieren `IsAuthenticated` por defecto. Las rutas públicas
  nuevas deben declarar su permiso explícitamente.
- `TokenAuthentication` precede a `SessionAuthentication`: las peticiones sin
  credenciales a rutas protegidas devuelven `401` con `WWW-Authenticate: Token`.
- Se admite `Authorization: Token <clave>` de DRF, **no Bearer/JWT**. Los tokens
  DRF no caducan automáticamente; su eliminación los revoca. No se añade una
  ruta pública para emitirlos. Ejecutar `python manage.py migrate` para instalar
  las tablas de `rest_framework.authtoken` antes de usar esta configuración.
- Las sesiones Django existentes siguen siendo válidas; una petición con sesión
  válida está autenticada aunque no incluya Authorization. Escrituras por sesión
  necesitan CSRF. Un token reconocido pero inválido no recurre a la sesión.
- `IsAdministrador` requiere cuenta activa y `rol == 'ADMIN'`; ni `is_staff`
  ni `is_superuser` reemplazan ese rol. Aplicar
  `permission_classes = [IsAdministrador]` a futuras vistas de administración.
  La misma condición se comprueba en permisos de objeto.
- Checkout permite invitados en `INVITADO`, `MIXTO` y sin configuración. En
  `REGISTRO_OBLIGATORIO`, rechaza anónimos con `401` antes de validar el cuerpo
  (antes devolvía `400` desde el serializer). Ambos roles pueden comprar.
- `/admin/` pertenece al sitio HTML de Django y conserva sus reglas de sesión,
  staff y redirecciones; la política HTTP de DRF no se aplica a ese sitio.

Con sesiones, CSRF inválido puede producir `403` aun para ADMIN. Un método no
admitido puede producir `405`; no se promete `200` para cualquier petición de
un administrador independientemente de su validez.

## Matriz automatizada

| Superficie | Casos | Resultado |
| --- | --- | --- |
| Permiso unitario de vista/objeto | Anónimo, rol vacío/desconocido, COMPRADOR, staff/superuser, ADMIN inactivo | Denegado |
| Permiso unitario de vista/objeto | ADMIN activo sin flags de Django | Permitido |
| Rutas de prueba privadas | Header ausente/vacío, token desconocido, malformado o esquema no admitido | 401 + challenge |
| Ruta de prueba ADMIN | COMPRADOR en GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS | 403 |
| Ruta de prueba ADMIN | ADMIN activo, mismos métodos | 200; POST 201 |
| Autenticación real | Cuenta inactiva/eliminada, token revocado | 401 |
| Autorización real | ADMIN degradado con token existente | 403 inmediato |
| Sesiones | Roles, CSRF ausente y presente; token inválido con sesión válida | 200/201, 403 o 401 según política |
| Checkout real | Invitados, ambos roles y todos los modos de tienda | 201 o 401 según modo |
| Checkout real | Token inválido/inactivo; identidad inyectada en payload | Sin orden o asignación al usuario autenticado |
| Checkout real | Email invitado ausente; intento de listar órdenes | 400; 405 |

`usuarios/tests/urls.py` solo se monta mediante `override_settings`; sus vistas
no simulan operaciones de negocio ni se publican. No se usa `force_authenticate`
ni se reemplaza la validación de tokens por mocks. Las factories crean usuarios
y contraseñas con el manager real; cada test revierte sus datos. No se necesita
MongoDB ni Google porque no se ejercitan adaptadores de catálogo ni SSO.

## Ejecución

Requisitos: dependencias de `requirements.txt`, PostgreSQL accesible según las
variables `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` y
`POSTGRES_PORT`, y usuario SQL con permiso para crear bases de prueba.
Django crea y elimina `test_<POSTGRES_DB>` y aplica las migraciones, incluidas las
de tokens. No desactivar migraciones ni apuntar a una base de producción.

Con el entorno virtual activado, desde la raíz:

```powershell
python manage.py test
```

Solo esta suite:

```powershell
python manage.py test ecommerce.infrastructure.usuarios ecommerce.infrastructure.ventas --verbosity 2
```

Sin activar el entorno virtual de Windows:

```powershell
.\venv\Scripts\python.exe manage.py test --noinput
```

`.github/workflows/backend-security.yml` ejecuta la suite con PostgreSQL 15
aislado. Usa las versiones ya fijadas por el proyecto y no requiere secretos ni
servicios Google/Mongo. No se cambian los settings productivos por SQLite.

Validación local realizada: 22 tests aprobados sobre PostgreSQL, comprobación
de migraciones sin cambios pendientes y `git diff --check` sin errores.
El workflow queda versionado; su ejecución remota no se ha verificado.

## Contrato OpenAPI

[openapi.json](openapi.json) es OpenAPI 3.0.3, importable en Swagger Editor o
Postman. Su versión `0.1.0-proposed` y cada operación identifican expresamente
que **son contratos propuestos, no rutas disponibles**.

Se comprobó la sintaxis JSON, la resolución de sus 33 referencias internas y
la compatibilidad básica de 16 ejemplos con campos, tipos y patrones. No se
ejecutó un validador OpenAPI completo: el índice de paquetes del entorno no
permitió instalar `openapi-spec-validator`.

Define login, registro, canje de ID token Google y un endpoint auxiliar CSRF.
Se eligen sesiones Django para estos flujos; no se diseña un JWT casero ni se
confunde el ID token de Google con una credencial del sistema. Incluye esquemas,
ejemplos, tipos, obligatoriedad, teléfono internacional, consentimiento booleano,
cookies técnicas, errores y códigos HTTP. `acepta_cookies=false` es válido.

Los errores propuestos `{code, detail, errors?}` y validaciones estrictas deberán
implementarse en sus futuros adaptadores; los errores actuales de DRF conservan
su formato `{detail}` o errores por campo. El contrato contempla `401` para ID
tokens Google caducados; la suite no afirma probar esa verificación pendiente.
Antes de implementar SSO se necesita unicidad de `google_sso_id`, verificación
oficial de tokens y un flujo seguro de vinculación que no una cuentas por email
sin autenticar a su propietario. Registro no inicia sesión automáticamente.

Referencias oficiales de las decisiones:

- [DRF: autenticación y códigos 401/403](https://www.django-rest-framework.org/api-guide/authentication/)
- [DRF: permisos](https://www.django-rest-framework.org/api-guide/permissions/)
- [Google: verificación de ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
