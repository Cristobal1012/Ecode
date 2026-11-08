from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.conf import settings

from ecommerce.domain.blog import (
    LARGO_NOMBRE_BLOG, LARGO_RESUMEN, LARGO_SLUG, LARGO_TITULO, NOMBRE_BLOG_POR_DEFECTO, EstadoPublicacion,
)
from ecommerce.domain.contacto import LOGO_UNIVERSIDAD_HEADER, UBICACIONES_LOGO_UNIVERSIDAD
from ecommerce.domain.cotizaciones import ETIQUETAS_ESTADO_COTIZACION, EstadoCotizacion
from ecommerce.domain.documentos_tributarios import ModeloEmision
from ecommerce.domain.medios_pago import MEDIOS_PAGO
from ecommerce.domain.resenas import (
    ESTRELLAS_MAXIMAS, ESTRELLAS_MINIMAS, ETIQUETAS_ESTADO_RESENA, LARGO_NOMBRE_PUBLICO, EstadoResena,
)

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
    
    # --- CAMPOS DE ORIGEN / RETIRO EN LOCAL ---
    comuna_origen = models.CharField(
        max_length=100, 
        default='Santiago',
        help_text="Comuna desde donde se despachan los productos (Punto A)"
    )
    region_origen = models.CharField(
        max_length=100, 
        default='Metropolitana',
        blank=True, 
        null=True
    )
    calle_origen = models.CharField(max_length=255, default='Av. Principal', blank=True, null=True)
    numero_origen = models.CharField(max_length=50, default='123', blank=True, null=True)
    dpto_casa_origen = models.CharField(max_length=100, blank=True, null=True, help_text="Ej: Piso 4, Oficina 405 o Bodega B")
    retiro_en_local_activo = models.BooleanField(default=True, help_text="Permite a los clientes seleccionar retiro gratuito en local")
    # Entrega coordinada (RF-02.3): la tienda contacta al comprador para acordar la entrega, sin transportista
    entrega_coordinada_activa = models.BooleanField(default=False)
    costo_entrega_coordinada = models.PositiveIntegerField(default=0)
    instrucciones_entrega_coordinada = models.CharField(max_length=300, blank=True, default='')
    # Formulario de cotización y encargos (personalizados, a pedido o en cantidad): el admin lo activa
    cotizaciones_activas = models.BooleanField(default=False)
    # Blog o portafolio (domain/blog.py): activo, el enlace del menú lleva a /blog con el nombre que eligió el admin
    blog_activo = models.BooleanField(default=False)
    blog_nombre = models.CharField(max_length=LARGO_NOMBRE_BLOG, default=NOMBRE_BLOG_POR_DEFECTO)
    # Reseñas con estrellas (domain/resenas.py): activas, el correo de entrega pide la reseña y la tienda la muestra
    resenas_activas = models.BooleanField(default=False)
    # El modelo de emisión que la tienda declaró en el SII (domain/documentos_tributarios.py): decide si un pago
    # con tarjeta también pide boleta en el panel. Sin declarar, el SII asume VOUCHER
    modelo_emision = models.CharField(max_length=20, choices=[(m.value, m.value) for m in ModeloEmision],
                                      default=ModeloEmision.VOUCHER.value)

    tema_seleccionado = models.IntegerField(default=1)
    # Combinación de fuentes (título + texto) de la tienda y el panel: los IDs y las fuentes viven en
    # frontend/src/constants/tipografias.js; 1 es la Editorial (Cormorant Garamond + Inter)
    tipografia_seleccionada = models.PositiveSmallIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(5)])
    logo =models.ImageField(upload_to='negocio/logos/', blank=True, null=True)
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
    # Landing (RF-01.1): campos fijos que el admin edita desde el panel; el título es texto_bienvenida
    subtitulo_bienvenida = models.CharField(max_length=200, blank=True, default='')
    texto_landing = models.TextField(blank=True, default='')
    # Sección "Nosotros" de la landing: sin texto no se muestra
    nosotros_titulo = models.CharField(max_length=120, blank=True, default='')
    nosotros_texto = models.TextField(blank=True, default='')
    nosotros_imagen = models.ImageField(upload_to='negocio/nosotros/', blank=True, null=True)
    banner_url = models.URLField(max_length=500, blank=True, null=True)
    banner = models.ImageField(upload_to='negocio/banners/', blank=True, null=True)
    # Contacto y redes: van en el pie de página. La dirección es la del local (arriba) y solo se publica si
    # el admin lo elige o si hay retiro en local (domain/contacto.py)
    correo_contacto = models.EmailField(blank=True, default='')
    horario_atencion = models.TextField(blank=True, default='')
    mostrar_direccion_pie = models.BooleanField(default=False)
    # RN-01: dónde va el logo de la Universidad, header o footer; nunca se oculta (domain/contacto.py)
    ubicacion_logo_universidad = models.CharField(
        max_length=10, choices=[(u, u) for u in UBICACIONES_LOGO_UNIVERSIDAD], default=LOGO_UNIVERSIDAD_HEADER)
    # Sección de Instagram de la landing: sin usuario no se muestra; las fotos las sube el admin (no es el feed)
    instagram_usuario = models.CharField(max_length=30, blank=True, default='')
    instagram_foto_1 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    instagram_foto_2 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    instagram_foto_3 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    instagram_foto_4 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    instagram_foto_5 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    instagram_foto_6 = models.ImageField(upload_to='negocio/instagram/', blank=True, null=True)
    modo_autenticacion = models.CharField(
        max_length=25, 
        choices=MODOS_AUTENTICACION, 
        default='MIXTO'
    )
    
    layout_catalogo = models.CharField(max_length=50, choices=TIPOS_LAYOUT, default="GRID_3")

    def __str__(self):
        return self.nombre_tienda


class FotoBanner(models.Model):
    """Foto del carrusel de la portada (RF-01.1, SCRUM-194). Se ordenan con el campo orden."""

    configuracion = models.ForeignKey(ConfiguracionGlobal, on_delete=models.CASCADE, related_name='fotos_banner')
    imagen = models.ImageField(upload_to='negocio/banners/')
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'id']

    def __str__(self):
        return f'Foto banner {self.orden} de {self.configuracion}'


class MedioPago(models.Model):
    """Un medio de pago configurado por el emprendedor (RN-02). Los campos de cada medio los define el dominio."""

    codigo = models.CharField(max_length=30, unique=True,
                              choices=[(d.codigo.value, d.nombre) for d in MEDIOS_PAGO])
    habilitado = models.BooleanField(default=False)
    # Datos que no son secretos (ej. ambiente, datos bancarios que ve el comprador)
    datos = models.JSONField(default=dict, blank=True)
    # Credenciales en JSON cifrado con CLAVE_CIFRADO_CREDENCIALES; nunca en texto plano
    credenciales_cifradas = models.TextField(blank=True, default='')
    actualizado = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.get_codigo_display()


class ProveedorEnvio(models.Model):
    """Credenciales de un courier que carga el emprendedor en el panel, una fila por courier.

    El código es el del registro de couriers (ventas/couriers/__init__.py), ej. CHILEXPRESS.
    """

    codigo = models.CharField(max_length=30, unique=True)
    # JSON cifrado con CLAVE_CIFRADO_CREDENCIALES; nunca en texto plano
    credenciales_cifradas = models.TextField(blank=True, default='')
    actualizado = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.codigo


class DireccionEnvio(models.Model):
    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='direcciones')
    calle = models.CharField(max_length=255)
    calle_numero = models.CharField(max_length=50)
    dpto_casa = models.CharField(max_length=100, blank=True, null=True)
    comuna = models.CharField(max_length=100)
    ciudad = models.CharField(max_length=100)
    # Opcional: el checkout no la pide y Chilexpress cotiza y despacha con la comuna
    region = models.CharField(max_length=100, blank=True, default='')
    codigo_postal = models.CharField(max_length=20, blank=True, null=True)
    es_predeterminado = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Si el usuario marca esta dirección como predeterminada,
        # desmarcamos las demás.
        if self.es_predeterminado:
            DireccionEnvio.objects.filter(usuario=self.usuario).update(es_predeterminado=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.calle} {self.calle_numero}, {self.ciudad}"

class EmpresaComprador(models.Model):
    """Datos de facturación que un comprador registrado guardó para sus próximas compras como empresa."""

    usuario = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='empresa')
    razon_social = models.CharField(max_length=150)
    rut = models.CharField(max_length=12)
    giro = models.CharField(max_length=120)
    direccion = models.CharField(max_length=255)
    correo = models.EmailField()

    def __str__(self):
        return f'{self.razon_social} ({self.rut})'


class Cotizacion(models.Model):
    """Solicitud de cotización o encargo de una persona o empresa (domain/cotizaciones.py)."""

    ESTADOS = [(estado.value, etiqueta) for estado, etiqueta in ETIQUETAS_ESTADO_COTIZACION.items()]

    fecha_creacion = models.DateTimeField(auto_now_add=True)
    estado = models.CharField(max_length=20, choices=ESTADOS, default=EstadoCotizacion.NUEVA.value)
    nombre = models.CharField(max_length=120)
    correo = models.EmailField()
    telefono = models.CharField(max_length=15)
    # Del catálogo (id de MongoDB y nombre al cotizar) o descrito por el cliente
    producto_id = models.CharField(max_length=24, blank=True, default='')
    producto_nombre = models.CharField(max_length=255, blank=True, default='')
    descripcion = models.TextField(blank=True, default='')
    cantidad = models.PositiveIntegerField()
    personalizacion = models.TextField(blank=True, default='')
    fecha_requerida = models.DateField(null=True, blank=True)
    # Cotiza como empresa: los datos para la factura (null si es una persona)
    datos_empresa = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-fecha_creacion', '-id']

    def __str__(self):
        return f'Cotización #{self.id} - {self.nombre}'


class FotoCotizacion(models.Model):
    """Foto de la idea del cliente. El archivo está en ARCHIVOS_PRIVADOS_ROOT, no en media: solo lo entrega la API
    al admin (repositorio_cotizaciones.py)."""

    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='fotos')
    # Ruta relativa dentro de ARCHIVOS_PRIVADOS_ROOT, con un nombre al azar
    ruta = models.CharField(max_length=255)

    class Meta:
        ordering = ['id']


class Promocion(models.Model):
    TIPOS_DESCUENTO = [
        ('PORCENTAJE', 'Porcentaje (%)'),
        ('MONTO_FIJO', 'Monto Fijo'),
    ]

    codigo = models.CharField(max_length=50, unique=True)
    tipo_descuento = models.CharField(max_length=20, choices=TIPOS_DESCUENTO)
    valor_descuento = models.FloatField()
    umbral_envio_gratis = models.FloatField(null=True, blank=True)
    fecha_expiracion = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    # Desde qué subtotal vale (vacío = cualquier compra); uno automático lo exige (domain/promociones.py)
    monto_minimo = models.PositiveIntegerField(null=True, blank=True)
    # Se aplica solo, sin escribir el código, a toda compra desde monto_minimo
    automatica = models.BooleanField(default=False)
    # Cuántas compras pueden usarlo (vacío = sin límite) y cuántas lo usaron; el checkout suma el uso de forma
    # atómica (reservar_uso_promocion), así dos compras simultáneas no se pasan del límite
    usos_maximos = models.PositiveIntegerField(null=True, blank=True)
    usos = models.PositiveIntegerField(default=0)

    @property
    def esta_vigente(self) -> bool:
        from django.utils import timezone
        if not self.is_active:
            return False
        if self.fecha_expiracion and self.fecha_expiracion < timezone.now():
            return False
        if self.usos_maximos is not None and self.usos >= self.usos_maximos:
            return False
        return True

    def __str__(self):
        estado = "Activa" if self.esta_vigente else "Inactiva/Expirada"
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
    # Compra como empresa: razón social, RUT, giro, dirección y correo para la factura, tal como venían al
    # comprar (domain/empresa.py). Vacío si compra una persona
    datos_empresa = models.JSONField(null=True, blank=True)
    # Quién recibe o retira el pedido (RF-02.3); la orden de transporte usa estos datos
    nombre_destinatario = models.CharField(max_length=120, blank=True, default='')
    # Normalizado como +56XXXXXXXXX (normalizar_telefono_chile)
    telefono_destinatario = models.CharField(max_length=15, blank=True, default='')

    id_transaccion_pasarela = models.CharField(max_length=255, blank=True, null=True)
    proveedor_logistico = models.CharField(max_length=100, blank=True, null=True)
    numero_seguimiento_tracking = models.CharField(max_length=100, blank=True, null=True)
    # Peso y medidas cotizados en el checkout; la orden de transporte usa los mismos
    paquete = models.JSONField(null=True, blank=True)
    # Último error del transportista al generar la OT (vacío si se generó o no aplica)
    error_orden_transporte = models.CharField(max_length=255, blank=True, default='')

    subtotal = models.FloatField()
    costo_envio = models.FloatField()
    total_final = models.FloatField()

    # El admin debe revisar la orden (ej. pago confirmado sin stock); el estado no cambia
    requiere_revision = models.BooleanField(default=False)
    motivo_revision = models.CharField(max_length=255, blank=True, default='')
    motivo_cancelacion = models.CharField(max_length=255, blank=True, default='')
    # Al cancelar solo se repone el stock que realmente se descontó
    stock_descontado = models.BooleanField(default=False)
    # Transferencia: plazo de pago que tenía la tienda al crear la orden (domain/ventas.py: plazo_pago); un
    # cambio de plazo posterior no lo altera. Vacíos en los demás medios de pago
    fecha_limite_pago = models.DateTimeField(null=True, blank=True)
    fecha_recordatorio_pago = models.DateTimeField(null=True, blank=True)
    # Transferencia: ya se le recordó al comprador el pago, a la mitad del plazo (se envía una sola vez)
    recordatorio_pago_enviado = models.BooleanField(default=False)
    # Cuándo pasó a Entregado; desde ahí corre el plazo para dejar la reseña. Vacío en los entregados antes de
    # que se registrara
    fecha_entrega = models.DateTimeField(null=True, blank=True)
    # Cuándo pasó a Pagado (pago en línea confirmado o transferencia validada): el dashboard cuenta las ventas por
    # esta fecha. En los pagados antes de que se registrara se rellenó con la de creación
    fecha_pago = models.DateTimeField(null=True, blank=True)
    # Folios que la tienda anota de los documentos que emitió por su cuenta (domain/documentos_tributarios.py):
    # la boleta o factura del pedido y, si se canceló después, su nota de crédito
    folio_documento = models.CharField(max_length=10, blank=True, default='')
    folio_nota_credito = models.CharField(max_length=10, blank=True, default='')

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
    # HTML del editor, ya limpio (html_seguro.limpiar_html) al guardarse
    contenido = models.TextField()
    # RF-03.5: solo las publicadas aparecen en el footer y son visibles al público
    publicada = models.BooleanField(default=False)
    ultima_actualizacion = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_tipo_pagina_display()} - {self.titulo}"


class Publicacion(models.Model):
    """Entrada del blog o portafolio de la tienda (domain/blog.py, application/blog.py)."""

    ESTADOS = [(EstadoPublicacion.BORRADOR.value, 'Borrador'), (EstadoPublicacion.PUBLICADA.value, 'Publicada')]

    titulo = models.CharField(max_length=LARGO_TITULO)
    # Con espacio para el sufijo de los títulos repetidos (-2, -3...)
    slug = models.SlugField(max_length=LARGO_SLUG + 10, unique=True)
    resumen = models.CharField(max_length=LARGO_RESUMEN, blank=True, default='')
    # HTML del editor, ya limpio (html_seguro.limpiar_html) al guardarse
    contenido = models.TextField(blank=True, default='')
    portada = models.ImageField(upload_to='blog/portadas/', blank=True, null=True)
    estado = models.CharField(max_length=20, choices=ESTADOS, default=EstadoPublicacion.BORRADOR.value)
    # Se fija la primera vez que se publica y ordena el blog; None si nunca salió de borrador
    fecha_publicacion = models.DateTimeField(null=True, blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    actualizada = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha_publicacion', '-id']
        indexes = [models.Index(fields=['estado', '-fecha_publicacion'], name='publicacion_estado_fecha')]

    def __str__(self):
        return self.titulo


class FotoPublicacion(models.Model):
    """Foto de la galería de una publicación (hasta MAX_FOTOS_PUBLICACION)."""

    publicacion = models.ForeignKey(Publicacion, on_delete=models.CASCADE, related_name='fotos')
    imagen = models.ImageField(upload_to='blog/fotos/')
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'id']

    def __str__(self):
        return f'Foto {self.orden} de {self.publicacion}'


def _estrellas_validas(prefijo):
    return models.CheckConstraint(
        condition=models.Q(estrellas__gte=ESTRELLAS_MINIMAS, estrellas__lte=ESTRELLAS_MAXIMAS),
        name=f'{prefijo}_estrellas_validas')


class Resena(models.Model):
    """Reseña de un pedido entregado, una por pedido (domain/resenas.py). Solo las aprobadas se publican.

    No se registra en el admin de Django: el admin de la tienda solo aprueba u oculta desde el panel.
    """

    ESTADOS = [(estado.value, etiqueta) for estado, etiqueta in ETIQUETAS_ESTADO_RESENA.items()]

    orden = models.OneToOneField(OrdenCompra, on_delete=models.CASCADE, related_name='resena')
    estado = models.CharField(max_length=20, choices=ESTADOS, default=EstadoResena.PENDIENTE.value)
    # De la tienda (obligatorias)
    estrellas = models.PositiveSmallIntegerField()
    comentario = models.TextField(blank=True, default='')
    nombre_publico = models.CharField(max_length=LARGO_NOMBRE_PUBLICO)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_creacion', '-id']
        indexes = [models.Index(fields=['estado', '-fecha_creacion'], name='resena_estado_fecha')]
        constraints = [_estrellas_validas('resena')]

    def __str__(self):
        return f'Reseña del pedido #{self.orden_id} ({self.estrellas} estrellas)'


class ResenaProducto(models.Model):
    """Calificación de un producto del pedido dentro de una reseña; se aprueba u oculta junto con ella."""

    resena = models.ForeignKey(Resena, on_delete=models.CASCADE, related_name='productos')
    # Id de MongoDB, como DetalleOrden: la reseña no escribe en el catálogo
    producto_mongo_id = models.CharField(max_length=255)
    # Copiado del pedido
    producto_nombre = models.CharField(max_length=255)
    estrellas = models.PositiveSmallIntegerField()
    comentario = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['id']
        indexes = [models.Index(fields=['producto_mongo_id'], name='resena_producto_id')]
        constraints = [
            _estrellas_validas('resena_producto'),
            models.UniqueConstraint(fields=['resena', 'producto_mongo_id'], name='resena_producto_unico'),
        ]

    def __str__(self):
        return f'{self.producto_nombre}: {self.estrellas} estrellas'

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