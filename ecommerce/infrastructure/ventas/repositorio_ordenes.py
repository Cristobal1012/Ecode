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
        return OrdenRegistrada(orden.id, EstadoPedido(orden.estado), items, orden.stock_descontado)

    def cambiar_estado(self, orden_id, desde, hacia, motivo_cancelacion='', motivo_revision=''):
        # Un UPDATE condicional es atómico: de dos cambios simultáneos solo uno se aplica
        cambios = {'estado': EstadoPedido(hacia).value}
        if motivo_cancelacion:
            cambios['motivo_cancelacion'] = motivo_cancelacion
        if motivo_revision:
            cambios.update(requiere_revision=True, motivo_revision=motivo_revision)
        return OrdenCompra.objects.filter(
            id=orden_id, estado=EstadoPedido(desde).value).update(**cambios) == 1

    def registrar_stock_descontado(self, orden_id, descontado=True):
        OrdenCompra.objects.filter(id=orden_id).update(stock_descontado=descontado)

    def completar_pago(self, orden_id):
        OrdenCompra.objects.filter(id=orden_id).update(
            stock_descontado=True, requiere_revision=False, motivo_revision='')

    def marcar_revision(self, orden_id, motivo):
        OrdenCompra.objects.filter(id=orden_id).update(requiere_revision=True, motivo_revision=motivo)

    def resolver_revision(self, orden_id):
        return OrdenCompra.objects.filter(id=orden_id, requiere_revision=True).update(
            requiere_revision=False) == 1
