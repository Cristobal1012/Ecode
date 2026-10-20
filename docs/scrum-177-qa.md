# SCRUM-177 Verificación del admin de Django

## Comportamiento esperado

- Pedidos: solo se editan nombre, teléfono y dirección del destinatario. Los demás campos son de consulta; la creación y la clonación desde el admin devuelven 403.
- Medios de pago: únicamente se admiten datos públicos definidos para el proveedor. Las credenciales no se muestran ni se aceptan en `datos`, tampoco al devolver errores. El código de un medio existente está protegido.
- Los registros con datos antiguos no admitidos ocultan esos valores y bloquean el guardado sin modificarlos automáticamente.
- Se conservan UserAdmin, el cambio de contraseña con Argon2 y las operaciones del panel.

## Pruebas automatizadas

Desde la raíz, con las dependencias del proyecto instaladas y Docker Desktop activo, ejecutar este bloque en una terminal PowerShell nueva. Utiliza los servicios QA existentes y el `manage.py` habitual, sin modificar `.env` ni iniciar servidores.

```powershell
docker compose -p ecode-qa149 -f tools/qa/scrum149/compose.yml up -d --wait
$env:DJANGO_SETTINGS_MODULE = 'backend_project.settings'
$env:DEBUG = 'True'
$env:SECRET_KEY = 'scrum177-comprobacion-local-ficticia'
$env:CLAVE_CIFRADO_CREDENCIALES = 'scrum177-cifrado-local-ficticio'
$env:POSTGRES_DB = 'ecode_qa_scrum149'
$env:POSTGRES_USER = 'qa149'
$env:POSTGRES_PASSWORD = 'qa149-local-only'
$env:POSTGRES_HOST = '127.0.0.1'
$env:POSTGRES_PORT = '55439'
$env:MONGO_URI = 'mongodb://127.0.0.1:27049/ecode_qa_scrum177_comprobacion'
$env:MONGO_TEST_URI = 'mongodb://127.0.0.1:27049/'
$env:ALLOWED_HOSTS = 'localhost,127.0.0.1,testserver'
$env:SECURE_SSL_REDIRECT = 'False'
foreach ($nombre in @('RESEND_API_KEY', 'EMAIL_HOST', 'CHILEXPRESS_API_KEY_COTIZADOR',
    'CHILEXPRESS_API_KEY_COBERTURAS', 'CHILEXPRESS_API_KEY_GEO', 'CHILEXPRESS_API_KEY_ENVIOS',
    'TRANSBANK_WEBPAY_COMMERCE_CODE', 'TRANSBANK_WEBPAY_API_KEY')) {
    [Environment]::SetEnvironmentVariable($nombre, ' ', 'Process')
}
$env:TRANSBANK_ENVIRONMENT = 'INTEGRACION'
.\venv\Scripts\python.exe manage.py test --noinput
.\venv\Scripts\python.exe manage.py check
```

Django crea y elimina su base SQL de pruebas. Las pruebas de catálogo e inventario usan colecciones MongoDB temporales; los correos de los casos de prueba se capturan en memoria. No se necesita sembrar productos ni crear cuentas manualmente. Cerrar esta terminal al terminar descarta las variables temporales.

Los casos de `ecommerce/infrastructure/ventas/test_admin.py` comprueban secretos, errores sin filtraciones, POST manipulados con CSRF, campos protegidos, altas y clonaciones bloqueadas, edición legítima, inventario y notificaciones. La suite de usuarios verifica el cambio de contraseña y Argon2 real.

## Comprobación manual

En un entorno de desarrollo con datos ficticios y una cuenta de superusuario:

1. Abrir un pedido en `/admin/`: únicamente nombre, teléfono y dirección deben ser editables. Guardar una corrección sin alterar el pago ni el estado.
2. Comprobar que no aparece el alta y que `/admin/ventas/ordencompra/add/` devuelve 403.
3. Editar un medio de pago: los datos públicos válidos se guardan; `{"access_token":"secreto-ficticio"}`, claves desconocidas y JSON malformado se rechazan sin mostrar su valor. Las credenciales cifradas se conservan.
4. Cambiar la contraseña de una cuenta ficticia mediante UserAdmin y comprobar el acceso con la nueva contraseña.
5. Confirmar que el panel conserva sus operaciones de pago, revisión, estados e inventario.

Las capturas y registros de ejecución se conservan fuera del contenido versionado.
