"""Datos de contacto de la tienda (pie de página e Instagram de la landing); independiente de Django."""

import re

# Reglas de Instagram: hasta 30 letras, números, puntos o guiones bajos; sin punto al inicio, al final ni dos seguidos
_USUARIO_INSTAGRAM = re.compile(r'^(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$')
_PERFIL_INSTAGRAM = re.compile(r'^(https?://)?(www\.)?instagram\.com/', re.IGNORECASE)


class UsuarioInstagramInvalido(ValueError):
    def __init__(self):
        super().__init__(
            'Escribe el usuario de Instagram (por ejemplo, @mitienda) o el enlace a tu perfil. '
            'Solo puede tener letras, números, puntos y guiones bajos.'
        )


def normalizar_usuario_instagram(texto):
    """Acepta 'mitienda', '@mitienda' o el enlace al perfil y devuelve 'mitienda' ('' si viene vacío)."""
    valor = (texto or '').strip()
    if not valor:
        return ''
    if _PERFIL_INSTAGRAM.match(valor):
        # instagram.com/mitienda/?hl=es -> mitienda
        valor = _PERFIL_INSTAGRAM.sub('', valor).split('?')[0].split('/')[0]
    # Instagram no distingue mayúsculas en los usuarios
    valor = valor.lstrip('@').lower()
    if not _USUARIO_INSTAGRAM.match(valor):
        raise UsuarioInstagramInvalido()
    return valor


def direccion_es_publica(retiro_en_local_activo, mostrar_direccion_pie):
    """La dirección del local solo se publica si el comprador la necesita (retiro) o el admin eligió mostrarla.

    Muchos emprendedores despachan desde su casa: sin una de las dos, la dirección no sale de la base.
    """
    return bool(retiro_en_local_activo or mostrar_direccion_pie)


# RN-01: el admin elige dónde va el logo de la Universidad: en el header junto al del negocio (por defecto) o en
# el footer, más grande, con el del negocio en el header (decidido el 2026-11-05). No hay ninguna opción para ocultarlo
LOGO_UNIVERSIDAD_HEADER = 'HEADER'
LOGO_UNIVERSIDAD_FOOTER = 'FOOTER'
UBICACIONES_LOGO_UNIVERSIDAD = (LOGO_UNIVERSIDAD_HEADER, LOGO_UNIVERSIDAD_FOOTER)
