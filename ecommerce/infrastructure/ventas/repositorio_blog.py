"""Adaptador Django (PostgreSQL) del puerto RepositorioPublicaciones del blog.

Las fotos se guardan en el almacenamiento de Django (MEDIA_ROOT/blog/). Un archivo reemplazado o eliminado se borra
recién cuando la transacción se confirma, porque si hay rollback la base lo sigue usando; un archivo nuevo cuya fila
no alcanzó a guardarse se borra de inmediato, para no dejar huérfanos.
"""

import uuid

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Max

from ecommerce.application.blog import SIN_CAMBIO, PaginaBlog, PublicacionGuardada, RepositorioPublicaciones
from ecommerce.domain.blog import EstadoPublicacion

from .models import FotoPublicacion, Publicacion


def _archivo(imagen):
    return ContentFile(imagen.contenido, name=f'{uuid.uuid4().hex}.{imagen.extension}')


def _ubicaciones(archivos):
    return [(archivo.storage, archivo.name) for archivo in archivos if archivo]


def _borrar_al_confirmar(archivos):
    pendientes = _ubicaciones(archivos)
    if pendientes:
        transaction.on_commit(lambda: [storage.delete(nombre) for storage, nombre in pendientes])


def _descartar(archivos):
    """Borra los archivos que ya se escribieron en el almacenamiento aunque su fila no se haya guardado."""
    for archivo in archivos:
        if archivo and archivo._committed:
            archivo.storage.delete(archivo.name)


class DjangoRepositorioPublicaciones(RepositorioPublicaciones):
    def obtener(self, publicacion_id):
        publicacion = (Publicacion.objects.filter(id=publicacion_id)
                       .annotate(cantidad_fotos=Count('fotos')).first())
        if publicacion is None:
            return None
        return PublicacionGuardada(
            slug=publicacion.slug, fecha_publicacion=publicacion.fecha_publicacion,
            tiene_portada=bool(publicacion.portada), cantidad_fotos=publicacion.cantidad_fotos,
        )

    def slugs_parecidos(self, base, excepto_id):
        return set(Publicacion.objects.filter(slug__startswith=base).exclude(id=excepto_id)
                   .values_list('slug', flat=True))

    def guardar(self, publicacion_id, datos, slug, fecha_publicacion, portada):
        nueva_portada = None
        try:
            with transaction.atomic():
                if publicacion_id is None:
                    publicacion = Publicacion()
                else:
                    publicacion = Publicacion.objects.select_for_update().get(id=publicacion_id)
                publicacion.titulo = datos.titulo
                publicacion.resumen = datos.resumen
                publicacion.contenido = datos.contenido
                publicacion.estado = datos.estado.value
                publicacion.slug = slug
                publicacion.fecha_publicacion = fecha_publicacion
                if portada is not SIN_CAMBIO:
                    _borrar_al_confirmar([publicacion.portada])
                    publicacion.portada = _archivo(portada) if portada is not None else None
                    nueva_portada = publicacion.portada
                publicacion.save()
        except Exception:
            _descartar([nueva_portada])
            raise
        return publicacion.id

    @transaction.atomic
    def eliminar(self, publicacion_id):
        publicacion = Publicacion.objects.filter(id=publicacion_id).first()
        if publicacion is None:
            return False
        _borrar_al_confirmar([publicacion.portada, *(foto.imagen for foto in publicacion.fotos.all())])
        publicacion.delete()
        return True

    def agregar_fotos(self, publicacion_id, imagenes):
        fotos = []
        try:
            with transaction.atomic():
                # Bloquea la publicación para que dos subidas a la vez no repitan el orden
                publicacion = Publicacion.objects.select_for_update().get(id=publicacion_id)
                ultima = publicacion.fotos.aggregate(ultima=Max('orden'))['ultima']
                inicio = 0 if ultima is None else ultima + 1
                for orden, imagen in enumerate(imagenes, start=inicio):
                    foto = FotoPublicacion(publicacion=publicacion, orden=orden, imagen=_archivo(imagen))
                    fotos.append(foto)
                    foto.save()
        except Exception:
            _descartar([foto.imagen for foto in fotos])
            raise
        return [foto.id for foto in fotos]

    @transaction.atomic
    def quitar_foto(self, publicacion_id, foto_id):
        foto = FotoPublicacion.objects.filter(id=foto_id, publicacion_id=publicacion_id).first()
        if foto is None:
            return False
        _borrar_al_confirmar([foto.imagen])
        foto.delete()
        return True

    def publicadas(self, desde, cantidad):
        consulta = (Publicacion.objects.filter(estado=EstadoPublicacion.PUBLICADA.value)
                    .order_by('-fecha_publicacion', '-id'))
        return PaginaBlog(ids=list(consulta.values_list('id', flat=True)[desde:desde + cantidad]),
                          total=consulta.count())

    def id_publicada(self, slug):
        return (Publicacion.objects.filter(slug=slug, estado=EstadoPublicacion.PUBLICADA.value)
                .values_list('id', flat=True).first())
