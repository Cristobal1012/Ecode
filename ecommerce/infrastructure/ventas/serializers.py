from decimal import Decimal
import uuid

from django.conf import settings
from rest_framework import serializers
from rest_framework.exceptions import APIException
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto

# Mantenemos las importaciones por si se usan en otra parte, pero ya no usamos ServicioCotizacion aquí
from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import (
    ConfiguracionCotizacionInvalida, ErrorCotizacion, Paquete, SolicitudCotizacion,
)
from ecommerce.application.ventas import PrepararPedido, RevisarCarrito
from ecommerce.domain.ventas import (
    ErrorPedido, ItemSolicitado, SubtotalDesactualizado, paginas_legales_faltantes, transiciones_desde,
)
from ecommerce.infrastructure.catalogo.repositorio_variantes import MongoCatalogoVariantes

from .models import ConfiguracionGlobal, DetalleOrden, OrdenCompra, DireccionEnvio
from .models import ConfiguracionGlobal, OrdenCompra, DireccionEnvio, PaginaLegal
from .adapters.transbank_adapter import TransbankWebpayAdapter
from .html_seguro import limpiar_html, tiene_texto
# NUEVO IMPORT: Nuestro adaptador real de logística para Chilexpress
from .adapters.logistica import ProveedorLogisticoAdapter

class ConfiguracionGlobalSerializer(serializers.ModelSerializer):
    banner_url = serializers.URLField(required=False, allow_blank=True, default='')
    texto_boton_ingreso = serializers.CharField(max_length=100, required=False)
    pasarelas_activas = serializers.SerializerMethodField()

    class Meta:
        model = ConfiguracionGlobal
        fields = [
            'texto_bienvenida',
            'texto_boton_ingreso',
            'banner_url',
            'tema_seleccionado', 
            'layout_catalogo',
            'pasarelas_activas',
            'modo_autenticacion',
            'comuna_origen',
            'region_origen',
            'calle_origen',
            'numero_origen',
            'dpto_casa_origen',
            'retiro_en_local_activo',
        ]

    def get_pasarelas_activas(self, obj):
        if not obj.api_keys_pagos:
            return []
        return list(obj.api_keys_pagos.keys())

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
    email_cliente = serializers.SerializerMethodField()

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
            'subtotal',
            'costo_envio',
            'total_final',
            'paquete',
            'id_transaccion_pasarela',
            'proveedor_logistico',
            'acepta_terminos',
            'items',
        ]

    def validate_acepta_terminos(self, value):
        if value is not True:
            raise serializers.ValidationError(
                'Debes aceptar los Términos y Condiciones y la Política de Privacidad.'
            )
        return value
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

    def create(self, validated_data):
        request = self.context.get('request')
        validated_data.pop('acepta_terminos')
        validated_data.pop('items')
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

        # El total siempre lo calcula el servidor: subtotal validado contra el catálogo + envío cotizado
        validated_data['costo_envio'] = costo_envio
        validated_data['total_final'] = float(validated_data['subtotal']) + costo_envio
        
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
    # Solo valida la entrada; las transiciones las decide CambiarEstadoPedido (AGENTS.md §9)
    estado = serializers.ChoiceField(choices=OrdenCompra.ESTADOS_PEDIDO)


class AdminOrdenCompraSerializer(serializers.ModelSerializer):
    """Listado del panel (RF-03.3): incluye la revisión pendiente y las transiciones de §9."""

    email_cliente = serializers.SerializerMethodField()
    transiciones_permitidas = serializers.SerializerMethodField()

    get_email_cliente = OrdenCompraSerializer.get_email_cliente

    class Meta:
        model = OrdenCompra
        fields = [
            'id', 'fecha_creacion', 'estado', 'email_invitado', 'email_cliente', 'metodo_pago',
            'total_final', 'proveedor_logistico', 'requiere_revision', 'motivo_revision',
            'motivo_cancelacion', 'transiciones_permitidas',
        ]
        read_only_fields = fields

    def get_transiciones_permitidas(self, obj):
        return [estado.value for estado in transiciones_desde(obj.estado)]


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