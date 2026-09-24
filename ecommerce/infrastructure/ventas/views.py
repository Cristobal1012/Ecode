from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny

from .models import ConfiguracionGlobal, OrdenCompra
from .permissions import CanCheckout
from .serializers import ConfiguracionGlobalSerializer, OrdenCompraSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor

class CheckoutAPIView(APIView):
    def post(self, request):
        return Response({"mensaje": "Módulo de checkout en construcción"})

# Create your views here.
class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]


class ConfiguracionGlobalAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = ConfiguracionGlobalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_object(self):
        configuracion = ConfiguracionGlobal.objects.order_by('pk').first()
        if configuracion is None:
            raise NotFound('No existe una configuración de tienda.')
        return configuracion


#esta es la vista para los emprendedores que quieran su dashboar, osea su panel de cotrol
class DashboardOperativoView(APIView):
    permission_classes = [IsEmprendedor]

    def get(self, request):
        emprendedor_id = request.jwt_payload.get('user_id')
        return Response({
            "mensaje": "bienvendo al panel de Control",
            "emprendedor_id": emprendedor_id
        })