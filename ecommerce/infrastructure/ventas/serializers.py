from rest_framework import serializers
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto
from .models import ConfiguracionGlobal, OrdenCompra

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
            'pasarelas_activas'
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
        ]

class OrdenCompraSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenCompra
        fields = [
            'email_invitado',
            'metodo_pago',
            'direccion_envio_snapshot',
            'subtotal',
            'costo_envio',
            'total_final',
        ]

    def validate(self, data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            if not data.get('email_invitado'):
                raise serializers.ValidationError(
                    {"email_invitado": "Debe proporcionar un correo electronico para comprar como invitado."}
                )
        return data

    def create(self, validated_data):
        request = self.context.get('request')
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