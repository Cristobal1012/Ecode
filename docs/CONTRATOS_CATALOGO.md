# Documentacion de Payloads: Catalogo y Atributos Personalizados (MongoDB)

Este documento especifica los contratos de datos y formatos JSON aceptados para la persistencia de productos y variantes dinamicas en MongoDB (dgcuments.py).

---

## 1. Esquema de Datos (POST /catalogo/productos/)

### A. Objeto Raiz (Producto)
| Campo | Tipo | Obligatorio | Descripcion |
| :--- | :--- | :---: | ---- |
| `nombre` | String | Sí | Nombre comercial del producto (máx. 255 caracteres). |
| `descripcion` | String | No | Detalle o especificación técnica. |
| `categoria` | String | Sí | Categoría de navegación (clave para filtros en UI). |
| `imagenes` | Array[String] | No | Lista de URLs de imágenes generales. |
| `activo` | Boolean | No | Estado de visibilidad (por defecto: `true`). |
| `atributos_globales` | Object (Dict) | No | Pares clave-valor invariables entre variantes (ej. material, marca). |
~�`variantes` | Array[Variante] | Sí | Lista embebida de variantes comerciales (mínimo 1). |

### B. Objeto Variante (EmbeddedDocument)
| Campo | Tipo | Obligatorio | Descripcion |
| :--- | :--- | :---: | ---- |
~�sku` | String | Sí | Identificador único de inventario. |
~�precio` | Decimal | Sí | Valor unitario (precisión de 2 decimales). |
~�stock` | Integer | Sí | Cantidad física disponible (por defecto: 0). |
| `imagen_especifica` | String | No | URL de imagen asociada a esta combinación. |
| `atributos_variables` | Object (Dict) | No | Atributos dinámicos por variante (ej. talla, color, memoria). |

---

## 2. Payloads de Entrada (Request Body)

### Ejemplo Completo
```json
{
  "nombre": "Polera Deportiva Dry-Fit",
  "descripcion": "Polera técnica transpirable para entrenamiento de alto impacto.",
  "categoria": "Ropa Deportiva",
  "imagenes": [
    "https://storage.ecode.cl/productos/polera-base-1.jpg"
  ],
  "activo": true,
  "atributos_globales": {
    "material": "100% Poliéster reciclado",
    "pais_origen": "Chile",
    "garantia_meses": 3
  },
  "variantes": [
    {
      "sku": "POL-DEP-NEG-M",
      "precio": 19990.00,
      "stock": 25,
      "imagen_especifica": "https://storage.ecode.cl/productos/polera-negra-m.jpg",
      "atributos_variables": {
        "color": "Negro",
        "talla": "M"
      }
    }
  ]
}
```

---

## 3. Contrato de Respuesta (GET /catalogo/productos/)
```json
[
  {
    "id": "66f4b3e8a1c9e2b4d1234567",
    "nombre": "Polera Deportiva Dry-Fit",
    "categoria": "Ropa Deportiva",
    "activo": true
  }
]
```