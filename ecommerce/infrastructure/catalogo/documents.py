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
        print(f"\n--- DEBUG STOCK ---")
        print(f"Intentando descontar {cantidad} (Tipo: {type(cantidad).__name__}) del SKU '{sku}' en producto ID: {producto_id}")
        
        try:
            producto = cls.objects.get(id=producto_id)
            print(f"Producto encontrado en MongoDB: {producto.nombre}")
            
            # Aseguramos que la cantidad a descontar sea un número entero
            cant_int = int(cantidad)
            
            for variante in producto.variantes:
                print(f"Revisando variante SKU: '{variante.sku}' | Stock actual: {variante.stock}")
                
                # Convertimos ambos a string por si hay diferencias de formato
                if str(variante.sku) == str(sku):
                    if int(variante.stock) >= cant_int:
                        variante.stock = int(variante.stock) - cant_int
                        producto.save()
                        print(f"¡ÉXITO! Stock descontado. Nuevo stock: {variante.stock}")
                        print(f"-------------------\n")
                        return True
                    else:
                        print(f"ERROR: Stock insuficiente (Tiene {variante.stock}, se piden {cant_int})")
                        print(f"-------------------\n")
                        return False
            
            print(f"ERROR: No se encontró el SKU '{sku}' en las variantes de este producto.")
            print(f"-------------------\n")
            return False
            
        except Exception as e:
            print(f"ERROR EXCEPCIÓN en MongoDB: {str(e)}")
            print(f"-------------------\n")
            return False