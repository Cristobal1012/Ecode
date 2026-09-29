# Cotización logística (SCRUM-119)

`ConfiguracionGlobal.api_keys_logistica` guarda la configuración privada. Ejemplo de estructura:

```json
{
  "proveedor_activo": "CHILEXPRESS",
  "retiro_en_local": {"activo": true, "nombre": "Retiro en tienda"},
  "CHILEXPRESS": {
    "subscription_key": "clave-del-portal",
    "ambiente": "test",
    "codigo_origen": "PUDA",
    "comunas": {"Santiago": "STGO"},
    "ruta_precio": "data.0.serviceValue"
  },
  "STARKEN": {
    "api_key": "clave-del-proveedor",
    "url_cotizacion": "https://endpoint-entregado-por-starken",
    "codigo_origen": 1,
    "comunas": {"Santiago": 19},
    "ruta_precio": "precio"
  }
}
```

Solo se consulta `proveedor_activo` (`STARKEN` o `CHILEXPRESS`). La clave de la comuna se compara sin distinguir mayúsculas ni tildes. Los códigos deben provenir de las coberturas de cada transportista; un nombre de comuna por sí solo no es un código de cobertura. `retiro_en_local.activo` ofrece una opción de costo cero. No incluir claves, endpoints privados ni el JSON de configuración en respuestas públicas.

Para Chilexpress se usa la API de tarifas empresariales, con `subscription_key` en `Ocp-Apim-Subscription-Key`. `ambiente` puede ser `test` o `produccion`. Opcionalmente `url_cotizacion` permite usar el endpoint asignado por Chilexpress y `ruta_precio` especifica una ruta JSON al valor de la tarifa (p. ej. `data.0.serviceValue`). Para Starken se exige `url_cotizacion`, pues el contrato HTTP y la URL dependen del acceso de integración otorgado al comercio. `ruta_precio` identifica el valor en la respuesta. Las llamadas tienen un timeout de cinco segundos y nunca exponen detalles del proveedor al comprador.

`POST /api/ventas/cotizaciones/` recibe `comuna`, `subtotal` y, para despacho, `paquete` con `peso_kg`, `alto_cm`, `ancho_cm`, `largo_cm`. Devuelve `opciones`, cada una con `proveedor`, `nombre`, `tipo`, `costo_envio`, `total_final` y `moneda`. Si un transportista falla y existe retiro, se conserva el retiro y se informa `errores`. El checkout recibe `proveedor_logistico` y el mismo `paquete`; recalcula la tarifa antes de crear la orden. Esta cotización no reserva tarifa ni reemplaza el cálculo de subtotal desde productos, que requiere datos de carrito confiables aún ausentes en el proyecto.

Ejemplo de solicitud del cotizador:

```json
{"comuna":"Santiago","subtotal":25000,"paquete":{"peso_kg":"1.50","alto_cm":"10","ancho_cm":"20","largo_cm":"30"}}
```

Ejemplo de respuesta, cuando también hay retiro en tienda:

```json
{"opciones":[{"proveedor":"CHILEXPRESS","nombre":"Chilexpress","tipo":"DESPACHO","costo_envio":3500,"total_final":28500,"moneda":"CLP"},{"proveedor":"RETIRO_LOCAL","nombre":"Retiro en local","tipo":"RETIRO","costo_envio":0,"total_final":25000,"moneda":"CLP"}],"errores":[]}
```

La documentación pública de [Chilexpress](https://developers.wschilexpress.com/) describe la clave de suscripción, los códigos de cobertura y la cotización por medidas; su [guía de integración](https://cxpgdastprod.blob.core.windows.net/mdn/documentos/Nuevas_API_Chilexpress.pdf) muestra el endpoint empresarial. El [portal de Starken](https://developers.starken.cl/cotizaTusEnvios) anuncia la API de cotización, pero la tienda debe configurar la URL y la ruta del precio de la respuesta entregadas para su integración. Las pruebas automatizadas simulan las respuestas HTTP; la validación con credenciales reales queda pendiente de la configuración de cada comercio.
