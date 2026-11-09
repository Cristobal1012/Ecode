"""Adaptador Django para la persistencia del carrusel de banner (SCRUM-194)."""

from django.db import transaction
from rest_framework import serializers

from ecommerce.application.banner import RepositorioBanners, es_identificador_legacy
from ecommerce.infrastructure.ventas.models import ConfiguracionGlobal, FotoBanner
from ecommerce.infrastructure.ventas.serializers import ImagenNegocioField


def _ubicaciones(archivos):
    return [(archivo.storage, archivo.name) for archivo in archivos if archivo and getattr(archivo, 'name', None)]


def _borrar_al_confirmar(archivos):
    pendientes = _ubicaciones(archivos)
    if pendientes:
        transaction.on_commit(lambda: [storage.delete(nombre) for storage, nombre in pendientes])


class DjangoRepositorioBanners(RepositorioBanners):
    def __init__(self, campo_imagen=None):
        self.campo_imagen = campo_imagen or ImagenNegocioField()

    def guardar_banners(self, configuracion_id: int, orden_list: list, nuevos_archivos: list) -> None:
        config = ConfiguracionGlobal.objects.get(pk=configuracion_id)

        # Parsear índices nuevos e IDs pedidos
        nuevos_indices = []
        ids_existentes_pedidos = []
        tiene_legacy = False

        for item in orden_list:
            if es_identificador_legacy(item):
                tiene_legacy = True
            elif isinstance(item, str) and item.startswith('id:'):
                ids_existentes_pedidos.append(int(item.split(':')[1]))
            elif isinstance(item, str) and item.startswith('nuevo:'):
                nuevos_indices.append(int(item.split(':')[1]))
            elif isinstance(item, int):
                ids_existentes_pedidos.append(item)

        # Validar y procesar archivos nuevos (con mensaje legible para el admin)
        archivos_procesados = {}
        for idx in set(nuevos_indices):
            archivo = nuevos_archivos[idx]
            try:
                archivos_procesados[idx] = self.campo_imagen.to_internal_value(archivo)
            except serializers.ValidationError:
                raise
            except Exception as exc:
                raise serializers.ValidationError({
                    'banner_fotos': [f'El archivo {archivo.name} no es una imagen válida o está dañado.']
                }) from exc

        # Ejecución atómica
        with transaction.atomic():
            fotos_actuales = {f.id: f for f in config.fotos_banner.all()}
            archivos_a_borrar = []

            legacy_foto = None
            if tiene_legacy and config.banner:
                # Migrar banner antiguo a FotoBanner
                legacy_foto = FotoBanner.objects.create(
                    configuracion=config,
                    imagen=config.banner,
                    orden=0,
                )
                fotos_actuales[legacy_foto.id] = legacy_foto
            elif not tiene_legacy and config.banner:
                # Si el banner antiguo ya no se incluye en el manifiesto, se descarta físicamente
                archivos_a_borrar.append(config.banner)
                config.banner = None
                config.save(update_fields=['banner'])

            ids_a_conservar = set(ids_existentes_pedidos)
            if legacy_foto is not None:
                ids_a_conservar.add(legacy_foto.id)

            # Eliminar fotos del carrusel que no están en el nuevo orden
            for foto_id, foto in list(fotos_actuales.items()):
                if foto_id not in ids_a_conservar:
                    archivos_a_borrar.append(foto.imagen)
                    foto.delete()
                    fotos_actuales.pop(foto_id, None)

            # Reordenar y crear fotos nuevas en el orden exacto
            for nuevo_orden, item in enumerate(orden_list):
                if es_identificador_legacy(item):
                    if legacy_foto is not None:
                        legacy_foto.orden = nuevo_orden
                        legacy_foto.save(update_fields=['orden'])
                elif isinstance(item, str) and item.startswith('id:'):
                    foto_id = int(item.split(':')[1])
                    if foto_id in fotos_actuales:
                        foto = fotos_actuales[foto_id]
                        if foto.orden != nuevo_orden:
                            foto.orden = nuevo_orden
                            foto.save(update_fields=['orden'])
                elif isinstance(item, int):
                    if item in fotos_actuales:
                        foto = fotos_actuales[item]
                        if foto.orden != nuevo_orden:
                            foto.orden = nuevo_orden
                            foto.save(update_fields=['orden'])
                elif isinstance(item, str) and item.startswith('nuevo:'):
                    file_idx = int(item.split(':')[1])
                    procesado = archivos_procesados[file_idx]
                    nueva_foto = FotoBanner.objects.create(
                        configuracion=config,
                        imagen=procesado,
                        orden=nuevo_orden,
                    )
                    fotos_actuales[nueva_foto.id] = nueva_foto

            # Limpiar config.banner si ya se migraron o existen fotos en FotoBanner
            if config.banner and (orden_list or FotoBanner.objects.filter(configuracion=config).exists()):
                config.banner = None
                config.save(update_fields=['banner'])

            # Borrar archivos del disco al confirmar
            _borrar_al_confirmar(archivos_a_borrar)

