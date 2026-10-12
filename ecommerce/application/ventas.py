"""Casos de uso de ventas: validar el carrito, confirmar el pago y cambiar el estado de la orden."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from ecommerce.domain.ventas import (
    ESTADOS_PAGADOS, EstadoPedido, ItemSolicitado, LineaPedido, OrdenRegistrada, PedidoVacio,
    SubtotalDesactualizado, VarianteCatalogo, armar_linea, validar_transicion,
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
    def cambiar_estado(self, orden_id, desde: EstadoPedido, hacia: EstadoPedido,
                       motivo_cancelacion: str = '') -> bool:
        """Cambia el estado de forma atómica solo si sigue siendo `desde`; False si no."""
        raise NotImplementedError

    @abstractmethod
    def registrar_stock_descontado(self, orden_id, descontado: bool = True) -> None:
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
MOTIVO_CANCELACION_ADMIN = 'Cancelado por el administrador'
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

        if not self.ordenes.cambiar_estado(orden.id, EstadoPedido.PENDIENTE, EstadoPedido.PAGADO):
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
            reponer_stock(self.inventario, descontados)
            self.ordenes.marcar_revision(orden.id, MOTIVO_ERROR_INVENTARIO)
            raise

        if faltante is not None:
            reponer_stock(self.inventario, descontados)
            self.ordenes.marcar_revision(orden.id, MOTIVO_SIN_STOCK.format(sku=faltante.sku))
            return ResultadoPago.EN_REVISION

        self.ordenes.registrar_stock_descontado(orden.id)
        return ResultadoPago.PAGADO

    def rechazar(self, orden_id, motivo: str) -> bool:
        """Pago rechazado o anulado: la orden pendiente se cancela con su motivo."""
        orden = self.ordenes.obtener(orden_id)
        return orden is not None and self.ordenes.cambiar_estado(
            orden.id, EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO, motivo)


def reponer_stock(inventario: InventarioVariantes, items):
    for item in items:
        inventario.reponer(item.producto_id, item.sku, item.cantidad)


class OrdenNoEncontrada(Exception):
    pass


class PedidoModificado(Exception):
    """Otro proceso cambió el estado de la orden entre la lectura y la escritura."""

    def __init__(self):
        super().__init__('El pedido cambió mientras lo editabas. Recarga la lista e inténtalo de nuevo.')


class CambiarEstadoPedido:
    """RF-03.3, AGENTS.md §9 y §4.1: cambio de estado manual desde el panel del admin.

    - Solo se permiten las transiciones de §9 (TransicionNoPermitida).
    - PENDIENTE → PAGADO (ej. transferencia validada, RF-02.2) aplica las mismas reglas que un
      pago en línea: descuenta stock todo o nada y, si falta, la orden queda en revisión.
    - Al cancelar se repone el stock solo si la orden lo había descontado.
    """

    def __init__(self, ordenes: RepositorioOrdenes, inventario: InventarioVariantes):
        self.ordenes = ordenes
        self.inventario = inventario

    def ejecutar(self, orden_id, nuevo_estado) -> EstadoPedido:
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            raise OrdenNoEncontrada()
        nuevo = validar_transicion(orden.estado, nuevo_estado)

        if nuevo == EstadoPedido.PAGADO:
            if ConfirmarPago(self.ordenes, self.inventario).aprobar(orden.id) == ResultadoPago.REPETIDO:
                raise PedidoModificado()
            return nuevo

        cancelando = nuevo == EstadoPedido.CANCELADO
        motivo = MOTIVO_CANCELACION_ADMIN if cancelando else ''
        if not self.ordenes.cambiar_estado(orden.id, orden.estado, nuevo, motivo):
            raise PedidoModificado()
        if cancelando and orden.stock_descontado:
            reponer_stock(self.inventario, orden.items)
            self.ordenes.registrar_stock_descontado(orden.id, False)
        return nuevo
