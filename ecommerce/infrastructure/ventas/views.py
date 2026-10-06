from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from dataclasses import asdict
from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import ConfiguracionCotizacionInvalida

from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor
from .models import ConfiguracionGlobal, OrdenCompra, Carrito
from .permissions import CanCheckout
from .payment_services import generar_link_pago
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
    SolicitudCotizacionSerializer,
    AdminOrdenCompraEstadoSerializer,
)
from .adapters.logistica import ProveedorLogisticoAdapter
from django.db.models import Q
from ecommerce.infrastructure.usuarios.permissions import IsAdministrador

class AdminOrdenCompraListView(generics.ListAPIView):
    queryset = OrdenCompra.objects.all().order_by('-fecha_creacion')
    serializer_class = OrdenCompraSerializer
    permission_classes = [IsAdministrador]

class AdminOrdenCompraPatchView(generics.UpdateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = AdminOrdenCompraEstadoSerializer 
    http_method_names = ['patch']
    permission_classes = [IsAdministrador]


class CarritoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Busca el carrito del usuario. Si no existe (usuario nuevo), lo crea vacío
        carrito, created = Carrito.objects.get_or_create(usuario=request.user)
        return Response({"items": carrito.items})

    def post(self, request):
        carrito, created = Carrito.objects.get_or_create(usuario=request.user)
        # Recibe la lista completa desde React y la guarda
        items = request.data.get('items', [])
        carrito.items = items
        carrito.save()
        return Response({"items": carrito.items})


class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        orden = serializer.instance

        try:
            # 1. Obtener las credenciales de la tienda
            config = ConfiguracionGlobal.objects.filter(id=1).first()
            api_keys = config.api_keys_pagos if config and config.api_keys_pagos else {}
            
            # 2. Llamar a la función con todos los argumentos que requiere el revisor
            url_pago = generar_link_pago(
                metodo_pago=orden.metodo_pago,
                monto=orden.total_final,
                orden_id=orden.id,
                api_keys_pagos=api_keys
            )
            
            respuesta_data = serializer.data
            respuesta_data['url_pago'] = url_pago
            respuesta_data['orden_id'] = orden.id
            
            headers = self.get_success_headers(serializer.data)
            return Response(respuesta_data, status=status.HTTP_201_CREATED, headers=headers)
            
        except Exception as e:
            return Response(
                {"error": f"Error al generar pago con la pasarela: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

class HistorialPedidosAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ordenes = OrdenCompra.objects.filter(usuario=request.user).order_by('-fecha_creacion')
        data = []
        for orden in ordenes:
            detalles = [{
                "producto_mongo_id": d.producto_mongo_id,
                "variante_sku": d.variante_sku,
                "nombre_producto": d.nombre_producto_snapshot,
                "precio_unitario": d.precio_unitario_snapshot,
                "cantidad": d.cantidad
            } for d in orden.detalles.all()]

            data.append({
                "id": orden.id,
                "fecha": orden.fecha_creacion,
                "estado": orden.estado,
                "metodo_pago": orden.metodo_pago,
                "subtotal": orden.subtotal,
                "costo_envio": orden.costo_envio,
                "total_final": orden.total_final,
                "direccion": orden.direccion_envio_snapshot,
                "detalles": detalles
            })
            
        return Response(data, status=status.HTTP_200_OK)
