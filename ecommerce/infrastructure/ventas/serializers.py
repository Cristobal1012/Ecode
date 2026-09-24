from rest_framework import serializers
from mongoengine.errors import ValidationError as MongoValidationError
from ecommerce.infrastructure.catalogo.documents import Producto
from .models import ConfiguracionGlobal, OrdenCompra

class ConfiguracionGlobalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfiguracionGlobal
        fields = [
            'texto_bienvenida',
            'texto_boton_ingreso',
            'banner',
            'logo',               
            'favicon',
            'tema_seleccionado',
            'banner',
        ]
#esto sirve basicamente para recibir los datos del frontend y validarlos antes de crear la orden de compra en la base de datos. (cualquier consulta me preguntan, atte. Emilio)
class OrdenCompraSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenCompra
        fields = [
            'email_invitado', 
            'metodo_pago', 
            'direccion_envio_snapshot', 
            'subtotal', 
            'costo_envio', 
            'total_final'
        ]

    def validate(self, data):
        #acá obtenemos el usuario de la petición (request).
        request = self.context.get('request')
        
        #segunda validacion: Logica de comprador invitado.
        if not request.user.is_authenticated:
            #si no hay sesión, el email_invitado es estrictamente obligatorio.
            if not data.get('email_invitado'):
                raise serializers.ValidationError({"email_invitado": "Debe proporcionar un correo electrónico para comprar como invitado."})
        
        return data

    def create(self, validated_data):
        request = self.context.get('request')
        
        #si el usuario está autenticado, se asocia a la orden.
        if request and request.user.is_authenticated:
            validated_data['usuario'] = request.user
            #opcional: limpiar el email_invitado ya que tenemos el usuario real.
            validated_data['email_invitado'] = '' 

        return super().create(validated_data)

class AgregarItemSerializer(serializers.Serializer):
    producto_mongo_id = serializers.CharField(max_length=255)
    variante_sku = serializers.CharField(max_length=255)
    cantidad = serializers.IntegerField(default=1)

    def validate(self, data):
        producto_id = data.get('producto_mongo_id')
        sku = data.get('variante_sku')
        cantidad_solicitada = data.get('cantidad', 1)

        # 1. Buscar el producto usando MongoEngine
        try:
            # objects(id=...) maneja el ObjectId automáticamente
            producto = Producto.objects(id=producto_id).first()
        except MongoValidationError:
            raise serializers.ValidationError(
                {"producto_mongo_id": "El formato del ID del producto no es válido."}
            )

        if not producto:
            raise serializers.ValidationError(
                {"producto_mongo_id": "El producto solicitado no existe en el catálogo."}
            )

        # 2. Filtrar la variante específica dentro del EmbeddedDocumentList
        # MongoEngine permite usar .filter() directamente en la lista embebida
        variante_encontrada = producto.variantes.filter(sku=sku).first()

        if not variante_encontrada:
            raise serializers.ValidationError(
                {"variante_sku": "La variante especificada no existe para este producto."}
            )

        # 3. La validación crucial de STOCK
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