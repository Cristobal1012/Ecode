# SCRUM-149 Optimización de tiempos de respuesta del backend

Fecha: 20 de octubre de 2026. Sprint 6 del equipo / SCRUM Sprint 8. Autor: Eidan.

## Resultado

El catálogo ya cumplía el objetivo local de 2,5 segundos sobre SCRUM-179. Se redujo trabajo repetido comprobado, sin añadir caché persistente, servicios de producción ni cambiar los contratos públicos.

| Medición HTTP, 90 repeticiones por escenario | Mediana antes/después ms | p95 antes/después ms | Máximo antes/después ms | Errores antes/después |
|---|---:|---:|---:|---:|
| Listado inicial | 97,470 / 28,230 | 138,805 / 50,793 | 210,820 / 84,891 | 0 / 0 |
| Opciones globales | 83,076 / 13,016 | 99,676 / 32,846 | 252,232 / 40,411 | 0 / 0 |
| Configuración | 30,082 / 27,222 | 47,308 / 44,180 | 61,504 / 53,637 | 0 / 0 |
| Conjunto inicial de API | 152,287 / 36,339 | 187,289 / 51,455 | 254,388 / 86,222 | 0 / 0 |
| Primera carga tras reiniciar Django, 10 ciclos | 165,143 / 44,328 | 211,571 / 59,342 | 211,571 / 59,342 | 0 / 0 |

El criterio operativo es p95 < 2.500 ms. Se publican todas las muestras, máximos y errores; los máximos aislados no constituyen por sí solos un criterio adicional del ticket. No hubo incumplimientos del umbral. El conjunto inicial mide solicitudes paralelas hasta completar sus cuerpos; no suma sus tiempos ni mide renderizado.

## Cambios y base

- SCRUM-179 se incorporó como cuatro commits individuales con autor y fecha de autor de Jhonatan, mensaje original y referencia al SHA fuente: `705faa6 → e2f9b41`, `4025da9 → c2bc146`, `e90bd42 → c26dba9`, `6a3435d → e5d7006`. Los parches se conservan; SCRUM-82 quedó excluida. SCRUM-177 conserva sus commits y ascendencia.
- Línea base funcional y temporal: `e5d7006`, después de incorporar SCRUM-179. Código funcional final medido: `750360b`.
- Filtros: una lectura proyectada de categoría/atributos, sin hidratación de productos por categoría. Comandos MongoDB: opciones **14 → 2**, listado **16 → 4**; se incluye `getMore` en estos conteos.
- Configuración: lectura en lote de medios de pago, con compatibilidad de adaptadores existentes. Consultas SQL **4 → 2**. El listado legal deja de cargar el HTML que no expone.
- React: solicitudes iniciales **6 → 3**; comparte configuración y usa los filtros incluidos en la página. Conserva recarga explícita y lectura fresca al volver al catálogo.
- Se conserva el cálculo de orden por precio de SCRUM-179: su agregación real tardó 6 ms, sin uso de disco. No se justificó intervenirla ni añadir índices. Por ello la entrega tiene cinco commits propios, en lugar de seis.
- La única modificación de `image_adapters.py` elimina espacios finales heredados; no cambia su lógica.

No se modifican los formatos JSON, URLs ni permisos. El puerto interno `RepositorioMediosPago` incorpora `obtener_varios` con implementación compatible por defecto; el adaptador Django resuelve el lote en una consulta.

## Método y entorno

Windows, Ryzen 5 5600X (6 núcleos/12 hilos), 16 GiB de RAM; Docker dispone de 12 CPU lógicas y aproximadamente 7,7 GiB. Python 3.13, Django 6.1.1, PostgreSQL 15.19 y MongoDB 6.0.28 en Docker; PyMongo 4.18.0, MongoEngine 0.29.3 y Node 24.19.0. Navegador Edge Chromium 155.0.4283.62 mediante Playwright.

Fixture determinista: 1.200 productos; 1.080 públicos, 60 borradores activos y 60 inactivos; 12 categorías, 45 páginas públicas, ofertas, variantes, precios empatados, atributos numéricos/textuales y 60 documentos antiguos con precio calculado ausente o desactualizado. Incluye configuración, medios de pago y páginas legales ficticios. `audit_fixture.py` comprueba que se restauraron las escrituras de los recorridos.

Las bases y volúmenes pertenecen exclusivamente a `ecode-qa149`, en puertos 55439 y 27049. `.env`, datos y servicios existentes se conservan. Correo en memoria, sin cobros ni llamadas de pago de los recorridos.

Un visitante anónimo por localhost, sin limitación artificial de recursos, backend `runserver --noreload` con `DEBUG=True`. Tres series de treinta repeticiones y cinco calentamientos identificados por escenario y serie, excluidos del cálculo. Se miden once endpoints/variantes y el conjunto inicial observado en navegador. El perfil SQL/Mongo se captura fuera de las series. La primera carga se repite diez veces reiniciando Django, sin afirmar que se vacían las cachés de las bases o del sistema operativo.

La primera ejecución también registró diez cargas iniciales; la comparación principal de primeras cargas usa una repetición independiente sin instrumentación simultánea. Ambas ejecuciones se conservan en las evidencias.

## Validación

- Base: **445 tests backend, 120 frontend**, 274 comprobaciones HTTP/persistencia y tres recorridos reales de navegador correctos.
- Final: **454 tests backend, 125 frontend**, 274 comprobaciones HTTP/persistencia y cuatro recorridos reales de navegador correctos. Las consultas de las pruebas nuevas utilizan PostgreSQL y MongoDB reales; la vinculación de colecciones de tests no sustituye las operaciones de base de datos.
- Verificación de las 45 páginas sin duplicados, recuentos, filtros numéricos/textuales y opciones fuera de la página; orden visible ascendente/descendente, ofertas, variantes e históricos; edición y persistencia; visibilidad de borradores/inactivos; inventario de 1.140 activos y doce categorías del formulario; frescura después de escrituras.
- Navegador: 1440×900, 390×844 y 768×1024. Primera/última página y filtros: ancho del documento igual al viewport y un único `main` visible. Navegación por Enter, filtros, orden, detalle, edición de precio a $20.000 desde el panel y actualización de contacto en el pie; sin errores de JavaScript no controlados.
- Navegación hasta catálogo utilizable observada: escritorio 465 ms, móvil 307 ms y tablet 309 ms. Son observaciones de recorrido, no percentiles de rendimiento de navegador ni equivalentes al HTTP backend.
- Build correcto; ESLint de archivos modificados con cero errores y advertencias; `check`, `makemigrations --check --dry-run`, compilación Python y `git diff --check` correctos.

Advertencias heredadas: bundle frontend mayor de 500 kB y aviso de variables de color del ejecutor Playwright. Los mensajes de errores de pasarelas en la suite corresponden a casos negativos simulados existentes; la suite termina correctamente.

Defecto heredado separado: con token de administrador, el listado paginado incluye borradores para el inventario; la vista pública los elimina después y puede mostrar una página vacía con recuento administrativo. Se reprodujo con el código base `e5d7006`: count=1.140, 24 resultados y cero publicados en la primera página. No se modifica en esta tarea. La verificación pública utiliza sesión anónima.

Esta evidencia cubre SCRUM-149 en desarrollo local. No certifica carga de producción, WCAG completo ni reemplaza SCRUM-148/SCRUM-150.

## Reproducción

### Credenciales locales

Copiar `tools/qa/scrum149/.env.example` como `.env.local` en esa misma carpeta y completar en privado:

- `QA149_POSTGRES_PASSWORD`: contraseña del usuario `qa149` en PostgreSQL.
- `QA149_SECRET_KEY`: clave de firma de Django exclusiva de QA.
- `QA149_CLAVE_CIFRADO_CREDENCIALES`: clave de cifrado de los datos QA.
- `QA149_ADMIN_EMAIL` y `QA149_ADMIN_PASSWORD`: cuenta administrativa del fixture.

No versionar valores ni imprimir el archivo o la configuración resuelta de Docker. Python y Playwright cargan ese archivo; las variables de sesión prevalecen. Una variable vacía es un error y no activa un valor de respaldo. `--list` descubre las pruebas sin exigir credenciales; ejecutarlas contra QA sí las exige.

Para un entorno existente, reutilizar la contraseña PostgreSQL, la clave de cifrado y la cuenta válidas actuales. Cambiar la variable de Compose **no cambia la contraseña guardada en un volumen inicializado**: si la autenticación falla, corregir la configuración privada para que coincida con el entorno existente. No borrar volúmenes, recrear usuarios ni volver a sembrar. El generador rechaza bases con datos. Para una instalación QA nueva, elegir valores privados antes del primer arranque y conservarlos. No modificar el `.env` de desarrollo.

Desde la raíz, sin otro proceso en el puerto 8000:

```powershell
docker compose --env-file tools/qa/scrum149/.env.local -p ecode-qa149 -f tools/qa/scrum149/compose.yml config --quiet
docker compose --env-file tools/qa/scrum149/.env.local -p ecode-qa149 -f tools/qa/scrum149/compose.yml up -d --wait
.\venv\Scripts\python.exe tools/qa/scrum149/manage.py migrate --noinput
# Solo una vez, en bases QA vacías; el generador rechaza datos existentes.
.\venv\Scripts\python.exe tools/qa/scrum149/manage.py shell -c "exec(open('tools/qa/scrum149/seed.py', encoding='utf-8').read())"
.\venv\Scripts\python.exe tools/qa/scrum149/audit_fixture.py
.\venv\Scripts\python.exe tools/qa/scrum149/manage.py test --noinput
.\venv\Scripts\python.exe tools/qa/scrum149/profile.py .tmp/scrum149/perfil.json
.\venv\Scripts\python.exe tools/qa/scrum149/measure.py --phase final --graph optimized --output .tmp/scrum149/medicion.json
```

Para HTTP funcional y navegador, iniciar por separado `tools/qa/scrum149/manage.py runserver 127.0.0.1:8000 --noreload`. Ejecutar `verify.py --output .tmp/scrum149/funcional.json`. Desde `frontend`, ejecutar `npm run build`, `npm run test:run` y `npm run test:e2e:qa`. El navegador inicia su propio preview en 5173 y requiere Edge instalado; no intercepta respuestas de la aplicación. Sus escrituras administrativas se restauran al finalizar y las trazas están desactivadas para no guardar credenciales. No ejecutar escrituras funcionales ni otras suites durante una medición.

La suite habitual `npm run test:e2e` solo ejecuta `e2e/landing.spec.js`, simula toda la API y bloquea llamadas inesperadas y escrituras. No requiere backend, fixture ni credenciales. `npm run test:e2e -- --list` descubre dos pruebas; `npm run test:e2e:qa -- --list` descubre cuatro en `e2e-qa`, incluidas las operaciones administrativas reales.

Para repetir la base, restaurar el código histórico del catálogo/frontend en un checkout de auditoría y usar `--graph baseline` con el mismo fixture. No reemplazar ni resetear `eidan`.

Evidencias completas, versiones, series, planes, logs y capturas: `C:\Proyecto_web\consultoria-informatica-files\QA\Pruebas_SCRUM-149`. No se versionan capturas ni registros pesados.
