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


class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]


# Vista pública que exige el test del CI (solo 3 campos de Landing Page y 404 si está vacía)
class ConfiguracionGlobalAPIView(generics.RetrieveAPIView):
    serializer_class = ConfiguracionGlobalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_object(self):
        configuracion = ConfiguracionGlobal.objects.order_by('pk').first()
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