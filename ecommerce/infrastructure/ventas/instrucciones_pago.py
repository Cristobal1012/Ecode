"""Instrucciones para pagar una orden por transferencia: van en la respuesta del checkout y en el correo."""

from ecommerce.domain.medios_pago import CodigoMedioPago
from ecommerce.domain.ventas import vencimiento_pago_transferencia

from .repositorio_medios_pago import DjangoRepositorioMediosPago


def instrucciones_transferencia(orden) -> dict | None:
    """Datos bancarios de la tienda, monto y referencia; None si la orden no se paga por transferencia.

    No se publican en la configuración pública: solo los recibe quien hizo un pedido.
    """
    if orden.metodo_pago != CodigoMedioPago.TRANSFERENCIA.value:
        return None
    medio = DjangoRepositorioMediosPago().obtener(CodigoMedioPago.TRANSFERENCIA)
    datos = medio.datos_para_comprador()
    if not datos:
        return None
    return {
        'datos': [{'etiqueta': campo.etiqueta, 'valor': datos[campo.nombre]}
                  for campo in medio.definicion.campos if campo.nombre in datos],
        'monto': int(round(orden.total_final)),
        # El comprador la indica al transferir para que la tienda identifique el pago
        'referencia': f'Pedido #{orden.id}',
        # Plazo de pago (48 h): después de esta fecha la orden se cancela (manage.py cancelar_pagos_vencidos)
        'vence': vencimiento_pago_transferencia(orden.fecha_creacion),
    }
