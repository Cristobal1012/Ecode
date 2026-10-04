from django.db import models
from django.conf import settings

class ConfiguracionGlobal(models.Model):
    MODOS_AUTENTICACION = [
        ('INVITADO', 'Invitado'),
        ('REGISTRO_OBLIGATORIO', 'Registro Obligatorio'),
        ('MIXTO', 'Mixto'),
    ]

    TIPOS_LAYOUT = [
        ('LISTA', 'Lista'),
        ('GRID_3', 'Cuadrícula de 3'),
        ('GRID_4', 'Cuadrícula de 4'),
    ]
    nombre_tienda = models.CharField(max_length=255)
    tema_seleccionado = models.IntegerField(default=1)
    logo = models.ImageField(upload_to='negocio/logos/', blank=True, null=True)
    favicon = models.ImageField(upload_to='negocio/favicons/', blank=True, null=True)
    google_analytics_id = models.CharField(max_length=50, blank=True, null=True)
    meta_pixel_id = models.CharField(max_length=50, blank=True, null=True)
    texto_bienvenida = models.TextField(
        default='Bienvenido a nuestra tienda',
    )
    texto_boton_ingreso = models.CharField(
        max_length=100,
        default='Ver Catálogo',
    )
    # Campo restaurado para pasar los tests y soportar URL directa del banner
    banner_url = models.URLField(max_length=500, blank=True, null=True)
    banner = models.ImageField(upload_to='negocio/banners/', blank=True, null=True)
    modo_autenticacion = models.CharField(
        max_length=25, 
        choices=MODOS_AUTENTICACION, 
        default='MIXTO'
    )
    
    api_keys_pagos = models.JSONField(default=dict, blank=True)
    api_keys_logistica = models.JSONField(default=dict, blank=True)
    layout_catalogo = models.CharField(max_length=50, choices=TIPOS_LAYOUT, default="GRID_3") 

    def __str__(self):
        return self.nombre_tienda

class DireccionEnvio(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='direcciones')
    calle = models.CharField(max_length=255)
    calle_numero = models.CharField(max_length=50)
    comuna = models.CharField(max_length=100)
    ciudad = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    codigo_postal = models.CharField(max_length=20, blank=True, null=True)
    es_predeterminado = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.calle}, {self.ciudad}"

class Promocion(models.Model):
    TIPOS_DESCUENTO = [
        ('PORCENTAJE', 'Porcentaje (%)'),
        ('MONTO_FIJO', 'Monto Fijo'),
    ]

    codigo = models.CharField(max_length=50, unique=True)
    tipo_descuento = models.CharField(max_length=20, choices=TIPOS_DESCUENTO)
    valor_descuento = models.FloatField()
    umbral_envio_gratis = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        estado = "Activa" if self.is_active else "Inactiva"
        return f"{self.codigo} ({estado})"

class OrdenCompra(models.Model):
    ESTADOS_PEDIDO = [
        ('PENDIENTE', 'Pendiente'),
        ('PAGADO', 'Pagado'),
        ('EN_PREPARACION', 'En preparación'),
        ('ENVIADO', 'Enviado'),
        ('ENTREGADO', 'Entregado'),
        ('CANCELADO', 'Cancelado'),
    ]
    
    METODOS_PAGO = [
        ('TRANSBANK', 'Transbank'),
        ('PAYPAL', 'PayPal'),
        ('LINKIFY', 'Linkify'),
        ('MERCADO_PAGO', 'Mercado Pago'),
        ('TRANSFERENCIA', 'Transferencia'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='ordenes'
    )
    email_invitado = models.CharField(max_length=255, blank=True, null=True)
    promocion = models.ForeignKey(Promocion, on_delete=models.SET_NULL, null=True, blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    estado = models.CharField(max_length=50, choices=ESTADOS_PEDIDO, default='PENDIENTE')
    metodo_pago = models.CharField(max_length=50, choices=METODOS_PAGO)
    direccion_envio_snapshot = models.JSONField()

    id_transaccion_pasarela = models.CharField(max_length=255, blank=True, null=True)
    proveedor_logistico = models.CharField(max_length=100, blank=True, null=True)
    numero_seguimiento_tracking = models.CharField(max_length=100, blank=True, null=True)

    subtotal = models.FloatField()
    costo_envio = models.FloatField()
    total_final = models.FloatField()

    def __str__(self):
        identificador = self.email_invitado if self.email_invitado else self.usuario
        return f"Orden #{self.id} - {identificador}" 

class DetalleOrden(models.Model):
    orden = models.ForeignKey(OrdenCompra, on_delete=models.CASCADE, related_name='detalles')
    producto_mongo_id = models.CharField(max_length=255)
    variante_sku = models.CharField(max_length=255)
    nombre_producto_snapshot = models.CharField(max_length=255)
    precio_unitario_snapshot = models.FloatField() 
    cantidad = models.IntegerField()

    def __str__(self):
        return f"{self.cantidad}x {self.nombre_producto_snapshot} (Orden #{self.orden.id})"

class PaginaLegal(models.Model):
    TIPOS_PAGINA = [
        ('TERMINOS', 'Términos y Condiciones'),
        ('PRIVACIDAD', 'Política de Privacidad'),
        ('REEMBOLSOS', 'Política de Reembolsos'),
    ]

    tipo_pagina = models.CharField(max_length=30, choices=TIPOS_PAGINA, unique=True)
    titulo = models.CharField(max_length=255)
    contenido = models.TextField()
    ultima_actualizacion = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_tipo_pagina_display()} - {self.titulo}"

class Carrito(models.Model):
    # Relación 1 a 1: Cada usuario tiene exactamente un carrito
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='carrito'
    )
    # Aquí guardaremos el array de productos exactamente como lo maneja React
    items = models.JSONField(default=list, blank=True) 

    def __str__(self):
        return f"Carrito de {self.usuario.email}"