from mongoengine import Document, EmbeddedDocument, fields

class Variante(EmbeddedDocument):
    sku = fields.StringField(required=True, unique=True)
    precio = fields.DecimalField(required=True, precision=2)
    stock = fields.IntField(required=True, default=0)
    imagen_especifica = fields.StringField(null=True, blank=True)
    atributos_variables = fields.DictField(default=dict)

class Producto(Document):
    meta = {'collection': 'productos'}

    nombre = fields.StringField(required=True, max_length=255)
    descripcion = fields.StringField(null=True, blank=True)
    categoria = fields.StringField(required=True)
    imagenes = fields.ListField(fields.StringField(), default=list)
    fecha_creacion = fields.DateTimeField(required=True)
    activo = fields.BooleanField(default=True)
    atributos_globales = fields.DictField(default=dict)
    
    #relación de 1 a N embebida dentro del mismo documento
    variantes = fields.EmbeddedDocumentListField(Variante)

    def __str__(self):
        return f"{self.nombre} ({self.categoria})"