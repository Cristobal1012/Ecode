from django.conf import settings
from django.utils import timezone
from rest_framework import serializers
from .documents import Producto, Variante
from .image_adapters import actualizar_producto
from .images import (
    ReferenciaImagenField,
    es_imagen_gestionada,
    normalizar_referencia_imagen,
)

class VarianteSerializer(serializers.Serializer):
    sku = serializers.CharField()
    precio = serializers.DecimalField(max_digits=10, decimal_places=2)
    stock = serializers.IntegerField(default=0)
    imagen_especifica = ReferenciaImagenField(required=False, allow_blank=True, allow_null=True)
    atributos_variables = serializers.DictField(required=False, default=dict)
    
    # --- NUEVOS CAMPOS LOGÍSTICOS ---
    peso_kg = serializers.FloatField(required=False, default=1.0)
    alto_cm = serializers.IntegerField(required=False, default=10)
    ancho_cm = serializers.IntegerField(required=False, default=10)
    largo_cm = serializers.IntegerField(required=False, default=10)

class ProductoSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    nombre = serializers.CharField(max_length=255)
    descripcion = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    meta_titulo = serializers.CharField(max_length=60, required=False, allow_blank=True, allow_null=True)
    meta_descripcion = serializers.CharField(max_length=160, required=False, allow_blank=True, allow_null=True)
    categoria = serializers.CharField()
    imagenes = serializers.ListField(child=ReferenciaImagenField(), required=False)
    
    fecha_creacion = serializers.DateTimeField(read_only=True)
    
    activo = serializers.BooleanField(default=True)
    publicado = serializers.BooleanField(default=False)
    atributos_globales = serializers.DictField(required=False, default=dict)
    
    variantes = VarianteSerializer(many=True, required=False)

    def validate(self, attrs):
        request = self.context.get('request')
        if 'imagenes' in attrs:
            if len(attrs['imagenes']) > settings.CATALOGO_IMAGEN_MAX_GALERIA:
                raise serializers.ValidationError({'imagenes': 'Se ha superado el límite de imágenes por producto.'})
            try:
                attrs['imagenes'] = [
                    normalizar_referencia_imagen(valor, self.instance, request)
                    for valor in attrs['imagenes']
                ]
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'imagenes': exc.detail}) from exc
            if len(set(attrs['imagenes'])) != len(attrs['imagenes']):
                raise serializers.ValidationError({'imagenes': 'La galería no puede contener imágenes repetidas.'})
        galeria = attrs.get('imagenes', self.instance.imagenes if self.instance else [])
        for index, variante in enumerate(attrs.get('variantes', [])):
            valor = variante.get('imagen_especifica')
            if not valor:
                continue
            try:
                clave = normalizar_referencia_imagen(valor, self.instance, request)
                if es_imagen_gestionada(clave) and clave not in galeria:
                    raise serializers.ValidationError('La imagen de variante debe pertenecer a la galería.')
                variante['imagen_especifica'] = clave
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({
                    'variantes': {index: {'imagen_especifica': exc.detail}},
                }) from exc
        return attrs

    def create(self, validated_data):
        variantes_data = validated_data.pop('variantes', [])
        
        validated_data['fecha_creacion'] = timezone.now()
        
        producto = Producto(**validated_data)
        
        producto.variantes = [Variante(**v_data) for v_data in variantes_data]
        producto.save()
        return producto

    def update(self, instance, validated_data):
        return actualizar_producto(instance, validated_data)
