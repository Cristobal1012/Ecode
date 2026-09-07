from rest_framework import serializers
from .models import OrdenCompra, ConfiguracionGlobal

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
        
        #acá consultamos la configuración global de la tienda (la tabla singleton).
        config = ConfiguracionGlobal.objects.first()

        #primera validacion: Si la tienda exige registro, se bloquean las compras anónimas.
        if config and config.modo_autenticacion == 'REGISTRO_OBLIGATORIO':
            if not request.user.is_authenticated:
                raise serializers.ValidationError("Esta tienda requiere que inicies sesión para comprar.")

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