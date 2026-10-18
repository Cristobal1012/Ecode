from decimal import Decimal
import uuid

from django.conf import settings
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import APIException
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto
from .models import Promocion

# Mantenemos las importaciones por si se usan en otra parte, pero ya no usamos ServicioCotizacion aquí
from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import (
    PROVEEDORES_CON_ORDEN_TRANSPORTE, ConfiguracionCotizacionInvalida, ErrorCotizacion, Paquete,
    SolicitudCotizacion,
)
from ecommerce.application.medios_pago import MediosPagoDisponibles
from ecommerce.application.ventas import PrepararPedido, RevisarCarrito
from ecommerce.domain.medios_pago import MedioPagoNoDisponible
from ecommerce.domain.ventas import (
    ErrorPedido, EventoPedido, ItemSolicitado, OrdenTransporteNoPermitida, SubtotalDesactualizado,
    TelefonoInvalido, normalizar_telefono_chile,
    paginas_legales_faltantes, transiciones_desde, validar_generacion_orden_transporte,
)
from ecommerce.infrastructure.catalogo.repositorio_variantes import MongoCatalogoVariantes

from .models import ConfiguracionGlobal, DetalleOrden, OrdenCompra, DireccionEnvio, Promocion
from .models import ConfiguracionGlobal, OrdenCompra, DireccionEnvio, PaginaLegal
from .adapters.correo import CorreoNotificadorPedidos
from .adapters.transbank_adapter import TransbankWebpayAdapter
from .html_seguro import limpiar_html, tiene_texto
from .repositorio_medios_pago import DjangoRepositorioMediosPago
# NUEVO IMPORT: Nuestro adaptador real de logística para Chilexpress
from .adapters.logistica import ProveedorLogisticoAdapter
from .payment_services import ErrorPasarelaPago, MercadoPagoAdapter

def medios_pago():
    """RN-02: medios habilitados y configurados por el admin (las pruebas pueden reemplazarlo)."""
    return MediosPagoDisponibles(DjangoRepositorioMediosPago())


class ConfiguracionGlobalSerializer(serializers.ModelSerializer):
    banner_url = serializers.URLField(required=False, allow_blank=True, default='')
    texto_boton_ingreso = serializers.CharField(max_length=100, required=False)
    pasarelas_activas = serializers.SerializerMethodField()
    # RN-04: el frontend muestra el botón de Google solo si viene informado (es público por diseño)
    google_client_id = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracionGlobal
        fields = [
            'google_client_id',
            'texto_bienvenida',
            'texto_boton_ingreso',
            'banner_url',
            'tema_seleccionado', 
            'layout_catalogo',
            'pasarelas_activas',
            'google_analytics_id',
            'meta_pixel_id',
            'modo_autenticacion',
            'comuna_origen',
            'region_origen',
            'calle_origen',
            'numero_origen',
            'dpto_casa_origen',
            'retiro_en_local_activo',
        ]

    def get_google_client_id(self, obj):
        return settings.GOOGLE_CLIENT_ID

    def get_pasarelas_activas(self, obj):
        # RN-02: solo los medios habilitados y con sus datos completos; nunca sus credenciales
        return [codigo.value for codigo in medios_pago().disponibles()]

class ConfiguracionNegocioSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionGlobal
        fields = [
            'texto_bienvenida',
            'texto_boton_ingreso',
            'banner_url',
            'tema_seleccionado',
            'logo',
            'favicon',
            'banner',
            'layout_catalogo',
            'google_analytics_id',
            'meta_pixel_id',
            'modo_autenticacion',
            'comuna_origen',
            'region_origen',
            'calle_origen',
            'numero_origen',
            'dpto_casa_origen',
            'retiro_en_local_activo',
        ]


class PaqueteSerializer(serializers.Serializer):
    peso_kg = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'))
    alto_cm = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'))
    ancho_cm = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'))
    largo_cm = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal('0.01'))


class ProveedorLogisticoNoDisponible(APIException):
    status_code = 503
    default_detail = 'El proveedor logístico no está disponible. Intente nuevamente.'


class SolicitudCotizacionSerializer(serializers.Serializer):
    comuna = serializers.CharField(max_length=100, allow_blank=True, required=False, default='')
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal('0'))
    paquete = PaqueteSerializer(required=False)

    def to_domain(self):
        data = self.validated_data
        return SolicitudCotizacion(
            comuna=data['comuna'], subtotal=data['subtotal'],
            paquete=Paquete(**data['paquete']) if 'paquete' in data else None,
        )


def catalogo_variantes():
    """Adaptador del catálogo que usa el checkout; las pruebas lo reemplazan por uno falso."""
    return MongoCatalogoVariantes()


def notificador_pedidos():
    return CorreoNotificadorPedidos()


class ItemPedidoSerializer(serializers.Serializer):
    # El nombre y el precio que envía el navegador se ignoran: se toman del catálogo
    producto_mongo_id = serializers.CharField(max_length=255)
    variante_sku = serializers.CharField(max_length=255)
    cantidad = serializers.IntegerField(min_value=1)


class RevisionCarritoSerializer(serializers.Serializer):
    """Entrada de `POST carrito/validar/`; `revisar()` compara el carrito con el catálogo vigente."""

    items = ItemPedidoSerializer(many=True, max_length=100)

    def revisar(self):
        items = [ItemSolicitado(i['producto_mongo_id'], i['variante_sku'], i['cantidad'])
                 for i in self.validated_data['items']]
        lineas = RevisarCarrito(catalogo_variantes()).ejecutar(items)
        return {
            'valido': all(linea.problema is None for linea in lineas),
            'items': [{
                'producto_mongo_id': linea.producto_id,
                'variante_sku': linea.sku,
                'cantidad': linea.cantidad,
                'disponible': linea.disponible,
                'nombre': linea.nombre,
                'precio': None if linea.precio is None else str(linea.precio),
                'problema': linea.problema,
                'mensaje': linea.mensaje,
            } for linea in lineas],
        }


class OrdenCompraSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal('0'))
    # Los calcula el servidor (cotización + subtotal del catálogo); lo que envíe el navegador se ignora
    costo_envio = serializers.FloatField(read_only=True)
    total_final = serializers.FloatField(read_only=True)
    proveedor_logistico = serializers.ChoiceField(
        choices=['STARKEN', 'CHILEXPRESS', 'RETIRO_LOCAL'], required=False,
    )
    paquete = PaqueteSerializer(write_only=True, required=False)
    # RF-04.4: aceptación de Términos y Condiciones y Política de Privacidad
    acepta_terminos = serializers.BooleanField(write_only=True)
    items = ItemPedidoSerializer(many=True, write_only=True)
    codigo_promocion = serializers.CharField(max_length=50, required=False, allow_blank=True, allow_null=True, write_only=True)
    email_cliente = serializers.SerializerMethodField()
    # RF-02.3: quién recibe o retira; Chilexpress y la tienda lo necesitan para entregar
    nombre_destinatario = serializers.CharField(max_length=120)
    telefono_destinatario = serializers.CharField(max_length=30)

    class Meta:
        model = OrdenCompra
        fields = [
            'id',
            'fecha_creacion',
            'estado',
            'email_invitado',
            'email_cliente',
            'metodo_pago',
            'direccion_envio_snapshot',
            'nombre_destinatario',
            'telefono_destinatario',
            'subtotal',
            'costo_envio',
            'total_final',
            'paquete',
            'id_transaccion_pasarela',
            'proveedor_logistico',
            'acepta_terminos',
            'items',
            'codigo_promocion',
        ]

    def validate_acepta_terminos(self, value):
        if value is not True:
            raise serializers.ValidationError(
                'Debes aceptar los Términos y Condiciones y la Política de Privacidad.'
            )
        return value

    def validate_telefono_destinatario(self, value):
        try:
            return normalizar_telefono_chile(value)
        except TelefonoInvalido as error:
            raise serializers.ValidationError(str(error))
    def get_email_cliente(self, obj):
        if obj.email_invitado:
            return obj.email_invitado
        if obj.usuario and obj.usuario.email:
            return obj.usuario.email
        return None   
    

    def validate(self, data):
        # RF-04.4: el comprador acepta páginas que debe poder leer (en desarrollo no se exige)
        if settings.EXIGIR_PAGINAS_LEGALES:
            faltantes = paginas_legales_faltantes(
                PaginaLegal.objects.filter(publicada=True).values_list('tipo_pagina', flat=True))
            if faltantes:
                nombres = dict(PaginaLegal.TIPOS_PAGINA)
                raise serializers.ValidationError({'acepta_terminos': (
                    'No es posible comprar todavía: la tienda aún no publica '
                    f"{' ni '.join(nombres[tipo] for tipo in faltantes)}."
                )})

        # RN-02: el backend rechaza un medio que el admin no habilitó o no terminó de configurar
        try:
            medios_pago().exigir(data.get('metodo_pago'))
        except MedioPagoNoDisponible as error:
            raise serializers.ValidationError({'metodo_pago': str(error)})

        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            if not data.get('email_invitado'):
                raise serializers.ValidationError(
                    {"email_invitado": "Debe proporcionar un correo electronico para comprar como invitado."}
                )

        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        
        # Validamos usando el campo del modelo en lugar de buscar en el antiguo JSON
        retiro_activo = config.retiro_en_local_activo if config else False
        proveedor = data.get('proveedor_logistico')

        # Toda orden necesita una entrega que el servidor pueda costear (RF-02.3)
        if not proveedor:
            raise serializers.ValidationError({
                'proveedor_logistico': 'Seleccione una opción de entrega cotizada.'
            })

        if proveedor == 'RETIRO_LOCAL':
            if not retiro_activo:
                raise serializers.ValidationError({
                    'proveedor_logistico': 'El retiro en local no está habilitado en esta tienda.'
                })
        else:
            direccion = data.get('direccion_envio_snapshot') or {}
            if not isinstance(direccion, dict) or not direccion.get('comuna'):
                raise serializers.ValidationError({
                    'direccion_envio_snapshot': 'Se requiere la comuna de destino.'
                })
            if 'paquete' not in data:
                raise serializers.ValidationError({'paquete': 'Se requiere peso y dimensiones.'})

        # RN-03: stock por variante y precios del catálogo, no los del navegador
        items = [ItemSolicitado(i['producto_mongo_id'], i['variante_sku'], i['cantidad'])
                 for i in data['items']]
        try:
            self._pedido = PrepararPedido(catalogo_variantes()).ejecutar(items, data['subtotal'])
        except SubtotalDesactualizado as error:
            raise serializers.ValidationError({
                'subtotal': str(error),
                'precios_vigentes': [
                    {'producto_mongo_id': l.producto_id, 'variante_sku': l.sku,
                     'nombre': l.nombre, 'precio': str(l.precio_unitario)}
                    for l in error.lineas
                ],
            })
        except ErrorPedido as error:
            raise serializers.ValidationError({'items': str(error)})

        return data

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get('request')
        validated_data.pop('acepta_terminos')
        validated_data.pop('items')
        codigo_promo = validated_data.pop('codigo_promocion', None)
        paquete_data = validated_data.pop('paquete', None)
        paquete = Paquete(**paquete_data) if paquete_data else None
        proveedor = validated_data.get('proveedor_logistico')
        
        # 1. COTIZACIÓN REAL O RETIRO LOCAL (validate ya exige comuna y paquete para un courier)
        if proveedor == 'RETIRO_LOCAL':
            costo_envio = 0.0
        else:
            config = ConfiguracionGlobal.objects.filter(pk=1).first()
            origen = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
            destino = validated_data['direccion_envio_snapshot']['comuna']

            # REEMPLAZO: Usamos la API de Chilexpress real a través de nuestro Adapter
            resultado = ProveedorLogisticoAdapter.cotizar_envio(
                proveedor=proveedor.lower(),
                origen=origen,
                destino=destino,
                peso_kg=float(paquete.peso_kg),
                alto_cm=int(paquete.alto_cm),
                ancho_cm=int(paquete.ancho_cm),
                largo_cm=int(paquete.largo_cm)
            )

            if "error" in resultado:
                if resultado.get("tipo") == "proveedor":
                    raise ProveedorLogisticoNoDisponible()
                raise serializers.ValidationError({'proveedor_logistico': resultado["error"]})
            costo_envio = float(resultado['precio'])

        # APLICAR PROMOCION Y VALIDAR EL CUPON
        subtotal_num = float(validated_data['subtotal'])
        descuento = 0.0
        promo_aplicada = None

        if codigo_promo:
            promo = Promocion.objects.filter(
                codigo__iexact=codigo_promo.strip(), is_active=True
            ).first()
            if not promo or not promo.esta_vigente:
                raise serializers.ValidationError({
                    'codigo_promocion': 'El cupón ingresado no es válido o ya expiró.'
                })

            if promo.tipo_descuento == 'PORCENTAJE':
                descuento = subtotal_num * (float(promo.valor_descuento) / 100.0)
            else:
                descuento = float(promo.valor_descuento)
            descuento = min(descuento, subtotal_num)
            descuento = max(0.0, descuento)

            if promo.umbral_envio_gratis and subtotal_num >= float(promo.umbral_envio_gratis):
                costo_envio = 0.0

            promo_aplicada = promo

        # El total siempre lo calcula el servidor: (subtotal - descuento) + envío cotizado
        validated_data['costo_envio'] = costo_envio
        validated_data['total_final'] = max(0.0, (subtotal_num - descuento) + costo_envio)
        # La orden de transporte se genera con el mismo paquete que se cotizó
        validated_data['paquete'] = (
            {campo: str(valor) for campo, valor in paquete_data.items()} if paquete_data else None)
        
        # 2. ASIGNAR USUARIO
        if request and request.user.is_authenticated:
            validated_data['usuario'] = request.user
            validated_data['email_invitado'] = ''
            
        # 3. CREAR LA ORDEN EN BASE DE DATOS
        orden = super().create(validated_data)
        DetalleOrden.objects.bulk_create([
            DetalleOrden(
                orden=orden, producto_mongo_id=linea.producto_id, variante_sku=linea.sku,
                nombre_producto_snapshot=linea.nombre,
                precio_unitario_snapshot=float(linea.precio_unitario), cantidad=linea.cantidad,
            )
            for linea in self._pedido.lineas
        ])

        # 4. INTEGRACIÓN CON PASARELAS DE PAGO
        metodo_pago = validated_data.get('metodo_pago')
        url_pago = None
        
        if metodo_pago == 'TRANSBANK':
            if request:
                host = request.get_host()
                scheme = request.scheme
                return_url = f"{scheme}://{host}/api/ventas/transbank/retorno/"
            else:
                return_url = "http://localhost:8000/api/ventas/transbank/retorno/"
                
            session_id = str(uuid.uuid4())
            
            respuesta_tbk = TransbankWebpayAdapter.iniciar_transaccion(
                orden_id=str(orden.id),
                monto=orden.total_final,
                return_url=return_url,
                session_id=session_id
            )
            
            if respuesta_tbk.get('exito'):
                url_pago = f"{respuesta_tbk['url_pago']}?token_ws={respuesta_tbk['token']}"
                orden.id_transaccion_pasarela = respuesta_tbk['token']
                orden.save()
            else:
                orden.delete()
                raise serializers.ValidationError({
                    "metodo_pago": f"No se pudo iniciar el pago con Transbank: {respuesta_tbk.get('error')}"
                })

        elif metodo_pago == 'MERCADO_PAGO':
            if request:
                host = request.get_host()
                scheme = request.scheme
                base_retorno = f"{scheme}://{host}/api/ventas/mercadopago/retorno/"
                webhook_url = f"{scheme}://{host}/api/ventas/mercadopago/webhook/"
            else:
                base_retorno = "http://localhost:8000/api/ventas/mercadopago/retorno/"
                webhook_url = "http://localhost:8000/api/ventas/mercadopago/webhook/"

            # Mercado Pago rechaza notification_url si es localhost; solo la enviamos si es una URL pública
            notification_url = (
                webhook_url
                if "localhost" not in webhook_url and "127.0.0.1" not in webhook_url
                else ""
            )

            back_urls = {
                "success": f"{base_retorno}?resultado=success&orden={orden.id}",
                "failure": f"{base_retorno}?resultado=failure&orden={orden.id}",
                "pending": f"{base_retorno}?resultado=pending&orden={orden.id}",
            }

            try:
                preferencia = MercadoPagoAdapter().crear_preferencia(
                    orden_id=str(orden.id),
                    monto=orden.total_final,
                    back_urls=back_urls,
                    notification_url=notification_url,
                )
                url_pago = preferencia.url_pago
                orden.id_transaccion_pasarela = preferencia.preference_id
                orden.save()
            except ErrorPasarelaPago as exc:
                orden.delete()
                raise serializers.ValidationError({
                    "metodo_pago": f"No se pudo iniciar el pago con Mercado Pago: {exc}"
                })

        # Desactivamos el cupón solo después de que la orden y la pasarela se iniciaron exitosamente
        if promo_aplicada:
            promo_aplicada.is_active = False
            promo_aplicada.save()

        # RF-04.2: resumen de la compra al comprador (si Transbank falló, la orden ya se borró arriba)
        notificador_pedidos().notificar(orden.id, EventoPedido.RECIBIDO)

        # Almacenamos temporalmente la URL para que la vista de Checkout se la pase a React
        orden.url_pago = url_pago
        return orden
        
class AgregarItemSerializer(serializers.Serializer):
    producto_mongo_id = serializers.CharField(max_length=255)
    variante_sku = serializers.CharField(max_length=255)
    cantidad = serializers.IntegerField(default=1, min_value=1)

    def validate(self, data):
        producto_id = data.get('producto_mongo_id')
        sku = data.get('variante_sku')
        cantidad_solicitada = data.get('cantidad', 1)

        try:
            producto = Producto.objects(id=producto_id).first()
        except MongoValidationError:
            raise serializers.ValidationError({"producto_mongo_id": "El formato del ID del producto no es valido."})

        if not producto:
            raise serializers.ValidationError({"producto_mongo_id": "El producto solicitado no existe en el catalogo."})

        variante_encontrada = producto.variantes.filter(sku=sku).first()
        if not variante_encontrada:
            raise serializers.ValidationError({"variante_sku": "La variante especificada no existe para este producto."})

        stock_disponible = variante_encontrada.stock
        if stock_disponible <= 0:
            raise serializers.ValidationError({"stock": "Esta variante se encuentra agotada y no puede agregarse al carrito."})
        if cantidad_solicitada > stock_disponible:
            raise serializers.ValidationError({"cantidad": f"Stock insuficiente. Solo quedan {stock_disponible} unidades disponibles."})

        return data
class AdminOrdenCompraEstadoSerializer(serializers.Serializer):
    # Solo valida la entrada; las transiciones las decide CambiarEstadoPedido
    estado = serializers.ChoiceField(choices=OrdenCompra.ESTADOS_PEDIDO)


class AdminOrdenCompraSerializer(serializers.ModelSerializer):
    """Listado del panel (RF-03.3): incluye la revisión pendiente y las transiciones permitidas."""

    email_cliente = serializers.SerializerMethodField()
    transiciones_permitidas = serializers.SerializerMethodField()
    puede_generar_orden_transporte = serializers.SerializerMethodField()

    get_email_cliente = OrdenCompraSerializer.get_email_cliente

    class Meta:
        model = OrdenCompra
        fields = [
            'id', 'fecha_creacion', 'estado', 'email_invitado', 'email_cliente', 'metodo_pago',
            'nombre_destinatario', 'telefono_destinatario',
            'total_final', 'proveedor_logistico', 'requiere_revision', 'motivo_revision',
            'motivo_cancelacion', 'transiciones_permitidas', 'numero_seguimiento_tracking',
            'error_orden_transporte', 'puede_generar_orden_transporte',
        ]
        read_only_fields = fields

    def get_transiciones_permitidas(self, obj):
        return [estado.value for estado in transiciones_desde(obj.estado)]

    def get_puede_generar_orden_transporte(self, obj):
        """Muestra el botón del panel solo si el backend aceptaría generar la OT."""
        if obj.proveedor_logistico not in PROVEEDORES_CON_ORDEN_TRANSPORTE or obj.numero_seguimiento_tracking:
            return False
        try:
            validar_generacion_orden_transporte(obj.estado, obj.requiere_revision)
        except OrdenTransporteNoPermitida:
            return False
        return True


class DireccionEnvioSerializer(serializers.ModelSerializer):
    class Meta:
        model = DireccionEnvio
        fields = [
            'id', 
            'calle', 
            'calle_numero',
            'dpto_casa',
            'comuna', 
            'ciudad', 
            'region', 
            'codigo_postal', 
            'es_predeterminado'
        ]

class PaginaLegalSerializer(serializers.ModelSerializer):
    """Listado público (enlaces del footer): sin el contenido."""

    class Meta:
        model = PaginaLegal
        fields = ['id', 'tipo_pagina', 'titulo', 'ultima_actualizacion']


class PaginaLegalDetalleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaginaLegal
        fields = ['tipo_pagina', 'titulo', 'contenido', 'ultima_actualizacion']


class PaginaLegalAdminSerializer(serializers.ModelSerializer):
    """RF-03.5: el admin redacta, guarda como borrador y publica cada página."""

    class Meta:
        model = PaginaLegal
        fields = ['tipo_pagina', 'titulo', 'contenido', 'publicada', 'ultima_actualizacion']
        read_only_fields = ['tipo_pagina', 'ultima_actualizacion']
        extra_kwargs = {'contenido': {'allow_blank': True}}

    def validate_contenido(self, value):
        # Se muestra tal cual en la tienda: solo queda el formato del editor (XSS)
        return limpiar_html(value)

    def validate(self, data):
        publicada = data.get('publicada', self.instance.publicada if self.instance else False)
        contenido = data.get('contenido', self.instance.contenido if self.instance else '')
        if publicada and not tiene_texto(contenido):
            raise serializers.ValidationError({'contenido': 'No se puede publicar una página sin contenido.'})
        return data

class MedioPagoAdminSerializer(serializers.Serializer):
    """Entrada del panel: las credenciales pueden volver enmascaradas (se conservan) o vacías (se borran)."""

    habilitado = serializers.BooleanField()
    datos = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=500),
                                  required=False, default=dict)


def medio_pago_para_panel(medio):
    """Lo que ve el admin de un medio de pago: nunca una credencial completa."""
    return {
        'codigo': medio.codigo.value,
        'nombre': medio.definicion.nombre,
        'habilitado': medio.habilitado,
        # False: el checkout aún no sabe cobrar con este medio (se pueden cargar sus datos, no se ofrece)
        'integracion_lista': medio.definicion.integracion_lista,
        # Habilitado, con sus datos completos y con la integración lista: se ofrece al comprador
        'disponible': medio.disponible,
        'faltantes': medio.faltantes,
        'campos': [{
            'nombre': campo.nombre,
            'etiqueta': campo.etiqueta,
            'secreto': campo.secreto,
            'opciones': list(campo.opciones),
            'obligatorio': campo.obligatorio,
            # Ej. ['ambiente', 'PRODUCCION']: obligatorio solo con ese valor
            'obligatorio_si': list(campo.obligatorio_si) if campo.obligatorio_si else None,
        } for campo in medio.definicion.campos],
        'datos': medio.datos_visibles(),
    }


class CredencialesChilexpressSerializer(serializers.Serializer):
    """Entrada del panel: una llave que vuelve enmascarada se conserva y una vacía se borra."""

    datos = serializers.DictField(child=serializers.CharField(allow_blank=True, max_length=500))


def chilexpress_para_panel(credenciales):
    """Lo que ve el admin de las llaves de Chilexpress: nunca una llave completa."""
    return {
        'configuradas': credenciales.configuradas,
        'faltantes': credenciales.faltantes,
        'campos': [{'nombre': nombre, 'etiqueta': etiqueta, 'obligatorio': obligatorio}
                   for nombre, etiqueta, obligatorio in credenciales.CAMPOS],
        'datos': credenciales.visibles(),
    }

class PromocionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Promocion
        # fecha_expiracion: el cupón deja de valer desde ese momento (sin fecha no vence)
        fields = ['id', 'codigo', 'tipo_descuento', 'valor_descuento', 'umbral_envio_gratis', 'fecha_expiracion',
                  'is_active']