"""Reglas de ordenamiento del catálogo, independientes de Django."""

def ordenar_categorias(categorias, prioridades):
    disponibles = set(categorias)
    primeras = list(dict.fromkeys(nombre for nombre in prioridades if nombre in disponibles))
    return primeras + sorted(disponibles - set(primeras))