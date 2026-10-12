from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import redirect
from django.db.models import Q, Sum, Count
from django.db.models.functions import TruncDate

from django.utils import timezone
import logging
import os
import base64
from django.http import HttpResponseRedirect, HttpResponse
from dataclasses import asdict

from ecommerce.application.logistica import ServicioCotizacion
from ecommerce.domain.logistica import ConfiguracionCotizacionInvalida
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor, IsAdministrador
from ecommerce.infrastructure.catalogo.documents import Producto

from .models import ConfiguracionGlobal, OrdenCompra, Carrito, DireccionEnvio, PaginaLegal
from .permissions import CanCheckout
from .payment_services import generar_link_pago
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
    DireccionEnvioSerializer,
    SolicitudCotizacionSerializer,
    AdminOrdenCompraEstadoSerializer,
    PaginaLegalSerializer
)
from .adapters.logistica import ProveedorLogisticoAdapter
from .adapters.transbank_adapter import TransbankWebpayAdapter


class AdminOrdenCompraListView(generics.ListAPIView):
    queryset = OrdenCompra.objects.all().order_by('-fecha_creacion')
    serializer_class = OrdenCompraSerializer
    permission_classes = [IsAdministrador]


class AdminOrdenCompraPatchView(generics.UpdateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = AdminOrdenCompraEstadoSerializer 
    http_method_names = ['patch']
    permission_classes = [IsAdministrador]


logger = logging.getLogger(__name__)


class CarritoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        carrito, created = Carrito.objects.get_or_create(usuario=request.user)
        return Response({"items": carrito.items})

    def post(self, request):
        carrito, created = Carrito.objects.get_or_create(usuario=request.user)
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
        # El detalle de la orden lo guarda el serializer con los precios del catálogo

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
            orden_id_limpio = (tbk_orden or '').replace('ORD-', '')
            if orden_id_limpio:
                try:
                    orden = OrdenCompra.objects.get(id=orden_id_limpio)
                    orden.estado = 'CANCELADO'
                    orden.save()
                    logger.info(f"Orden {orden.id} marcada como CANCELADA por anulación en Transbank.")
                except (OrdenCompra.DoesNotExist, ValueError):
                    orden_id_limpio = ''
            # Página pública: el invitado no tiene acceso a /mis-pedidos
            destino = f"{frontend_url}/pago-cancelado"
            return HttpResponseRedirect(f"{destino}?orden={orden_id_limpio}" if orden_id_limpio else destino)

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
            # Idempotencia (AGENTS.md §4.1): solo la primera confirmación pasa la orden de PENDIENTE a
            # PAGADO; una repetida no vuelve a descontar stock ni a generar la OT.
            if not OrdenCompra.objects.filter(id=orden.id, estado='PENDIENTE').update(estado='PAGADO'):
                logger.info(f"Confirmación repetida de la orden {orden.id} (estado {orden.estado}); se omite.")
                return HttpResponseRedirect(f"{frontend_url}/pago-exitoso?orden={orden.id}")
            orden.estado = 'PAGADO'

            # --- DESCONTAR STOCK EN MONGODB (atómico; revalida el stock al confirmar, RN-03) ---
            try:
                for detalle in orden.detalles.all():
                    exito_stock = Producto.reducir_stock_variante(
                        producto_id=detalle.producto_mongo_id,
                        sku=detalle.variante_sku,
                        cantidad=detalle.cantidad
                    )
                    if not exito_stock:
                        # TODO(PENDIENTE): AGENTS.md §4.1, qué hacer si el pago se confirma sin stock
                        # (¿cancelación y reembolso? ¿pedido en espera?). Por ahora solo queda registrado.
                        logger.error(f"Pago confirmado sin stock para el SKU {detalle.variante_sku} (orden {orden.id})")
            except Exception:
                logger.exception(f"Excepción al intentar descontar stock para orden {orden.id}")
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
                        # El portal de seguimiento (RF-02.4) consulta a Chilexpress con este código
                        orden.numero_seguimiento_tracking = respuesta_chx.get('numero_ot')
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
        if min(peso, alto, ancho, largo) <= 0:
            return Response(
                {"error": "Las dimensiones y el peso deben ser mayores a cero."},
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

        # Comuna sin cobertura → 400; Chilexpress caído o tarifa inválida → 503
        if "error" in resultado:
            codigo = (status.HTTP_503_SERVICE_UNAVAILABLE if resultado.get("tipo") == "proveedor"
                      else status.HTTP_400_BAD_REQUEST)
            return Response({"error": resultado["error"]}, status=codigo)

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
    # Solo el administrador de la tienda puede ver y modificar la configuración
    permission_classes = [IsEmprendedor]

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
        # Un número de orden no numérico recibe la misma respuesta genérica (RF-02.4)
        except (OrdenCompra.DoesNotExist, ValueError):
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

class DashboardMetricasView(APIView):
    """
    Endpoint para el dashboard operativo.
    Retorna métricas de ventas (histórico y mensual),
    ventas históricas agrupadas por día y las 5 órdenes más recientes.

    Permite filtrar los datos mediante:
    ?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    """
    permission_classes = [IsEmprendedor]

    def get(self, request):
        # 1. Capturar parámetros de fecha para filtrado (opcional)
        fecha_inicio = request.query_params.get('fecha_inicio')
        fecha_fin = request.query_params.get('fecha_fin')

        # 2. Base Queryset: solo las órdenes PAGADAS cuentan como ventas
        ordenes_pagadas = OrdenCompra.objects.filter(estado='PAGADO')

        # Aplicar filtros de fecha si vienen en la petición
        if fecha_inicio:
            ordenes_pagadas = ordenes_pagadas.filter(
                fecha_creacion__gte=fecha_inicio
            )

        if fecha_fin:
            ordenes_pagadas = ordenes_pagadas.filter(
                fecha_creacion__lte=f"{fecha_fin} 23:59:59"
            )

        # 3. Calcular total histórico
        total_historico = (
            ordenes_pagadas.aggregate(total=Sum('total_final'))['total'] or 0
        )

        # 4. Calcular ventas del mes actual
        hoy = timezone.now()

        ventas_mes_actual = (
            ordenes_pagadas
            .filter(
                fecha_creacion__year=hoy.year,
                fecha_creacion__month=hoy.month
            )
            .aggregate(total=Sum('total_final'))['total'] or 0
        )

        # 5. Agrupar ventas PAGADAS por día
        historico_ventas = (
            ordenes_pagadas
            .annotate(fecha=TruncDate('fecha_creacion'))
            .values('fecha')
            .annotate(
                ventas=Sum('total_final'),
                pedidos=Count('id')
            )
            .order_by('fecha')
        )

        historico_data = [
            {
                "fecha": registro["fecha"],
                "ventas": float(registro["ventas"] or 0),
                "pedidos": registro["pedidos"]
            }
            for registro in historico_ventas
        ]

        # 6. Obtener las 5 órdenes más recientes.
        # Aquí incluimos todos los estados para mostrar la actividad reciente.
        ultimas_ordenes = (
            OrdenCompra.objects
            .all()
            .order_by('-fecha_creacion')[:5]
        )

        ordenes_data = []

        for orden in ultimas_ordenes:
            # Determinamos el nombre del cliente
            cliente = orden.email_invitado

            if orden.usuario:
                cliente = getattr(
                    orden.usuario,
                    'get_full_name',
                    lambda: orden.usuario.email
                )()

            ordenes_data.append({
                "id": orden.id,
                "fecha_creacion": orden.fecha_creacion,
                "estado": orden.estado,
                "total_final": orden.total_final,
                "cliente": cliente,
                "metodo_pago": orden.metodo_pago
            })

        # 7. Estructurar y retornar la respuesta
        return Response({
            "metricas": {
                "total_historico": float(total_historico),
                "total_mensual": float(ventas_mes_actual)
            },
            "historico": historico_data,
            "ultimas_ordenes": ordenes_data
        }, status=status.HTTP_200_OK)
    
class PaginaLegalListView(generics.ListAPIView):
    queryset = PaginaLegal.objects.all()
    serializer_class = PaginaLegalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []