import logging

from bson.errors import InvalidId
from django.conf import settings
from mongoengine.errors import MongoEngineException, ValidationError as MongoValidationError
from pymongo.errors import PyMongoError
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ecommerce.domain.imagenes import (
    AlmacenamientoImagenNoDisponible,
    GaleriaEnConflicto,
    LimiteGaleriaExcedido,
)
from ecommerce.application.vitrina import SeleccionarVitrina
from ecommerce.infrastructure.usuarios.permissions import IsAdministrador
from ecommerce.infrastructure.ventas.repositorio_ventas import DjangoVentasPorProducto

from .documents import ImagenPendienteBorrado, Producto
from .image_adapters import eliminar_producto, servicio_galeria
from .images import (
    CLAVE_IMAGEN, GaleriaUploadSerializer, descriptor_imagen,
    es_imagen_gestionada, url_imagen,
)
from .permissions import LecturaPublicaEscrituraAdmin
from .repositorio_vitrina import MongoCatalogoVitrina
from .serializers import ProductoSerializer
from .upload_handlers import CatalogoImageUploadHandler


logger = logging.getLogger(__name__)


class CatalogoAPIView(APIView):
    def get_object(self, id):
        try:
            return Producto.objects.get(id=id)
        except (Producto.DoesNotExist, MongoValidationError, InvalidId) as exc:
            raise NotFound('Producto no encontrado.') from exc

    def handle_exception(self, exc):
        if isinstance(exc, GaleriaEnConflicto):
            return Response(
                {'detail': 'La galería cambió durante la operación. Recarga el producto y vuelve a intentarlo.'},
                status=status.HTTP_409_CONFLICT,
            )
        if isinstance(exc, LimiteGaleriaExcedido):
            return Response({'imagenes': ['Se ha superado el límite de imágenes por producto.']}, status=400)
        if isinstance(exc, MongoValidationError):
            return Response({'detail': 'Los datos del producto no son válidos.'}, status=400)
        if isinstance(exc, (AlmacenamientoImagenNoDisponible, MongoEngineException, PyMongoError, OSError)):
            logger.exception('Fallo de persistencia en el catálogo')
            return Response({'detail': 'El catálogo o su almacenamiento no están disponibles. Inténtalo nuevamente.'}, status=503)
        return super().handle_exception(exc)


def seleccionar_vitrina():
    """Las pruebas lo reemplazan para no depender de las ventas ni del catálogo reales."""
    return SeleccionarVitrina(DjangoVentasPorProducto(), MongoCatalogoVitrina())


class VitrinaView(CatalogoAPIView):
    """RF-01.1: secciones de productos de la landing (pública)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        vitrina = seleccionar_vitrina().ejecutar()
        ids = set(vitrina.mas_vendidos) | set(vitrina.recientes)
        productos = {str(p.id): p for p in Producto.objects(id__in=list(ids))}

        def serializar(lista):
            return ProductoSerializer([productos[i] for i in lista if i in productos], many=True,
                                      context={'request': request}).data

        return Response({'mas_vendidos': serializar(vitrina.mas_vendidos), 'recientes': serializar(vitrina.recientes)})


class ProductoListCreateView(CatalogoAPIView):
    permission_classes = [LecturaPublicaEscrituraAdmin]

    def get(self, request):
        productos = Producto.objects.filter(activo=True)
        if not IsAdministrador().has_permission(request, self):
            # El público solo ve lo publicado; el admin también ve los borradores (inventario)
            productos = productos.filter(publicado=True)
        serializer = ProductoSerializer(productos, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        serializer = ProductoSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductoDetailView(CatalogoAPIView):
    permission_classes = [LecturaPublicaEscrituraAdmin]

    def get(self, request, id):
        producto = self.get_object(id)
        # Un borrador o un producto inactivo no existe para el público (misma respuesta que uno inexistente)
        if not (producto.activo and producto.publicado) and not IsAdministrador().has_permission(request, self):
            raise NotFound('Producto no encontrado.')
        return Response(ProductoSerializer(producto, context={'request': request}).data)

    def put(self, request, id):
        return self.actualizar(request, id, partial=False)

    def patch(self, request, id):
        return self.actualizar(request, id, partial=True)

    def actualizar(self, request, id, partial):
        producto = self.get_object(id)
        serializer = ProductoSerializer(
            producto, data=request.data, partial=partial, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, id):
        eliminar_producto(self.get_object(id))
        return Response(status=status.HTTP_204_NO_CONTENT)


def respuesta_galeria(producto_id, claves, request):
    return {
        'producto_id': str(producto_id),
        'imagenes': [url_imagen(clave, request) for clave in claves],
        'archivos': [
            descriptor_imagen(clave, request) for clave in claves
            if es_imagen_gestionada(clave, producto_id)
        ],
    }


class ProductoImagenListCreateView(CatalogoAPIView):
    permission_classes = [IsAdministrador]
    parser_classes = [MultiPartParser]

    def initialize_request(self, request, *args, **kwargs):
        request.upload_handlers.insert(0, CatalogoImageUploadHandler(request))
        return super().initialize_request(request, *args, **kwargs)

    def get(self, request, id):
        producto = self.get_object(id)
        return Response(respuesta_galeria(producto.id, producto.imagenes, request))

    def post(self, request, id):
        producto = self.get_object(id)
        serializer = GaleriaUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if set(request.data) != {'imagenes'}:
            raise ValidationError({'imagenes': 'Usa únicamente el campo multipart imagenes, repetido para cada archivo.'})
        galeria, subidas = servicio_galeria().subir(
            str(producto.id), list(producto.imagenes), serializer.validated_data['imagenes'],
            settings.CATALOGO_IMAGEN_MAX_GALERIA,
        )
        data = respuesta_galeria(producto.id, galeria, request)
        data['subidas'] = [descriptor_imagen(clave, request) for clave in subidas]
        return Response(data, status=status.HTTP_201_CREATED)


class ProductoImagenDetailView(CatalogoAPIView):
    permission_classes = [IsAdministrador]

    def delete(self, request, id, imagen_id):
        producto = self.get_object(id)
        clave = next((clave for clave in producto.imagenes if (
            es_imagen_gestionada(clave, producto.id) and CLAVE_IMAGEN.fullmatch(clave)['id'] == imagen_id
        )), None)
        servicio = servicio_galeria()
        if clave is None:
            # Retrying a detach whose physical deletion failed is idempotent.
            candidatas = [
                f'catalogo/productos/{producto.id}/{imagen_id}.{extension}'
                for extension in ('jpg', 'png', 'webp')
            ]
            pendiente = ImagenPendienteBorrado.objects(clave__in=candidatas).first()
            if pendiente is None:
                raise NotFound('Imagen no encontrada en este producto.')
            servicio.limpiar_pendiente(pendiente.clave)
        else:
            servicio.eliminar(str(producto.id), list(producto.imagenes), clave)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductoEnlaceImagenView(CatalogoAPIView):
    """DELETE ?url=...: quita de la galería una imagen cargada como enlace externo (las subidas usan su id)."""
    permission_classes = [IsAdministrador]

    def delete(self, request, id):
        producto = self.get_object(id)
        url = request.query_params.get('url', '')
        if url not in producto.imagenes or es_imagen_gestionada(url):
            raise NotFound('Enlace no encontrado en este producto.')
        servicio_galeria().quitar_enlace(str(producto.id), list(producto.imagenes), url)
        return Response(status=status.HTTP_204_NO_CONTENT)
