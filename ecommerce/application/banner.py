"""Casos de uso para el carrusel de banner de la portada (RF-01.1, SCRUM-194).

Independiente de Django y DRF. La capa de infraestructura implementa la persistencia.
"""

from abc import ABC, abstractmethod
import json

from ecommerce.domain.banner import (
    MAX_FOTOS_BANNER,
    EstructuraBannerInvalida,
    validar_cantidad_fotos_banner,
)


class RepositorioBanners(ABC):
    """Puerto de salida para persistir las fotos del banner y su orden."""

    @abstractmethod
    def guardar_banners(self, configuracion_id: int, orden_list: list, nuevos_archivos: list) -> None:
        raise NotImplementedError


def es_identificador_legacy(item) -> bool:
    """Reconoce 'id:legacy', 'legacy', 'id:0', 0 o '0' como referencia al banner antiguo."""
    return item in ('id:legacy', 'legacy', 'id:0', 0, '0')


class ActualizarBanners:
    """Valida el manifiesto del banner y orquesta la actualización atómica mediante el repositorio."""

    def __init__(self, repositorio: RepositorioBanners):
        self.repositorio = repositorio

    def ejecutar(self, configuracion_id: int, raw_orden, nuevos_archivos: list) -> None:
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

        # 2. Validar límite de fotos (domain/banner.py)
        validar_cantidad_fotos_banner(len(orden_list))

        # 3. Validar sintaxis y rangos de los elementos del manifiesto
        nuevos_indices = []
        for item in orden_list:
            if isinstance(item, str):
                if es_identificador_legacy(item):
                    continue
                elif item.startswith('id:'):
                    try:
                        int(item.split(':')[1])
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
                pass
            else:
                raise EstructuraBannerInvalida(f'Tipo de dato inválido en banner_orden: {type(item)}')

        # 4. Delegar la persistencia atómica y validación de archivos al puerto
        self.repositorio.guardar_banners(configuracion_id, orden_list, nuevos_archivos)
