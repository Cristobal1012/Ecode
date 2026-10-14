"""Adaptador SMTP (Django) del puerto NotificadorPedidos: correos al comprador (RF-04.2)."""

import logging
import os

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string

from ecommerce.application.ventas import MOTIVO_PAGO_ANULADO, MOTIVO_PAGO_VENCIDO, NotificadorPedidos
from ecommerce.domain.ventas import EventoPedido

from ..instrucciones_pago import instrucciones_transferencia
from ..models import ConfiguracionGlobal, OrdenCompra

logger = logging.getLogger(__name__)

ASUNTOS = {
    EventoPedido.RECIBIDO: 'Recibimos tu pedido #{id}',
    EventoPedido.PAGO_APROBADO: 'Pago confirmado: pedido #{id}',
    EventoPedido.PAGO_EN_REVISION: 'Recibimos el pago de tu pedido #{id}',
    EventoPedido.PAGO_RECHAZADO: 'No se pudo completar el pago del pedido #{id}',
    EventoPedido.CANCELADO: 'Tu pedido #{id} fue cancelado',
    EventoPedido.EN_PREPARACION: 'Estamos preparando tu pedido #{id}',
    EventoPedido.DESPACHADO: 'Tu pedido #{id} va en camino',
    EventoPedido.ENTREGADO: 'Tu pedido #{id} fue entregado',
}
# Con retiro en el local "despachado" significa que el pedido ya se puede retirar
ASUNTOS_RETIRO_LOCAL = {
    EventoPedido.DESPACHADO: 'Tu pedido #{id} está listo para retirar',
    EventoPedido.ENTREGADO: 'Retiraste tu pedido #{id}',
}


def pesos(valor) -> str:
    """Formato chileno: $12.990"""
    return f"${int(round(float(valor or 0))):,}".replace(',', '.')


class CorreoNotificadorPedidos(NotificadorPedidos):
    def notificar(self, orden_id, evento):
        # AGENTS.md RF-04.2: no se avisan cambios que luego hagan rollback
        transaction.on_commit(lambda: self._enviar(orden_id, EventoPedido(evento)))

    def _enviar(self, orden_id, evento):
        try:
            orden = OrdenCompra.objects.select_related('usuario').prefetch_related('detalles').get(id=orden_id)
            destinatario = orden.email_invitado or (orden.usuario.email if orden.usuario else '')
            if not destinatario:
                logger.warning('La orden %s no tiene correo de contacto; no se envía %s', orden_id, evento)
                return
            contexto = self._contexto(orden)
            plantilla = f'ventas/correos/{evento.value.lower()}'
            asuntos = ASUNTOS_RETIRO_LOCAL if contexto['es_retiro_local'] else {}
            asunto = asuntos.get(evento, ASUNTOS[evento]).format(id=orden.id)
            correo = EmailMultiAlternatives(
                subject=f"{asunto} | {contexto['tienda']}",
                body=render_to_string(f'{plantilla}.txt', contexto),
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[destinatario],
            )
            correo.attach_alternative(render_to_string(f'{plantilla}.html', contexto), 'text/html')
            correo.send()
        except Exception:
            # El cambio de la orden ya quedó guardado: solo se registra (sin datos del comprador)
            logger.exception('No se pudo enviar el correo %s de la orden %s', evento, orden_id)

    @staticmethod
    def _contexto(orden):
        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
        return {
            'tienda': config.nombre_tienda if config and config.nombre_tienda else 'Nuestra tienda',
            'orden': orden,
            'detalles': [{
                'nombre': detalle.nombre_producto_snapshot,
                'cantidad': detalle.cantidad,
                'precio_unitario': pesos(detalle.precio_unitario_snapshot),
                'total': pesos(detalle.precio_unitario_snapshot * detalle.cantidad),
            } for detalle in orden.detalles.all()],
            'subtotal': pesos(orden.subtotal),
            'costo_envio': pesos(orden.costo_envio),
            'total': pesos(orden.total_final),
            'metodo_pago': orden.get_metodo_pago_display(),
            'anulado_por_comprador': orden.motivo_cancelacion == MOTIVO_PAGO_ANULADO,
            'pago_vencido': orden.motivo_cancelacion == MOTIVO_PAGO_VENCIDO,
            'es_retiro_local': orden.proveedor_logistico == 'RETIRO_LOCAL',
            'transportista': (orden.proveedor_logistico or '').capitalize(),
            # Número de la orden de transporte (RF-02.3), si ya se generó
            'numero_ot': orden.numero_seguimiento_tracking or '',
            # Datos bancarios, monto y referencia si la orden se paga por transferencia (None si no)
            'transferencia': CorreoNotificadorPedidos._transferencia(orden),
            'entrega': CorreoNotificadorPedidos._entrega(orden, config),
            # RF-02.4: el invitado consulta con su número de orden y su correo
            'url_seguimiento': f'{frontend_url}/seguimiento?orden={orden.id}',
        }

    @staticmethod
    def _transferencia(orden):
        instrucciones = instrucciones_transferencia(orden)
        if instrucciones:
            instrucciones['monto'] = pesos(instrucciones['monto'])
        return instrucciones

    @staticmethod
    def _entrega(orden, config):
        direccion = orden.direccion_envio_snapshot or {}
        if orden.proveedor_logistico == 'RETIRO_LOCAL':
            partes = [config.calle_origen, config.numero_origen, config.comuna_origen] if config else []
            return 'Retiro en el local: ' + ' '.join(p for p in partes if p)
        texto = ' '.join(str(direccion.get(c) or '') for c in ('calle', 'numero')).strip()
        if direccion.get('dpto_casa') and not direccion.get('codigo_sucursal'):
            texto += f", {direccion['dpto_casa']}"
        if direccion.get('comuna'):
            texto += f", {direccion['comuna']}"
        tipo = 'Retiro en sucursal' if direccion.get('codigo_sucursal') else 'Despacho a domicilio'
        proveedor = (orden.proveedor_logistico or '').capitalize()
        return f'{tipo} ({proveedor}): {texto}' if proveedor else f'{tipo}: {texto}'
