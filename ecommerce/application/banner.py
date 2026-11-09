"""Casos de uso para el carrusel de banner de la portada (RF-01.1, SCRUM-194)."""

import json
from django.db import transaction
from rest_framework import serializers

from ecommerce.domain.banner import (
    MAX_FOTOS_BANNER,
    EstructuraBannerInvalida,
    LimiteFotosBannerExcedido,
    validar_cantidad_fotos_banner,
)


def _ubicaciones(archivos):
    return [(archivo.storage, archivo.name) for archivo in archivos if archivo and getattr(archivo, 'name', None)]


def _borrar_al_confirmar(archivos):
    pendientes = _ubicaciones(archivos)
    if pendientes:
        transaction.on_commit(lambda: [storage.delete(nombre) for storage, nombre in pendientes])


class ActualizarBanners:
    """Actualiza de forma atómica las fotos del banner, su orden y elimina las descartadas."""

    def __init__(self, campo_imagen=None):
        from ecommerce.infrastructure.ventas.serializers import ImagenNegocioField
        self.campo_imagen = campo_imagen or ImagenNegocioField()

    def ejecutar(self, config, raw_orden, nuevos_archivos):
        from ecommerce.infrastructure.ventas.models import FotoBanner

        # 1. Parsear y validar formato de banner_orden
        if isinstance(raw_orden, str):
            try:
                orden_list = json.loads(raw_orden)
            except (json.JSONDecodeError, ValueError, TypeError) as exc:
                raise EstructuraBannerInvalida('El formato de banner_orden no es un JSON válido.') from exc
        elif isinstance(raw_orden, list):
            orden_list = raw_orden
        else:
            raise EstructuraBannerInvalida('banner_orden debe ser una lista.')

        if not isinstance(orden_list, list):
            raise EstructuraBannerInvalida('banner_orden debe ser una lista.')

        # 2. Validar límite de fotos
        validar_cantidad_fotos_banner(len(orden_list))

        # 3. Validar elementos del manifiesto
        nuevos_indices = []
        ids_existentes_pedidos = []
        tiene_legacy = False

        for item in orden_list:
            if isinstance(item, str):
                if item == 'id:legacy' or item == 'legacy':
                    tiene_legacy = True
                elif item.startswith('id:'):
                    try:
                        ids_existentes_pedidos.append(int(item.split(':')[1]))
                    except (IndexError, ValueError) as exc:
                        raise EstructuraBannerInvalida(f'ID de banner inválido: {item}') from exc
                elif item.startswith('nuevo:'):
                    try:
                        idx = int(item.split(':')[1])
                        if idx < 0 or idx >= len(nuevos_archivos):
                            raise EstructuraBannerInvalida(f'Índice de archivo nuevo fuera de rango: {idx}')
                        nuevos_indices.append(idx)
                    except (IndexError, ValueError) as exc:
                        raise EstructuraBannerInvalida(f'Índice de nuevo banner inválido: {item}') from exc
                else:
                    raise EstructuraBannerInvalida(f'Elemento inválido en banner_orden: {item}')
            elif isinstance(item, int):
                ids_existentes_pedidos.append(item)
            else:
                raise EstructuraBannerInvalida(f'Tipo de dato inválido en banner_orden: {type(item)}')

        # 4. Validar y procesar archivos nuevos (falla con 400 si alguno es corrupto o no es imagen)
        archivos_procesados = {}
        for idx in set(nuevos_indices):
            archivo = nuevos_archivos[idx]
            try:
                archivos_procesados[idx] = self.campo_imagen.to_internal_value(archivo)
            except serializers.ValidationError:
                raise
            except Exception as exc:
                raise serializers.ValidationError({'banner_fotos': [f'Archivo {archivo.name} no es válido: {exc}']}) from exc

        # 5. Ejecución atómica en base de datos
        with transaction.atomic():
            fotos_actuales = {f.id: f for f in config.fotos_banner.all()}
            archivos_a_borrar = []

            # Si viene 'id:legacy', migramos el banner actual a FotoBanner
            legacy_foto = None
            if tiene_legacy and config.banner:
                legacy_foto = FotoBanner.objects.create(
                    configuracion=config,
                    imagen=config.banner,
                    orden=0,
                )
                fotos_actuales[legacy_foto.id] = legacy_foto

            ids_a_conservar = set(ids_existentes_pedidos)
            if legacy_foto is not None:
                ids_a_conservar.add(legacy_foto.id)

            # Eliminar fotos que no están en el nuevo orden
            for foto_id, foto in list(fotos_actuales.items()):
                if foto_id not in ids_a_conservar:
                    archivos_a_borrar.append(foto.imagen)
                    foto.delete()
                    fotos_actuales.pop(foto_id, None)

            # Reordenar y crear fotos nuevas en el orden exacto
            for nuevo_orden, item in enumerate(orden_list):
                if item == 'id:legacy' or item == 'legacy':
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

            # Limpiar config.banner para evitar duplicidad de fuentes (Point 5)
            if config.banner and (orden_list or FotoBanner.objects.filter(configuracion=config).exists()):
                config.banner = None
                config.save(update_fields=['banner'])

            # Si la transacción confirma, se eliminan físicamente los archivos del disco (Point 7)
            _borrar_al_confirmar(archivos_a_borrar)
