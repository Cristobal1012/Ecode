"""Adaptador Django (PostgreSQL) del puerto RepositorioOrdenes."""

from ecommerce.application.ventas import RepositorioOrdenes
from ecommerce.domain.ventas import EstadoPedido, ItemSolicitado, OrdenRegistrada

from .models import OrdenCompra


class DjangoRepositorioOrdenes(RepositorioOrdenes):
    def obtener(self, orden_id):
        try:
            orden = OrdenCompra.objects.get(id=orden_id)
        except (OrdenCompra.DoesNotExist, ValueError):
            return None
        items = tuple(
            ItemSolicitado(detalle.producto_mongo_id, detalle.variante_sku, detalle.cantidad)
            for detalle in orden.detalles.order_by('id')
        )
        return OrdenRegistrada(orden.id, EstadoPedido(orden.estado), items)

    def marcar_pagada_si_pendiente(self, orden_id):
        # Un UPDATE condicional es atómico: dos confirmaciones simultáneas no pagan dos veces
        return self._pendiente(orden_id).update(estado=EstadoPedido.PAGADO.value) == 1

    def cancelar_si_pendiente(self, orden_id, motivo):
        return self._pendiente(orden_id).update(
            estado=EstadoPedido.CANCELADO.value, motivo_cancelacion=motivo) == 1

    def registrar_stock_descontado(self, orden_id):
        OrdenCompra.objects.filter(id=orden_id).update(stock_descontado=True)

    def marcar_revision(self, orden_id, motivo):
        OrdenCompra.objects.filter(id=orden_id).update(requiere_revision=True, motivo_revision=motivo)

    def _pendiente(self, orden_id):
        return OrdenCompra.objects.filter(id=orden_id, estado=EstadoPedido.PENDIENTE.value)
