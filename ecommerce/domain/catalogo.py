"""Reglas de ordenamiento del catálogo, independientes de Django."""

LARGO_NOMBRE_CATEGORIA = 100


class OrdenCategoriasInvalido(ValueError):
    """El orden de categorías que eligió el admin no cumple las reglas."""


def normalizar_orden_categorias(valor) -> list[str]:
    """Las categorías priorizadas, en orden: textos de 1 a 100 caracteres, sin espacios sobrantes ni repetidos."""
    if not isinstance(valor, list):
        raise OrdenCategoriasInvalido('El orden de categorías debe ser una lista.')
    resultado = []
    for nombre in valor:
        if not isinstance(nombre, str) or not nombre.strip() or len(nombre) > LARGO_NOMBRE_CATEGORIA:
            raise OrdenCategoriasInvalido(
                f'Cada categoría debe tener entre 1 y {LARGO_NOMBRE_CATEGORIA} caracteres.')
        nombre = nombre.strip()
        if nombre in resultado:
            raise OrdenCategoriasInvalido('Las categorías no pueden repetirse.')
        resultado.append(nombre)
    return resultado


def ordenar_categorias(categorias, prioridades):
    """Primero las priorizadas que existen, en su orden; después las demás, en orden alfabético."""
    disponibles = set(categorias)
    primeras = list(dict.fromkeys(nombre for nombre in prioridades if nombre in disponibles))
    return primeras + sorted(disponibles - set(primeras))
