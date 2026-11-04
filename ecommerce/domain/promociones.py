"""Reglas de los códigos de descuento (RF-04.1); independiente de Django.

El checkout igual limita el descuento al subtotal (el total nunca queda negativo), pero un código mal configurado,
como un 250 % o un umbral de envío gratis negativo, regalaría la compra o el envío: se rechaza al guardarlo.
"""

import re
from decimal import Decimal

PORCENTAJE = 'PORCENTAJE'
MONTO_FIJO = 'MONTO_FIJO'
LARGO_CODIGO = 50

_CODIGO = re.compile(r'^[A-ZÑ0-9_-]+$')


class PromocionInvalida(ValueError):
    def __init__(self, errores: dict[str, str]):
        self.errores = errores
        super().__init__('; '.join(f'{campo}: {error}' for campo, error in errores.items()))


def normalizar_codigo(texto) -> str:
    """En mayúsculas y sin espacios a los lados: el comprador lo escribe como quiera."""
    return str(texto or '').strip().upper()


def validar_promocion(codigo, tipo_descuento, valor_descuento, umbral_envio_gratis) -> str:
    """Devuelve el código normalizado; PromocionInvalida con un error por campo si algo no sirve."""
    errores = {}
    codigo = normalizar_codigo(codigo)
    if not codigo:
        errores['codigo'] = 'Escribe el código.'
    elif len(codigo) > LARGO_CODIGO:
        errores['codigo'] = f'El código puede tener hasta {LARGO_CODIGO} caracteres.'
    elif not _CODIGO.match(codigo):
        errores['codigo'] = 'Usa solo letras, números, guiones o guiones bajos, sin espacios (ej. VERANO20).'

    valor = None if valor_descuento is None else Decimal(str(valor_descuento))
    if valor is None or valor <= 0:
        errores['valor_descuento'] = 'El descuento debe ser mayor a cero.'
    elif tipo_descuento == PORCENTAJE and valor > 100:
        errores['valor_descuento'] = 'Un descuento en porcentaje puede ser de hasta 100.'
    elif tipo_descuento == MONTO_FIJO and valor != valor.to_integral_value():
        errores['valor_descuento'] = 'El monto va en pesos, sin decimales.'

    if umbral_envio_gratis is not None and Decimal(str(umbral_envio_gratis)) <= 0:
        errores['umbral_envio_gratis'] = 'El monto para el envío gratis debe ser mayor a cero, o déjalo vacío.'

    if errores:
        raise PromocionInvalida(errores)
    return codigo
