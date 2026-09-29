from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor
from .models import ConfiguracionGlobal, OrdenCompra
from .permissions import CanCheckout
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
)
from .adapters.logistica import ProveedorLogisticoAdapter
from django.db.models import Q

class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]


class ConfiguracionGlobalAPIView(generics.RetrieveAPIView):
    serializer_class = ConfiguracionGlobalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_object(self):
        # CAMBIO AQUÍ: Obligamos a que lea el id=1 exacto que modifica el admin
        configuracion = ConfiguracionGlobal.objects.filter(id=1).first()
        if configuracion is None:
            raise NotFound('No existe una configuración de tienda.')
        return configuracion


# Vista del panel de administración (todos los campos: tema, logo, banner, layout, etc.)
class ConfiguracionNegocioView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_object(self):
        obj, _ = ConfiguracionGlobal.objects.get_or_create(id=1)
        return obj

    def get(self, request):
        config = self.get_object()
        serializer = ConfiguracionNegocioSerializer(config)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        config = self.get_object()
        serializer = ConfiguracionNegocioSerializer(config, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)


class DashboardOperativoView(APIView):
    permission_classes = [IsEmprendedor]

    def get(self, request):
        emprendedor_id = request.jwt_payload.get('user_id')
        return Response({
            "mensaje": "bienvenido al panel de Control",
            "emprendedor_id": emprendedor_id
        })

class ReglasCheckoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        configuracion = ConfiguracionGlobal.objects.filter(id=1).first()
        
        # Si la configuración existe y tiene el campo, lo devuelve. Si no, aplica INVITADO por defecto.
        modo = configuracion.modo_autenticacion if configuracion and configuracion.modo_autenticacion else 'INVITADO'
        
        return Response({
            "modo_autenticacion": modo
        }, status=status.HTTP_200_OK)

class SeguimientoEnvioView(APIView):
    #Permiso público: la seguridad radica en conocer el N° de Orden + Correo exacto
    permission_classes = [AllowAny]

    def post(self, request):
        numero_orden = request.data.get('numero_orden')
        email = request.data.get('email')

        if not numero_orden or not email:
            return Response(
                {"error": "El número de orden y el correo son obligatorios para consultar el seguimiento."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Buscamos la orden validando el ID y verificando que el email coincida 
            # ya sea en el campo email_invitado o en el email del usuario registrado
            orden = OrdenCompra.objects.get(
                Q(id=numero_orden) & (Q(email_invitado=email) | Q(usuario__email=email))
            )
        except OrdenCompra.DoesNotExist:
            return Response(
                {"error": "No se encontró un pedido que coincida con esos datos. Verifica la información."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Usamos los nombres exactos definidos en tu models.py
        proveedor = orden.proveedor_logistico if orden.proveedor_logistico else 'starken'
        codigo = orden.numero_seguimiento_tracking

        estado_estandarizado = ProveedorLogisticoAdapter.consultar_estado(proveedor, codigo)

        return Response({
            "numero_orden": orden.id,
            "estado_actual": estado_estandarizado,
            "linea_tiempo_estandar": ["En origen", "En tránsito", "En reparto", "Entregado"],
            "proveedor": proveedor,
            "codigo_seguimiento": codigo
        }, status=status.HTTP_200_OK)