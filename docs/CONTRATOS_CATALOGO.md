# Documentación de Payloads: Catálogo y Atributos Personalizados (MongoDB)

Este documento especifica los contratos de datos y formatos JSON aceptados para la persistencia de productos y variantes dinámicas en MongoDB (`documents.py`).

---

## 1. Esquema de Datos (POST /catalogo/productos/)

### A. Objeto Raíz (Producto)

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :---: | :--- |
| nombre | String | Sí | Nombre comercial del producto (máx. 255 caracteres). |
| descripcion | String | No | Detalle o especificación técnica. |
| categoria | String | Sí | Categoría de navegación (clave para filtros en UI). |
| imagenes | Array[String] | No | Lista de URLs de imágenes generales (por defecto: `[]`). |
| fecha_creacion | DateTime | Sí | Fecha de creación del producto. |
| activo | Boolean | No | Estado de visibilidad (por defecto: `true`). |
| atributos_globales | Object (Dict) | No | Pares clave-valor invariables entre variantes (por defecto: `{}`). |
| variantes | Array[Variante] | No | Lista embebida de variantes comerciales. Puede estar vacía. |

### B. Objeto Variante (EmbeddedDocument)

| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :---: | :--- |
| sku | String | Sí | Identificador de inventario de la variante. |
| precio | Decimal | Sí | Valor unitario (precisión de 2 decimales). |
| stock | Integer | No* | Cantidad física disponible. Si se omite, el modelo utiliza `0` por defecto. |
| imagen_especifica | String | No | URL de imagen asociada a esta combinación puntual. |
| atributos_variables | Object (Dict) | No | Atributos dinámicos por variante (por defecto: `{}`). |

> **Nota sobre `stock`:** el modelo declara `required=True` y `default=0`. Al existir un valor por defecto, si no se proporciona `stock`, el modelo puede utilizar `0`.