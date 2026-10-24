# Cotización logística (SCRUM-119)

## Flujo actual (Chilexpress)

La cotización y el checkout usan `ProveedorLogisticoAdapter`
(`ecommerce/infrastructure/ventas/adapters/logistica.py`), que consulta la API de Chilexpress con las llaves que
carga el admin en el panel (Configuración > Envíos con Chilexpress). Se guardan cifradas en `ProveedorEnvio`
(`DjangoRepositorioCredencialesChilexpress`) y el panel solo ve sus últimos 4 caracteres
(`GET`/`PUT /api/ventas/admin/chilexpress/`):

- Cotizador (obligatoria): tarifas (`rating/api/v1.0/rates/business`).
- Coberturas: regiones, comunas y sucursales (`georeference`). Si falta, se usa la del cotizador.
- Envíos: órdenes de transporte, etiquetas y seguimiento. Si falta, se usa la del cotizador.

El catálogo de comunas (nombre → código de cobertura) se descarga desde Chilexpress y se guarda en memoria.

La configuración de la tienda vive en campos de `ConfiguracionGlobal`: `comuna_origen`, `region_origen`,
`calle_origen`, `numero_origen`, `dpto_casa_origen` y `retiro_en_local_activo`. Son públicos (el checkout
muestra la dirección de retiro); las claves nunca se exponen. La configuración pública también trae
`chilexpress_activo` (solo `true`/`false`): sin llaves cargadas, el checkout no ofrece despacho ni sucursales y
no pide las comunas.

La **entrega coordinada** la hace la propia tienda, sin transportista: el comprador deja su dirección y la tienda
lo contacta para acordar el día y el lugar. El admin la activa en Configuración > Entrega Coordinada
(`entrega_coordinada_activa`, `costo_entrega_coordinada` en CLP y `instrucciones_entrega_coordinada`, que ve el
comprador en el checkout y en los correos). No necesita la dirección del local. La regla de qué entrega propia
está activa y cuánto cuesta vive en `domain/logistica.py` (`EntregasDeLaTienda`).

### `POST /api/ventas/logistica/cotizar/`

Solicitud (`destino` es el nombre de la comuna; peso en kg, medidas en cm, todos mayores a cero):

```json
{"destino": "SANTIAGO", "peso": 1.5, "alto": 10, "ancho": 20, "largo": 30}
```

Respuesta exitosa (`200`):

```json
{"proveedor": "Chilexpress", "precio": 3500, "tiempo_estimado": "EXPRESS", "moneda": "CLP"}
```

Errores, siempre con el cuerpo `{"error": "..."}`:

- `400`: falta `destino`, medidas no numéricas o no positivas, o comuna sin cobertura.
- `503`: Chilexpress no respondió, no ofreció servicios, entregó una tarifa inválida (negativa o no numérica)
  o no se pudo descargar el catálogo de comunas. Nunca se convierte en costo cero.

### Checkout (`POST /api/ventas/checkout/`)

Recibe `proveedor_logistico` (`CHILEXPRESS`, `RETIRO_LOCAL` o `ENTREGA_COORDINADA`) y, para despacho, `paquete`
con `peso_kg`, `alto_cm`, `ancho_cm`, `largo_cm` más la `comuna` en `direccion_envio_snapshot`. El backend
recalcula la tarifa y el total, ignorando `costo_envio`/`total_final` enviados por el cliente. `RETIRO_LOCAL`
cuesta cero y se rechaza con `400` si `retiro_en_local_activo` está desactivado. `ENTREGA_COORDINADA` cobra
`costo_entrega_coordinada`, no se cotiza ni lleva paquete, exige `comuna` y `calle` y se rechaza con `400` si
está desactivada; el envío gratis sobre un monto también la cubre. Si Chilexpress falla, responde `503` y no se
crea la orden.

Las pruebas automatizadas (`ventas/test_logistica.py`) simulan el catálogo y las respuestas HTTP de
Chilexpress, por lo que no salen a internet. La conexión real se valida manualmente contra el sandbox con las
claves del `.env`.

## Diseño anterior (sin uso en producción)

`ServicioCotizacion` (`ecommerce/application/logistica.py`) y `logistics_adapters.py` implementan una
cotización multi-proveedor (Starken/Chilexpress) que recibe su configuración como un diccionario (antes salía del
JSON `ConfiguracionGlobal.api_keys_logistica`, que ya no existe).
Hoy solo los cubren `AdaptadoresTests`; ningún endpoint los usa. Queda pendiente decidir si se eliminan o se
reintegran.

La documentación pública de [Chilexpress](https://developers.wschilexpress.com/) describe la clave de suscripción,
los códigos de cobertura y la cotización por medidas; su
[guía de integración](https://cxpgdastprod.blob.core.windows.net/mdn/documentos/Nuevas_API_Chilexpress.pdf)
muestra el endpoint empresarial.
