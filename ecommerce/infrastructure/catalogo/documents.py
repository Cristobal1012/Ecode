from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from mongoengine import Document, EmbeddedDocument, fields

class Variante(EmbeddedDocument):
    sku = fields.StringField(required=True, unique=True)
    precio = fields.DecimalField(required=True, precision=2)
    stock = fields.IntField(required=True, default=0)
    imagen_especifica = fields.StringField(null=True, blank=True)
    atributos_variables = fields.DictField(default=dict)
    
    # --- CAMPOS LOGÍSTICOS A NIVEL DE SKU (MEJOR PRÁCTICA) ---
    peso_kg = fields.FloatField(default=1.0)
    alto_cm = fields.IntField(default=10)
    ancho_cm = fields.IntField(default=10)
    largo_cm = fields.IntField(default=10)

class Producto(Document):
    meta = {'collection': 'productos'}

    nombre = fields.StringField(required=True, max_length=255)
    descripcion = fields.StringField(null=True, blank=True)
    categoria = fields.StringField(required=True)
    # Managed images use storage keys internally; serializers expose their URLs.
    # Existing external HTTP(S) URLs remain supported.
    imagenes = fields.ListField(fields.StringField(), default=list)
    fecha_creacion = fields.DateTimeField(required=True)
    activo = fields.BooleanField(default=True)
    publicado = fields.BooleanField(default=False)
    atributos_globales = fields.DictField(default=dict)
    
    # relación de 1 a N embebida dentro del mismo documento
    variantes = fields.EmbeddedDocumentListField(Variante)

    def __str__(self):
        return f"{self.nombre} ({self.categoria})"

    @classmethod
    def reducir_stock_variante(cls, producto_id, sku, cantidad):
        """Descuenta stock de una variante de forma atómica y condicional (RN-03, AGENTS.md §4.1).

        Un único update filtra por stock suficiente, así dos compras simultáneas de la última
        unidad producen una sola venta. Devuelve False si no hay stock o no existe el SKU.
        """
        cantidad = int(cantidad)
        if cantidad < 1:
            return False
        try:
            id_producto = ObjectId(producto_id)
        except (InvalidId, TypeError):
            return False
        resultado = cls._get_collection().update_one(
            {'_id': id_producto,
             'variantes': {'$elemMatch': {'sku': str(sku), 'stock': {'$gte': cantidad}}}},
            {'$inc': {'variantes.$.stock': -cantidad}},
        )
        return resultado.modified_count == 1


class ImagenPendienteBorrado(Document):
    """Durable, idempotent cleanup intents for files owned by the catalog."""

    meta = {'collection': 'imagenes_catalogo_pendientes_borrado'}
    clave = fields.StringField(required=True, unique=True)
    fecha_creacion = fields.DateTimeField(default=lambda: datetime.now(timezone.utc))
