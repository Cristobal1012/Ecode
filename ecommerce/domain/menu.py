"""Reglas de configuración del menú, independientes de Django y de la persistencia."""

ORDEN_MENU = ('inicio', 'catalogo', 'nosotros', 'sobre_mi', 'cotizar')
ENLACES_MENU = frozenset(ORDEN_MENU)
ENLACES_OCULTABLES = frozenset({'nosotros', 'sobre_mi', 'cotizar'})
MAXIMO_NOMBRE_CATALOGO = 20
MAXIMO_NOMBRE_MENU = 30


class MenuInvalido(ValueError):
    """La configuración del menú incumple una regla de negocio."""


def normalizar_menu_principal(valor, menu_anterior=None) -> dict:
    if not isinstance(valor, dict) or set(valor) - {'orden', 'nombres', 'ocultos'}:
        raise MenuInvalido('La configuración debe contener solo orden, nombres y ocultos.')
    resultado = {}
    if 'orden' in valor:
        orden = valor['orden']
        if (not isinstance(orden, list)
                or any(not isinstance(item, str) for item in orden)
                or set(orden) - ENLACES_MENU
                or len(set(orden)) != len(orden)):
            raise MenuInvalido('El orden debe contener enlaces conocidos, de texto y sin duplicados.')
        resultado['orden'] = orden + [enlace for enlace in ORDEN_MENU if enlace not in orden]
    if 'nombres' in valor:
        nombres = valor['nombres']
        if not isinstance(nombres, dict) or set(nombres) - ENLACES_MENU:
            raise MenuInvalido('Los nombres contienen enlaces desconocidos.')
        resultado['nombres'] = {}
        for clave, nombre in nombres.items():
            if not isinstance(nombre, str):
                raise MenuInvalido('Cada nombre debe ser texto.')
            nombre = ' '.join(nombre.split())
            limite = MAXIMO_NOMBRE_CATALOGO if clave == 'catalogo' else MAXIMO_NOMBRE_MENU
            if len(nombre) > limite:
                anterior = (menu_anterior or {}).get('nombres', {}).get(clave)
                if clave == 'catalogo' and isinstance(anterior, str) and nombre == ' '.join(anterior.split()):
                    resultado['nombres'][clave] = anterior
                    continue
                raise MenuInvalido(f'El nombre no puede superar los {limite} caracteres.')
            if nombre:
                resultado['nombres'][clave] = nombre
    if 'ocultos' in valor:
        ocultos = valor['ocultos']
        if (not isinstance(ocultos, list)
                or any(not isinstance(item, str) for item in ocultos)
                or set(ocultos) - ENLACES_OCULTABLES
                or len(set(ocultos)) != len(ocultos)):
            raise MenuInvalido('Solo se pueden ocultar enlaces opcionales, sin duplicados.')
        resultado['ocultos'] = ocultos
    return resultado
