from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import redirect
from django.db.models import Q
import logging
from django.http import HttpResponseRedirect, HttpResponse
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
from .adapters.transbank_adapter import TransbankWebpayAdapter
import os
from ecommerce.infrastructure.catalogo.documents import Producto
import base64

logger = logging.getLogger(__name__)

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

        # --- NUEVO: GUARDAR LOS DETALLES DEL CARRITO EN LA ORDEN ---
        # 1. Obtenemos los productos que React nos envió en la petición (como 'items' o 'detalles')
        items_carrito = request.data.get('items') or request.data.get('detalles') or []
        
        # 2. Importamos el modelo de detalles (Ajusta el nombre 'DetalleOrdenCompra' si en tu models.py se llama distinto, por ej. 'DetalleOrden')
        from .models import DetalleOrden 
        
        # 3. Guardamos cada item vinculándolo a la orden que acabamos de crear
        for item in items_carrito:
            DetalleOrden.objects.create(
                orden=orden,
                # Mapeamos las llaves que vienen de React a los campos de tu modelo SQL
                producto_mongo_id=item.get('id') or item.get('producto_mongo_id'),
                variante_sku=item.get('sku') or item.get('variante_sku'),
                nombre_producto_snapshot=item.get('nombre') or item.get('nombre_producto', 'Producto sin nombre'),
                precio_unitario_snapshot=item.get('precio') or item.get('precio_unitario', 0),
                cantidad=item.get('cantidad', 1)
            )
        # -----------------------------------------------------------

        try:
            # Respuesta hacia React
            respuesta_data = serializer.data
            respuesta_data['mensaje'] = "Orden creada con éxito."
            respuesta_data['orden_id'] = orden.id
            
            # Si el serializer generó una URL de Transbank, la inyectamos en la respuesta
            if hasattr(orden, 'url_pago') and orden.url_pago:
                respuesta_data['url_pago'] = orden.url_pago
                respuesta_data['mensaje'] = "Orden creada. Redirigiendo al pago..."
            
            headers = self.get_success_headers(serializer.data)
            return Response(respuesta_data, status=status.HTTP_201_CREATED, headers=headers)
            
        except Exception as e:
            return Response(
                {"error": f"Error al generar pago con la pasarela: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TransbankRetornoView(APIView):
    permission_classes = [AllowAny]  # Permite acceso público desde la redirección externa de Webpay

    def get(self, request):
        # Transbank envía 'token_ws' en pagos normales, o 'TBK_TOKEN' y 'TBK_ORDEN_COMPRA' si el usuario anula
        token = request.GET.get('token_ws') or request.POST.get('token_ws')
        tbk_token = request.GET.get('TBK_TOKEN')
        tbk_orden = request.GET.get('TBK_ORDEN_COMPRA')

        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

        # Manejo de anulación directa por parte del usuario en el portal de Transbank
        if tbk_token and not token:
            if tbk_orden:
                orden_id_limpio = tbk_orden.replace('ORD-', '')
                try:
                    orden = OrdenCompra.objects.get(id=orden_id_limpio)
                    orden.estado = 'CANCELADO'
                    orden.save()
                    logger.info(f"Orden {orden.id} marcada como CANCELADA por anulación en Transbank.")
                except OrdenCompra.DoesNotExist:
                    pass
            return HttpResponseRedirect(f"{frontend_url}/mis-pedidos?pago=cancelado?")

        if not token:
            return Response({"error": "Token no proporcionado"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Confirmar transacción con Transbank
        resultado_tbk = TransbankWebpayAdapter.confirmar_transaccion(token)
        
        if not resultado_tbk.get('exito'):
            return Response({"error": "Error al comunicar con Transbank"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        buy_order = resultado_tbk['data_completa'].get('buy_order', '')
        # Extraer el ID real de la orden (quitando el prefijo 'ORD-')
        orden_id = buy_order.replace('ORD-', '')

        try:
            orden = OrdenCompra.objects.get(id=orden_id)
        except OrdenCompra.DoesNotExist:
            return Response({"error": "Orden no encontrada"}, status=status.HTTP_404_NOT_FOUND)

        if resultado_tbk.get('aprobado'):
            orden.estado = 'PAGADO'
            orden.save()

            # --- NUEVO: DESCONTAR STOCK EN MONGODB ---
            try:
                for detalle in orden.detalles.all():
                    exito_stock = Producto.reducir_stock_variante(
                        producto_id=detalle.producto_mongo_id,
                        sku=detalle.variante_sku,
                        cantidad=detalle.cantidad
                    )
                    if not exito_stock:
                        logger.warning(f"No se pudo descontar stock para el SKU {detalle.variante_sku} (Orden {orden.id})")
            except Exception as e:
                logger.error(f"Excepción al intentar descontar stock para orden {orden.id}: {str(e)}")
            # -----------------------------------------

            # --- 2. GENERACIÓN AUTOMÁTICA DE OT Y ETIQUETA EN CHILEXPRESS ---
            if orden.proveedor_logistico == 'CHILEXPRESS':
                try:
                    config = ConfiguracionGlobal.objects.first()
                    catalogo = ProveedorLogisticoAdapter._obtener_catalogo_dinamico()
                    
                    comuna_origen_nombre = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
                    codigo_origen = catalogo.get(comuna_origen_nombre.upper(), "PUDA")
                    
                    comuna_destino_nombre = orden.direccion_envio_snapshot.get('comuna', '')
                    codigo_destino = catalogo.get(comuna_destino_nombre.upper(), "PROV")

                    datos_envio = {
                        "origen_codigo": codigo_origen,
                        "destino_codigo": codigo_destino,
                        "calle": orden.direccion_envio_snapshot.get('calle', 'SIN CALLE'),
                        "numero": orden.direccion_envio_snapshot.get('numero', '0'),
                        "supplement": orden.direccion_envio_snapshot.get('dpto_casa', ''),
                        "nombre_destinatario": getattr(orden.usuario, 'get_full_name', lambda: 'Cliente E-commerce')() if orden.usuario else 'Cliente Invitado',
                        "telefono": "999999999", 
                        "email": orden.email_invitado or (orden.usuario.email if orden.usuario else 'cliente@correo.cl'),
                        "peso": "1", 
                        "alto": "10",
                        "ancho": "10",
                        "largo": "10",
                        "referencia": f"ORD-{orden.id}",
                        "valor_declarado": int(orden.total_final)
                    }

                    respuesta_chx = ProveedorLogisticoAdapter.generar_orden_transporte(datos_envio)
                    
                    if respuesta_chx.get('exito'):
                        orden.id_transaccion_pasarela = f"{orden.id_transaccion_pasarela} | OT: {respuesta_chx.get('numero_ot')}"
                        orden.save()
                        logger.info(f"Orden de Transporte generada con éxito para la orden {orden.id}: OT #{respuesta_chx.get('numero_ot')}")
                    else:
                        logger.error(f"Fallo al generar OT en Chilexpress para orden {orden.id}: {respuesta_chx.get('error')}")
                except Exception as e:
                    logger.error(f"Excepción al intentar generar la OT automática: {str(e)}")
            # -----------------------------------------------------------------

            return HttpResponseRedirect(f"{frontend_url}/pago-exitoso?orden={orden.id}")
        else:
            orden.estado = 'RECHAZADO'
            orden.save()
            return HttpResponseRedirect(f"{frontend_url}/pago-rechazado?orden={orden.id}")

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
                "detalles": detalles,
                # --- AGREGAR ESTAS DOS LÍNEAS ---
                "id_transaccion_pasarela": orden.id_transaccion_pasarela,
                "proveedor_logistico": orden.proveedor_logistico
            })
            
        return Response(data, status=status.HTTP_200_OK)

class ComunasCoberturaAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        resultado = ProveedorLogisticoAdapter.obtener_comunas_chilexpress()
        
        if isinstance(resultado, dict) and "error" in resultado:
            print("LOG DE ERROR DE CHILEXPRESS:", resultado["error"])
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

class DescargarEtiquetaView(APIView):
    permission_classes = [IsEmprendedor]

    def get(self, orden_id):
        try:
            orden = OrdenCompra.objects.get(id=orden_id)
        except OrdenCompra.DoesNotExist:
            return Response({"error": "Orden no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        if orden.proveedor_logistico != 'CHILEXPRESS' or not orden.id_transaccion_pasarela:
            return Response({"error": "Esta orden no tiene una etiqueta de Chilexpress válida."}, status=status.HTTP_400_BAD_REQUEST)

        # Extraemos el número de OT de la cadena "TOKEN | OT: 123456789"
        try:
            partes = orden.id_transaccion_pasarela.split('OT: ')
            if len(partes) > 1:
                numero_ot = partes[1].strip()
            else:
                return Response({"error": "No se encontró el número de OT."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"error": "Formato de OT inválido."}, status=status.HTTP_400_BAD_REQUEST)

        # Llamamos a nuestro adaptador
        resultado = ProveedorLogisticoAdapter.obtener_etiqueta_chilexpress(numero_ot)

        if resultado.get('exito') and resultado.get('base64'):
            try:
                # Decodificamos el string Base64 a bytes binarios
                pdf_bytes = base64.b64decode(resultado['base64'])
                
                # Preparamos la respuesta HTTP como un archivo PDF
                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="Etiqueta_OT_{numero_ot}.pdf"'
                return response
            except Exception as e:
                return Response({"error": "Error al procesar el archivo PDF."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        else:
            return Response({"error": resultado.get('error', 'Fallo al obtener la etiqueta desde Chilexpress')}, status=status.HTTP_400_BAD_REQUEST)