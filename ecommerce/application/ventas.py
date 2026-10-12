"""Casos de uso de ventas: validar el carrito antes de crear la orden y confirmar su pago."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from ecommerce.domain.ventas import (
    ESTADOS_PAGADOS, ItemSolicitado, LineaPedido, OrdenRegistrada, PedidoVacio,
    SubtotalDesactualizado, VarianteCatalogo, armar_linea,
)


class CatalogoVariantes(ABC):
    """Puerto de salida: lectura de una variante (SKU) del catálogo."""

    @abstractmethod
    def obtener(self, producto_id: str, sku: str) -> VarianteCatalogo | None:
        raise NotImplementedError


@dataclass(frozen=True)
class PedidoPreparado:
    lineas: list[LineaPedido]
    subtotal: Decimal


class PrepararPedido:
    """RN-03 / RF-03.4: valida stock por variante y fija los precios del catálogo.

    El subtotal informado por el comprador debe coincidir con el vigente; si no,
    se rechaza para que vea el precio actualizado antes de pagar.
    """

    def __init__(self, catalogo: CatalogoVariantes):
        self.catalogo = catalogo

    def ejecutar(self, items: list[ItemSolicitado], subtotal_informado: Decimal) -> PedidoPreparado:
        if not items:
            raise PedidoVacio()

        # Varias líneas del mismo SKU deben respetar el stock en conjunto
        cantidades = {}
        for item in items:
            clave = (item.producto_id, item.sku)
            cantidades[clave] = cantidades.get(clave, 0) + item.cantidad

        lineas = [
            armar_linea(ItemSolicitado(producto_id, sku, cantidad),
                        self.catalogo.obtener(producto_id, sku))
            for (producto_id, sku), cantidad in cantidades.items()
        ]
        subtotal = sum((linea.total for linea in lineas), Decimal('0'))
        if subtotal != Decimal(subtotal_informado):
            raise SubtotalDesactualizado(subtotal, lineas)
        return PedidoPreparado(lineas=lineas, subtotal=subtotal)


class InventarioVariantes(ABC):
    """Puerto de salida: stock por variante (SKU)."""

    @abstractmethod
    def descontar(self, producto_id: str, sku: str, cantidad: int) -> bool:
        """Descuenta de forma atómica; devuelve False si no hay stock suficiente."""
        raise NotImplementedError

    @abstractmethod
    def reponer(self, producto_id: str, sku: str, cantidad: int) -> None:
        raise NotImplementedError


class RepositorioOrdenes(ABC):
    """Puerto de salida: órdenes de compra."""

    @abstractmethod
    def obtener(self, orden_id) -> OrdenRegistrada | None:
        raise NotImplementedError

    @abstractmethod
    def marcar_pagada_si_pendiente(self, orden_id) -> bool:
        """Pasa la orden de PENDIENTE a PAGADO de forma atómica; False si no estaba PENDIENTE."""
        raise NotImplementedError

    @abstractmethod
    def cancelar_si_pendiente(self, orden_id, motivo: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    def registrar_stock_descontado(self, orden_id) -> None:
        raise NotImplementedError

    @abstractmethod
    def marcar_revision(self, orden_id, motivo: str) -> None:
        raise NotImplementedError


class ResultadoPago(StrEnum):
    PAGADO = 'PAGADO'
    # Pago aprobado, pero el admin debe revisar la orden (sin stock, orden cancelada...)
    EN_REVISION = 'EN_REVISION'
    # La orden ya estaba pagada: confirmación repetida, sin efectos
    REPETIDO = 'REPETIDO'
    NO_ENCONTRADA = 'NO_ENCONTRADA'


MOTIVO_PAGO_RECHAZADO = 'Pago rechazado'
MOTIVO_PAGO_ANULADO = 'Pago anulado por el comprador'
MOTIVO_SIN_STOCK = 'Pago confirmado sin stock para {sku}'
MOTIVO_ORDEN_NO_PENDIENTE = 'Pago aprobado sobre una orden en estado {estado}'
MOTIVO_ERROR_INVENTARIO = 'No se pudo descontar el stock'


class ConfirmarPago:
    """RF-02.2, RN-03 y AGENTS.md §4.1: aplica el resultado de la pasarela a la orden.

    - Solo la primera confirmación de una orden PENDIENTE descuenta stock (idempotencia).
    - Stock todo o nada: si falta en una línea, se repone lo descontado y la orden queda
      PAGADO marcada para revisión del admin, que decide si reembolsa.
    - Un pago aprobado sobre una orden no pendiente ni pagada (ej. cancelada) también va a revisión.
    """

    def __init__(self, ordenes: RepositorioOrdenes, inventario: InventarioVariantes):
        self.ordenes = ordenes
        self.inventario = inventario

    def aprobar(self, orden_id) -> ResultadoPago:
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            return ResultadoPago.NO_ENCONTRADA

        if not self.ordenes.marcar_pagada_si_pendiente(orden.id):
            estado = self.ordenes.obtener(orden.id).estado
            if estado in ESTADOS_PAGADOS:
                return ResultadoPago.REPETIDO
            self.ordenes.marcar_revision(
                orden.id, MOTIVO_ORDEN_NO_PENDIENTE.format(estado=estado.etiqueta))
            return ResultadoPago.EN_REVISION

        descontados, faltante = [], None
        try:
            for item in orden.items:
                if not self.inventario.descontar(item.producto_id, item.sku, item.cantidad):
                    faltante = item
                    break
                descontados.append(item)
        except Exception:
            self._reponer(descontados)
            self.ordenes.marcar_revision(orden.id, MOTIVO_ERROR_INVENTARIO)
            raise

        if faltante is not None:
            self._reponer(descontados)
            self.ordenes.marcar_revision(orden.id, MOTIVO_SIN_STOCK.format(sku=faltante.sku))
            return ResultadoPago.EN_REVISION

        self.ordenes.registrar_stock_descontado(orden.id)
        return ResultadoPago.PAGADO

    def rechazar(self, orden_id, motivo: str) -> bool:
        """Pago rechazado o anulado: la orden pendiente se cancela con su motivo."""
        orden = self.ordenes.obtener(orden_id)
        return orden is not None and self.ordenes.cancelar_si_pendiente(orden.id, motivo)

    def _reponer(self, items):
        for item in items:
            self.inventario.reponer(item.producto_id, item.sku, item.cantidad)
