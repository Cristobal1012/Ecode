from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from dataclasses import asdict
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor
from .models import ConfiguracionGlobal, OrdenCompra, Carrito, DireccionEnvio
from .permissions import CanCheckout
from .payment_services import generar_link_pago
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
    DireccionEnvioSerializer,
)
from .adapters.logistica import ProveedorLogisticoAdapter
from django.db.models import Q


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


class CotizacionEnvioView(APIView):
    """
    Endpoint para cotizar despachos desde el frontend en React.
    Espera un POST con los detalles del paquete y destino.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        datos = request.data
        
        # Validamos que venga al menos el destino
        destino = datos.get('destino')
        if not destino:
            return Response(
                {"error": "El código de comuna de destino es obligatorio."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Extraemos los datos enviados por React y forzamos el tipo de dato numérico
        origen = datos.get('origen', 'SANTIAGO') 
        try:
            peso = float(datos.get('peso', 1.0))
            alto = int(datos.get('alto', 15))
            ancho = int(datos.get('ancho', 15))
            largo = int(datos.get('largo', 15))
        except (ValueError, TypeError):
            return Response(
                {"error": "Las dimensiones y el peso deben ser valores numéricos válidos."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Llamamos al adaptador usando Chilexpress
        resultado = ProveedorLogisticoAdapter.cotizar_envio(
            proveedor="chilexpress",
            origen=origen,
            destino=destino,
            peso_kg=peso,
            alto_cm=alto,
            ancho_cm=ancho,
            largo_cm=largo
        )

        # Si el adaptador capturó un error, devolvemos 400
        if "error" in resultado:
            return Response(resultado, status=status.HTTP_400_BAD_REQUEST)

        return Response(resultado, status=status.HTTP_200_OK)


class ConfiguracionGlobalAPIView(generics.RetrieveAPIView):
    serializer_class = ConfiguracionGlobalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_object(self):
        configuracion = ConfiguracionGlobal.objects.filter(id=1).first()
        if configuracion is None:
            raise NotFound('No existe una configuración de tienda.')
        return configuracion


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
        modo = configuracion.modo_autenticacion if configuracion and configuracion.modo_autenticacion else 'INVITADO'
        
        return Response({
            "modo_autenticacion": modo
        }, status=status.HTTP_200_OK)


class SeguimientoEnvioView(APIView):
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
            orden = OrdenCompra.objects.get(
                Q(id=numero_orden) & (Q(email_invitado=email) | Q(usuario__email=email))
            )
        except OrdenCompra.DoesNotExist:
            return Response(
                {"error": "No se encontró un pedido que coincida con esos datos. Verifica la información."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Se eliminó la referencia a Starken, dejando Chilexpress como fallback logístico
        proveedor = orden.proveedor_logistico if orden.proveedor_logistico else 'chilexpress'
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

class ComunasCoberturaAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        resultado = ProveedorLogisticoAdapter.obtener_comunas_chilexpress()
        
        if isinstance(resultado, dict) and "error" in resultado:
            print("LOG DE ERROR DE CHILEXPRESS:", resultado["error"]) # <--- Agrega esto para verlo en consola
            return Response(resultado, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            
        return Response({"comunas": resultado}, status=status.HTTP_200_OK)

class DireccionEnvioListCreateView(generics.ListCreateAPIView):
    """
    GET: Lista todas las direcciones del usuario autenticado.
    POST: Crea una nueva dirección para el usuario autenticado.
    """
    serializer_class = DireccionEnvioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Retorna solo las direcciones del usuario actual, ordenadas por principal primero
        return DireccionEnvio.objects.filter(usuario=self.request.user).order_by('-es_predeterminado', '-id')

    def perform_create(self, serializer):
        # Asigna automáticamente el usuario autenticado al crear la dirección
        serializer.save(usuario=self.request.user)

class DireccionEnvioDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Obtiene una dirección específica.
    PUT/PATCH: Actualiza una dirección específica (ej. hacerla principal).
    DELETE: Elimina una dirección.
    """
    serializer_class = DireccionEnvioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Seguridad: Un usuario solo puede ver/editar/eliminar SUS propias direcciones
        return DireccionEnvio.objects.filter(usuario=self.request.user)

class SucursalesChilexpressAPIView(APIView):
    """
    GET /api/ventas/logistica/sucursales/?comuna=MAIPU
    Devuelve las sucursales disponibles en una comuna específica.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        comuna = request.query_params.get('comuna')
        if not comuna:
            return Response({"error": "Debe especificar una comuna."}, status=status.HTTP_400_BAD_REQUEST)

        resultado = ProveedorLogisticoAdapter.obtener_sucursales_por_comuna(comuna)
        
        if isinstance(resultado, dict) and "error" in resultado:
            return Response(resultado, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"sucursales": resultado}, status=status.HTTP_200_OK)