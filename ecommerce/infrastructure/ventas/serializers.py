from decimal import Decimal
import uuid

from rest_framework import serializers
from rest_framework.exceptions import APIException
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto

# Mantenemos las importaciones por si se usan en otra parte, pero ya no usamos ServicioCotizacion aquí
from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import (
    ConfiguracionCotizacionInvalida, ErrorCotizacion, Paquete, SolicitudCotizacion,
)
from ecommerce.application.ventas import PrepararPedido
from ecommerce.domain.ventas import ErrorPedido, ItemSolicitado, SubtotalDesactualizado
from ecommerce.infrastructure.catalogo.repositorio_variantes import MongoCatalogoVariantes

from .models import ConfiguracionGlobal, DetalleOrden, OrdenCompra, DireccionEnvio
from .models import ConfiguracionGlobal, OrdenCompra, DireccionEnvio, PaginaLegal
from .adapters.transbank_adapter import TransbankWebpayAdapter
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


class OrdenCompraSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal('0'))
    costo_envio = serializers.FloatField(required=False)
    total_final = serializers.FloatField(required=False)
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
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            if not data.get('email_invitado'):
                raise serializers.ValidationError(
                    {"email_invitado": "Debe proporcionar un correo electronico para comprar como invitado."}
                )

        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        
        # Validamos usando el campo del modelo en lugar de buscar en el antiguo JSON
        retiro_activo = config.retiro_en_local_activo if config else False
        logistica = (config.api_keys_logistica or {}) if config else {}
        proveedor_activo = logistica.get('proveedor_activo', False)

        if data.get('proveedor_logistico') == 'RETIRO_LOCAL' and not retiro_activo:
            raise serializers.ValidationError({
                'proveedor_logistico': 'El retiro en local no está habilitado en esta tienda.'
            })

        if proveedor_activo or retiro_activo:
            if not data.get('proveedor_logistico'):
                raise serializers.ValidationError({
                    'proveedor_logistico': 'Seleccione una opción de entrega cotizada.'
                })
            
            if data['proveedor_logistico'] != 'RETIRO_LOCAL':
                direccion = data.get('direccion_envio_snapshot') or {}
                if not isinstance(direccion, dict) or not direccion.get('comuna'):
                    raise serializers.ValidationError({
                        'direccion_envio_snapshot': 'Se requiere la comuna de destino.'
                    })
                if 'paquete' not in data:
                    raise serializers.ValidationError({'paquete': 'Se requiere peso y dimensiones.'})
                    
        elif not data.get('proveedor_logistico'):
            faltantes = [campo for campo in ('costo_envio', 'total_final') if campo not in data]
            if faltantes:
                raise serializers.ValidationError({campo: 'Campo requerido.' for campo in faltantes})

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
        
        # 1. COTIZACIÓN REAL O RETIRO LOCAL
        if proveedor and proveedor != 'RETIRO_LOCAL':
            config = ConfiguracionGlobal.objects.filter(pk=1).first()
            origen = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
            destino = (validated_data.get('direccion_envio_snapshot') or {}).get('comuna', '')
            
            # REEMPLAZO: Usamos la API de Chilexpress real a través de nuestro Adapter
            if paquete and destino:
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
                    
                validated_data['costo_envio'] = float(resultado['precio'])
                validated_data['total_final'] = float(validated_data['subtotal']) + float(resultado['precio'])
            else:
                validated_data['costo_envio'] = float(validated_data.get('costo_envio', 0))
                validated_data['total_final'] = float(validated_data.get('total_final', validated_data['subtotal']))
                
        elif proveedor == 'RETIRO_LOCAL':
            validated_data['costo_envio'] = 0.0
            validated_data['total_final'] = float(validated_data['subtotal'])
        
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
    class Meta:
        model = PaginaLegal
        fields = ['id', 'tipo_pagina', 'titulo', 'contenido', 'ultima_actualizacion']