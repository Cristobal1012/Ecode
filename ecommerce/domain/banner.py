"""Reglas de dominio para el carrusel de banner de la portada (RF-01.1, SCRUM-194)."""

MAX_FOTOS_BANNER = 10


class LimiteFotosBannerExcedido(Exception):
    """Se intenta subir más de MAX_FOTOS_BANNER fotos."""


class EstructuraBannerInvalida(Exception):
    """El manifiesto de orden o los identificadores de banner no son válidos."""


def validar_cantidad_fotos_banner(cantidad: int):
    if cantidad > MAX_FOTOS_BANNER:
        raise LimiteFotosBannerExcedido(f'El banner admite hasta {MAX_FOTOS_BANNER} fotos.')
