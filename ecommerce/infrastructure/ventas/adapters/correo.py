"""Adaptador SMTP (Django) del puerto NotificadorPedidos: correos al comprador (RF-04.2)."""

import logging
import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from ecommerce.application.cotizaciones import NotificadorCotizaciones
from ecommerce.application.ventas import MOTIVO_PAGO_ANULADO, MOTIVO_PAGO_VENCIDO, NotificadorPedidos
from ecommerce.domain.empresa import DatosEmpresa
from ecommerce.domain.logistica import DIRECCION_POR_ACORDAR, ENTREGA_COORDINADA, aviso_entrega_coordinada
from ecommerce.domain.ventas import EstadoPedido, EventoPedido

from ..enlaces_resena import url_resena
from ..instrucciones_pago import fecha_limite_pago, instrucciones_transferencia
from ..models import ConfiguracionGlobal, Cotizacion, OrdenCompra, Resena

logger = logging.getLogger(__name__)

ASUNTOS = {
    EventoPedido.RECIBIDO: 'Recibimos tu pedido #{id}',
    EventoPedido.PAGO_APROBADO: 'Pago confirmado: pedido #{id}',
    EventoPedido.PAGO_EN_REVISION: 'Recibimos el pago de tu pedido #{id}',
    EventoPedido.PAGO_RECHAZADO: 'No se pudo completar el pago del pedido #{id}',
    EventoPedido.RECORDATORIO_PAGO: 'Recuerda pagar tu pedido #{id}',
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
        # RF-04.2: no se avisan cambios que luego hagan rollback
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
            # Horas que tuvo para transferir (el plazo de la tienda al crear la orden)
            'plazo_pago_horas': round((fecha_limite_pago(orden) - orden.fecha_creacion).total_seconds() / 3600),
            'es_retiro_local': orden.proveedor_logistico == 'RETIRO_LOCAL',
            'es_entrega_coordinada': orden.proveedor_logistico == ENTREGA_COORDINADA,
            # Cómo se coordina la entrega (lo escribe el admin); vacío si la entrega no es coordinada
            'aviso_entrega_coordinada': CorreoNotificadorPedidos._aviso_entrega_coordinada(orden, config),
            'transportista': (orden.proveedor_logistico or '').capitalize(),
            # Compra como empresa: [(etiqueta, valor)] con los datos para la factura; vacío si compró una persona
            'datos_factura': [(etiqueta, (orden.datos_empresa or {}).get(campo, ''))
                              for campo, etiqueta in DatosEmpresa.CAMPOS] if orden.datos_empresa else [],
            # Número de la orden de transporte (RF-02.3), si ya se generó
            'numero_ot': orden.numero_seguimiento_tracking or '',
            # Datos bancarios, monto y referencia si la orden se paga por transferencia (None si no)
            'transferencia': CorreoNotificadorPedidos._transferencia(orden),
            'entrega': CorreoNotificadorPedidos._entrega(orden, config),
            # RF-02.4: el invitado consulta con su número de orden y su correo
            'url_seguimiento': f'{frontend_url}/seguimiento?orden={orden.id}',
            'url_resena': CorreoNotificadorPedidos._url_resena(orden, config),
        }

    @staticmethod
    def _url_resena(orden, config):
        """Solo en el correo de entrega y con las reseñas activas; vacío si el pedido ya tiene reseña."""
        if not (config and config.resenas_activas) or orden.estado != EstadoPedido.ENTREGADO:
            return ''
        if Resena.objects.filter(orden_id=orden.id).exists():
            return ''
        return url_resena(orden.id)

    @staticmethod
    def _transferencia(orden):
        instrucciones = instrucciones_transferencia(orden)
        if instrucciones:
            instrucciones['monto'] = pesos(instrucciones['monto'])
            # Hora de Chile (TIME_ZONE), ej. 16-10-2026 a las 14:30
            instrucciones['vence'] = timezone.localtime(instrucciones['vence']).strftime('%d-%m-%Y a las %H:%M')
        return instrucciones

    @staticmethod
    def _aviso_entrega_coordinada(orden, config):
        if orden.proveedor_logistico != ENTREGA_COORDINADA:
            return ''
        return aviso_entrega_coordinada(config.instrucciones_entrega_coordinada if config else '')

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
        if orden.proveedor_logistico == ENTREGA_COORDINADA:
            return f'Entrega coordinada: {texto or DIRECCION_POR_ACORDAR}'
        tipo = 'Retiro en sucursal' if direccion.get('codigo_sucursal') else 'Despacho a domicilio'
        proveedor = (orden.proveedor_logistico or '').capitalize()
        return f'{tipo} ({proveedor}): {texto}' if proveedor else f'{tipo}: {texto}'


class CorreoNotificadorCotizaciones(NotificadorCotizaciones):
    """Avisa a la tienda de una solicitud de cotización y le confirma al cliente que llegó."""

    def notificar_nueva(self, cotizacion_id):
        # Igual que los pedidos: no se avisa una solicitud que luego haga rollback
        transaction.on_commit(lambda: self._enviar(cotizacion_id))

    def _enviar(self, cotizacion_id):
        try:
            cotizacion = Cotizacion.objects.get(id=cotizacion_id)
            config = ConfiguracionGlobal.objects.filter(pk=1).first()
            tienda = config.nombre_tienda if config and config.nombre_tienda else 'Nuestra tienda'
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
            contexto = {
                'tienda': tienda, 'cotizacion': cotizacion, 'url_panel': f'{frontend_url}/admin',
                'detalle': self._detalle(cotizacion),
                'datos_factura': [(etiqueta, cotizacion.datos_empresa.get(campo, ''))
                                  for campo, etiqueta in DatosEmpresa.CAMPOS] if cotizacion.datos_empresa else [],
            }
            correos_tienda = self._correos_tienda(config)
            if correos_tienda:
                # Responder este correo le llega al cliente
                self._mandar('cotizacion_tienda', f'Nueva solicitud de cotización #{cotizacion.id} | {tienda}',
                             contexto, correos_tienda, responder_a=[cotizacion.correo])
            else:
                logger.warning('La tienda no tiene correo de contacto ni administradores: la cotización %s '
                               'solo queda en el panel', cotizacion_id)
            self._mandar('cotizacion_recibida', f'Recibimos tu solicitud de cotización #{cotizacion.id} | {tienda}',
                         contexto, [cotizacion.correo], responder_a=correos_tienda[:1])
        except Exception:
            # La solicitud ya quedó guardada y se ve en el panel: solo se registra (sin datos del cliente)
            logger.exception('No se pudo enviar el aviso de la cotización %s', cotizacion_id)

    @staticmethod
    def _mandar(plantilla, asunto, contexto, para, responder_a):
        correo = EmailMultiAlternatives(
            subject=asunto, body=render_to_string(f'ventas/correos/{plantilla}.txt', contexto),
            from_email=settings.DEFAULT_FROM_EMAIL, to=para, reply_to=responder_a or None,
        )
        correo.attach_alternative(render_to_string(f'ventas/correos/{plantilla}.html', contexto), 'text/html')
        correo.send()

    @staticmethod
    def _correos_tienda(config):
        """El correo de contacto de la tienda; si no lo cargó, el de sus administradores."""
        if config and config.correo_contacto:
            return [config.correo_contacto]
        return list(get_user_model().objects.filter(rol='ADMIN', is_active=True)
                    .exclude(email='').order_by('id').values_list('email', flat=True))

    @staticmethod
    def _detalle(cotizacion):
        filas = [('Producto', cotizacion.producto_nombre or 'Descrito por el cliente')]
        if cotizacion.descripcion:
            filas.append(('Qué necesita', cotizacion.descripcion))
        filas.append(('Cantidad', str(cotizacion.cantidad)))
        if cotizacion.personalizacion:
            filas.append(('Personalización', cotizacion.personalizacion))
        if cotizacion.fecha_requerida:
            filas.append(('Lo necesita para el', cotizacion.fecha_requerida.strftime('%d-%m-%Y')))
        filas += [('Nombre', cotizacion.nombre), ('Correo', cotizacion.correo), ('Teléfono', cotizacion.telefono)]
        return filas
