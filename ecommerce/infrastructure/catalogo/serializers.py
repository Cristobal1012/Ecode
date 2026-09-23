from rest_framework import serializers
from .documents import Producto, Variante

class VarianteSerializer(serializers.Serializer):
    sku = serializers.CharField()
    precio = serializers.DecimalField(max_digits=10, decimal_places=2)
    stock = serializers.IntegerField(default=0)
    imagen_especifica = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    atributos_variables = serializers.DictField(required=False, default=dict)

class ProductoSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    nombre = serializers.CharField(max_length=255)
    descripcion = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    categoria = serializers.CharField()
    imagenes = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    fecha_creacion = serializers.DateTimeField()
    activo = serializers.BooleanField(default=True)
    atributos_globales = serializers.DictField(required=False, default=dict)
    
    variantes = VarianteSerializer(many=True, required=False)

    def create(self, validated_data):
        variantes_data = validated_data.pop('variantes', [])
        producto = Producto(**validated_data)
        
        producto.variantes = [Variante(**v_data) for v_data in variantes_data]
        producto.save()
        return producto

    def update(self, instance, validated_data):
        variantes_data = validated_data.pop('variantes', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if variantes_data is not None:
            instance.variantes = [Variante(**v_data) for v_data in variantes_data]
            
        instance.save()
        return instance