from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from dataclasses import asdict

from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import ConfiguracionCotizacionInvalida

from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor
from .models import ConfiguracionGlobal, OrdenCompra
from .permissions import CanCheckout
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
    SolicitudCotizacionSerializer,
)


class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]


class CotizacionesAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = SolicitudCotizacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        if config is None:
            raise NotFound('No existe una configuración de tienda.')
        service = ServicioCotizacion(config.api_keys_logistica)
        try:
            opciones, errores = service.opciones(serializer.to_domain())
        except ConfiguracionCotizacionInvalida as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        data = []
        for opcion in opciones:
            item = asdict(opcion)
            item['costo_envio'] = int(opcion.costo_envio)
            item['total_final'] = int(opcion.total_final)
            data.append(item)
        return Response({'opciones': data, 'errores': errores},
                        status=status.HTTP_200_OK if data else status.HTTP_503_SERVICE_UNAVAILABLE)


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
        emprendedor_id = str(request.user.pk)
        return Response({
            "mensaje": "bienvenido al panel de Control",
            "emprendedor_id": emprendedor_id
        })
