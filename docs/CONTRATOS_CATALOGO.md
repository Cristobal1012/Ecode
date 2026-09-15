# Documentación de Payloads: Catálogo y Atributos Personalizados (MongoDB)

Este documento especifica los contratos de datos y formatos JSON aceptados para la persistencia de productos y variantes dinámicas en MongoDB (documents.py).

---

## 1. Esquema de Datos (POST /catalogo/productos/)

### A. Objeto Raíz (Producto)
| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :---: | :--- |
| 
ombre | String | Sí | Nombre comercial del producto (máx. 255 caracteres). |
| descripcion | String | No | Detalle o especificación técnica. |
| categoria | String | Sí | Categoría de navegación (clave para filtros en UI). |
| imagenes | Array[String] | No | Lista de URLs de imágenes generales. |
| ctivo | Boolean | No | Estado de visibilidad (por defecto: 	rue). |
| tributos_globales | Object (Dict) | No | Pares clave-valor invariables entre variantes (ej. material, marca). |
| ariantes | Array[Variante] | Sí | Lista embebida de variantes comerciales (mínimo 1). |

### B. Objeto Variante (EmbeddedDocument)
| Campo | Tipo | Obligatorio | Descripción |
| :--- | :--- | :---: | :--- |
| sku | String | Sí | Identificador único de inventario. |
| precio | Decimal | Sí | Valor unitario (precisión de 2 decimales). |
| stock | Integer | Sí | Cantidad física disponible (por defecto: 0). |
| imagen_especifica | String | No | URL de imagen asociada a esta combinación puntual. |
| tributos_variables | Object (Dict) | No | Atributos dinámicos por variante (ej. talla, color, memoria). |
