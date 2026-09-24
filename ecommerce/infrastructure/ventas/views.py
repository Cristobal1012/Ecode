from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser, FormParser
from .models import OrdenCompra
from .permissions import CanCheckout
from .serializers import OrdenCompraSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor
from .models import ConfiguracionGlobal
from .serializers import ConfiguracionGlobalSerializer
class CheckoutAPIView(APIView):
    def post(self, request):
        return Response({"mensaje": "Módulo de checkout en construcción"})

# Create your views here.
class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]
#esta es la vista para los emprendedores que quieran su dashboar, osea su panel de cotrol
class DashboardOperativoView(APIView):
    permission_classes = [IsEmprendedor]

    def get(self, request):
        emprendedor_id = request.jwt_payload.get('user_id')
        return Response({
            "mensaje": "bienvendo al panel de Control",
            "emprendedor_id": emprendedor_id
        })

class ConfiguracionNegocioView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def get_object(self):
        obj, created = ConfiguracionGlobal.objects.get_or_create(id=1)
        return obj

    def get(self, request):
        config = self.get_object()
        serializer = ConfiguracionGlobalSerializer(config)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        config = self.get_object()
        serializer = ConfiguracionGlobalSerializer(config, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)