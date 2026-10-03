from decimal import Decimal

from rest_framework import serializers
from rest_framework.exceptions import APIException
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto
from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import (
    ConfiguracionCotizacionInvalida, ErrorCotizacion, Paquete, SolicitudCotizacion,
)
from .models import ConfiguracionGlobal, OrdenCompra


class ConfiguracionGlobalSerializer(serializers.ModelSerializer):
    banner_url = serializers.URLField(required=False, allow_blank=True, default='')
    texto_boton_ingreso = serializers.CharField(max_length=100, required=False)

    class Meta:
        model = ConfiguracionGlobal
        fields = [
            'texto_bienvenida',
            'texto_boton_ingreso',
            'banner_url',
            'tema_seleccionado', 
            'layout_catalogo',
            'modo_autenticacion',
        ]


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


class OrdenCompraSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=0, min_value=Decimal('0'))
    costo_envio = serializers.FloatField(required=False)
    total_final = serializers.FloatField(required=False)
    proveedor_logistico = serializers.ChoiceField(
        choices=['STARKEN', 'CHILEXPRESS', 'RETIRO_LOCAL'], required=False,
    )
    paquete = PaqueteSerializer(write_only=True, required=False)

    class Meta:
        model = OrdenCompra
        fields = [
            'id',
            'fecha_creacion',
            'estado',
            'email_invitado',
            'metodo_pago',
            'direccion_envio_snapshot',
            'subtotal',
            'costo_envio',
            'total_final',
            'proveedor_logistico',
            'paquete',
        ]

    def validate(self, data):
        request = self.context.get('request')
        
        # Logica de comprador invitado: estricto si no esta autenticado
        if not request or not request.user.is_authenticated:
            if not data.get('email_invitado'):
                raise serializers.ValidationError(
                    {"email_invitado": "Debe proporcionar un correo electronico para comprar como invitado."}
                )

        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        logistica = (config.api_keys_logistica or {}) if config else {}
        if logistica.get('proveedor_activo') or (
            isinstance(logistica.get('retiro_en_local'), dict)
            and logistica['retiro_en_local'].get('activo') is True
        ):
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
        
        return data

    def create(self, validated_data):
        request = self.context.get('request')
        paquete_data = validated_data.pop('paquete', None)
        paquete = Paquete(**paquete_data) if paquete_data else None
        proveedor = validated_data.get('proveedor_logistico')
        if proveedor:
            config = ConfiguracionGlobal.objects.filter(pk=1).first()
            service = ServicioCotizacion(config.api_keys_logistica if config else {})
            solicitud = SolicitudCotizacion(
                comuna=(validated_data.get('direccion_envio_snapshot') or {}).get('comuna', ''),
                subtotal=Decimal(str(validated_data['subtotal'])),
                paquete=paquete,
            )
            try:
                quote = service.cotizar(solicitud, proveedor)
            except ConfiguracionCotizacionInvalida as exc:
                raise serializers.ValidationError({'proveedor_logistico': str(exc)}) from exc
            except ErrorCotizacion as exc:
                raise ProveedorLogisticoNoDisponible() from exc
            validated_data['costo_envio'] = float(quote.costo_envio)
            validated_data['total_final'] = float(quote.total_final)
        
        if request and request.user.is_authenticated:
            validated_data['usuario'] = request.user
            validated_data['email_invitado'] = ''

        return super().create(validated_data)


class AgregarItemSerializer(serializers.Serializer):
    producto_mongo_id = serializers.CharField(max_length=255)
    variante_sku = serializers.CharField(max_length=255)
    cantidad = serializers.IntegerField(default=1, min_value=1)

    def validate(self, data):
        producto_id = data.get('producto_mongo_id')
        sku = data.get('variante_sku')
        cantidad_solicitada = data.get('cantidad', 1)

        # 1. Buscar el producto en MongoEngine
        try:
            producto = Producto.objects(id=producto_id).first()
        except MongoValidationError:
            raise serializers.ValidationError(
                {"producto_mongo_id": "El formato del ID del producto no es valido."}
            )

        if not producto:
            raise serializers.ValidationError(
                {"producto_mongo_id": "El producto solicitado no existe en el catalogo."}
            )

        # 2. Filtrar variante especifica
        variante_encontrada = producto.variantes.filter(sku=sku).first()

        if not variante_encontrada:
            raise serializers.ValidationError(
                {"variante_sku": "La variante especificada no existe para este producto."}
            )

        # 3. Validacion de stock
        stock_disponible = variante_encontrada.stock

        if stock_disponible <= 0:
            raise serializers.ValidationError(
                {"stock": "Esta variante se encuentra agotada y no puede agregarse al carrito."}
            )

        if cantidad_solicitada > stock_disponible:
            raise serializers.ValidationError(
                {"cantidad": f"Stock insuficiente. Solo quedan {stock_disponible} unidades disponibles."}
            )

        return data
