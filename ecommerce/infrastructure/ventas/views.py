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
from ecommerce.domain.logistica import ConfiguracionCotizacionInvalida, ErrorOrdenTransporte
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor, IsAdministrador
from ecommerce.application.ventas import (
    MOTIVO_PAGO_ANULADO, MOTIVO_PAGO_RECHAZADO, CambiarEstadoPedido, ConfirmarPago,
    GenerarOrdenTransporte, OrdenNoEncontrada, PedidoModificado, ResolverRevision, ResultadoPago,
    SinRevisionPendiente,
)
from ecommerce.application.chilexpress import ConfigurarChilexpress
from ecommerce.application.medios_pago import ConfigurarMedioPago
from ecommerce.domain.logistica import CredencialesChilexpressInvalidas
from ecommerce.domain.medios_pago import CodigoMedioPago, DatosMedioPagoInvalidos
from ecommerce.domain.ventas import OrdenTransporteNoPermitida, TransicionNoPermitida
from ecommerce.infrastructure.catalogo.repositorio_variantes import MongoInventarioVariantes

from .models import ConfiguracionGlobal, OrdenCompra, Carrito, DireccionEnvio, PaginaLegal
from .permissions import CanCheckout
from .payment_services import generar_link_pago
from .serializers import (
    ConfiguracionGlobalSerializer,
    ConfiguracionNegocioSerializer,
    OrdenCompraSerializer,
    RevisionCarritoSerializer,
    DireccionEnvioSerializer,
    SolicitudCotizacionSerializer,
    AdminOrdenCompraEstadoSerializer,
    AdminOrdenCompraSerializer,
    PaginaLegalSerializer,
    PaginaLegalDetalleSerializer,
    PaginaLegalAdminSerializer,
    MedioPagoAdminSerializer,
    CredencialesChilexpressSerializer,
    chilexpress_para_panel,
    medio_pago_para_panel,
    medios_pago,
)
from .adapters.logistica import ProveedorLogisticoAdapter
from .adapters.correo import CorreoNotificadorPedidos
from .adapters.orden_transporte import ChilexpressOrdenTransporte
from .adapters.transbank_adapter import TransbankWebpayAdapter
from .instrucciones_pago import instrucciones_transferencia
from .repositorio_chilexpress import DjangoRepositorioCredencialesChilexpress
from .repositorio_medios_pago import DjangoRepositorioMediosPago
from .repositorio_ordenes import DjangoRepositorioOrdenes


def inventario_variantes():
    return MongoInventarioVariantes()


def generar_orden_transporte():
    return GenerarOrdenTransporte(DjangoRepositorioOrdenes(), ChilexpressOrdenTransporte())


def notificador_pedidos():
    return CorreoNotificadorPedidos()


def confirmar_pago():
    return ConfirmarPago(DjangoRepositorioOrdenes(), inventario_variantes(), generar_orden_transporte(),
                         notificador_pedidos())


def cambiar_estado_pedido():
    return CambiarEstadoPedido(DjangoRepositorioOrdenes(), inventario_variantes(), generar_orden_transporte(),
                               notificador_pedidos())


class AdminOrdenCompraListView(generics.ListAPIView):
    queryset = OrdenCompra.objects.all().order_by('-fecha_creacion')
    serializer_class = AdminOrdenCompraSerializer
    permission_classes = [IsAdministrador]


class AdminResolverRevisionView(APIView):
    """El admin marca como resuelta la revisión de una orden."""
    permission_classes = [IsAdministrador]

    def post(self, request, pk):
        try:
            ResolverRevision(DjangoRepositorioOrdenes()).ejecutar(pk)
        except OrdenNoEncontrada:
            return Response({'detail': 'Orden no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        except SinRevisionPendiente as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        return Response({'id': pk, 'requiere_revision': False})


class AdminOrdenTransporteView(APIView):
    """RF-02.3: el admin genera o reintenta la orden de transporte de un pedido pagado."""
    permission_classes = [IsAdministrador]

    def post(self, request, pk):
        try:
            numero_ot = generar_orden_transporte().reintentar(pk)
        except OrdenNoEncontrada:
            return Response({'detail': 'Orden no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        except OrdenTransporteNoPermitida as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        except ErrorOrdenTransporte as error:
            # El transportista falló: el error ya quedó guardado en la orden
            return Response({'detail': str(error)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({'id': pk, 'numero_seguimiento_tracking': numero_ot})


class AdminOrdenCompraPatchView(APIView):
    """RF-03.3: cambio de estado manual del admin (solo las transiciones permitidas)."""
    permission_classes = [IsAdministrador]

    def patch(self, request, pk):
        serializer = AdminOrdenCompraEstadoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            estado = cambiar_estado_pedido().ejecutar(pk, serializer.validated_data['estado'])
        except OrdenNoEncontrada:
            return Response({'detail': 'Orden no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        except TransicionNoPermitida as error:
            return Response({'estado': [str(error)]}, status=status.HTTP_400_BAD_REQUEST)
        except PedidoModificado as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)

        orden = OrdenCompra.objects.get(id=pk)
        return Response({
            'id': orden.id,
            'estado': estado.value,
            'requiere_revision': orden.requiere_revision,
            'motivo_revision': orden.motivo_revision,
        })


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


class ValidarCarritoView(APIView):
    """RN-03: compara el carrito (también el de invitados, que vive en el navegador) con el stock vigente."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RevisionCarritoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.revisar())


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

            # Transferencia: el comprador ve a qué cuenta transferir en /pedido-recibido
            instrucciones = instrucciones_transferencia(orden)
            if instrucciones:
                respuesta_data['instrucciones_pago'] = instrucciones

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

        # Anulación del comprador en el portal de Transbank
        if tbk_token and not token:
            orden_id_limpio = (tbk_orden or '').replace('ORD-', '')
            if confirmar_pago().rechazar(orden_id_limpio, MOTIVO_PAGO_ANULADO):
                logger.info(f"Orden {orden_id_limpio} cancelada por anulación en Transbank.")
            else:
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
        except (OrdenCompra.DoesNotExist, ValueError):
            return Response({"error": "Orden no encontrada"}, status=status.HTTP_404_NOT_FOUND)

        caso = confirmar_pago()
        if not resultado_tbk.get('aprobado'):
            caso.rechazar(orden.id, MOTIVO_PAGO_RECHAZADO)
            return HttpResponseRedirect(f"{frontend_url}/pago-rechazado?orden={orden.id}")

        # 2. Estado y stock de la orden (idempotente, stock todo o nada)
        try:
            resultado = caso.aprobar(orden.id)
        except Exception:
            # El pago ya está aprobado: la orden quedó marcada para revisión del admin
            logger.exception(f"Error al descontar stock de la orden {orden.id}")
            resultado = ResultadoPago.EN_REVISION

        orden.refresh_from_db()
        if resultado == ResultadoPago.EN_REVISION:
            logger.error(f"La orden {orden.id} requiere revisión del admin: {orden.motivo_revision}")
        elif resultado == ResultadoPago.REPETIDO:
            logger.info(f"Confirmación repetida de la orden {orden.id}; se omite.")
        elif resultado == ResultadoPago.PAGADO and orden.error_orden_transporte:
            # El pago queda firme; el error queda guardado en la orden
            logger.error(f"No se generó la OT de la orden {orden.id}: {orden.error_orden_transporte}")

        # El comprador sabe que su pago llegó, pero no se le promete un pedido que el admin debe revisar
        revision = '&revision=1' if orden.requiere_revision else ''
        return HttpResponseRedirect(f"{frontend_url}/pago-exitoso?orden={orden.id}{revision}")


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

    def get(self, request, orden_id):
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
    # RF-03.5: el footer solo enlaza las páginas publicadas
    queryset = PaginaLegal.objects.filter(publicada=True)
    serializer_class = PaginaLegalSerializer
    permission_classes = [AllowAny]
    authentication_classes = []


def tipo_pagina_legal(tipo):
    """El tipo llega en la URL en cualquier formato (ej. 'terminos'); None si no es válido."""
    tipo = tipo.upper()
    return tipo if tipo in dict(PaginaLegal.TIPOS_PAGINA) else None


class PaginaLegalDetalleView(APIView):
    """Página pública /legal/<tipo>: un borrador responde igual que una página inexistente."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, tipo):
        pagina = PaginaLegal.objects.filter(tipo_pagina=tipo.upper(), publicada=True).first()
        if pagina is None:
            return Response({'detail': 'Página no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PaginaLegalDetalleSerializer(pagina).data)


class AdminPaginasLegalesView(APIView):
    """Las tres páginas legales para el editor del admin, aunque aún no estén redactadas."""
    permission_classes = [IsAdministrador]

    def get(self, request):
        existentes = {pagina.tipo_pagina: pagina for pagina in PaginaLegal.objects.all()}
        return Response([
            PaginaLegalAdminSerializer(existentes[tipo]).data if tipo in existentes else {
                'tipo_pagina': tipo, 'titulo': nombre, 'contenido': '',
                'publicada': False, 'ultima_actualizacion': None,
            }
            for tipo, nombre in PaginaLegal.TIPOS_PAGINA
        ])


class AdminPaginaLegalView(APIView):
    """RF-03.5: el admin crea o actualiza una página legal por tipo."""
    permission_classes = [IsAdministrador]

    def put(self, request, tipo):
        tipo = tipo_pagina_legal(tipo)
        if tipo is None:
            return Response({'detail': 'Página no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        pagina = PaginaLegal.objects.filter(tipo_pagina=tipo).first()
        serializer = PaginaLegalAdminSerializer(pagina, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(tipo_pagina=tipo)
        return Response(serializer.data, status=status.HTTP_200_OK if pagina else status.HTTP_201_CREATED)

def codigo_medio_pago(codigo):
    """Código válido de medio de pago (sin distinguir mayúsculas), o None."""
    try:
        return CodigoMedioPago(codigo.upper())
    except ValueError:
        return None


class AdminMediosPagoView(APIView):
    """RN-02: los medios de pago con su estado; las credenciales van enmascaradas."""
    permission_classes = [IsAdministrador]

    def get(self, request):
        return Response([medio_pago_para_panel(medio) for medio in medios_pago().listar()])


class AdminMedioPagoView(APIView):
    """El admin habilita un medio de pago y carga sus datos (se puede guardar incompleto)."""
    permission_classes = [IsAdministrador]

    def put(self, request, codigo):
        codigo = codigo_medio_pago(codigo)
        if codigo is None:
            return Response({'detail': 'Medio de pago no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MedioPagoAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            medio = ConfigurarMedioPago(DjangoRepositorioMediosPago()).ejecutar(
                codigo, serializer.validated_data['habilitado'], serializer.validated_data['datos'])
        except DatosMedioPagoInvalidos as error:
            return Response({'datos': error.errores}, status=status.HTTP_400_BAD_REQUEST)
        return Response(medio_pago_para_panel(medio))


class AdminChilexpressView(APIView):
    """RNF-03: el admin carga las llaves de Chilexpress desde el panel; solo se devuelven enmascaradas."""
    permission_classes = [IsAdministrador]

    def get(self, request):
        return Response(chilexpress_para_panel(DjangoRepositorioCredencialesChilexpress().obtener()))

    def put(self, request):
        serializer = CredencialesChilexpressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            credenciales = ConfigurarChilexpress(DjangoRepositorioCredencialesChilexpress()).ejecutar(
                serializer.validated_data['datos'])
        except CredencialesChilexpressInvalidas as error:
            return Response({'datos': error.errores}, status=status.HTTP_400_BAD_REQUEST)
        return Response(chilexpress_para_panel(credenciales))
