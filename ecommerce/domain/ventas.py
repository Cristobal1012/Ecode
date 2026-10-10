"""Reglas para armar un pedido, independientes de HTTP, Django y la base de catálogo."""

from dataclasses import dataclass
from decimal import Decimal


class ErrorPedido(Exception):
    """El pedido no se puede crear tal como viene."""


class PedidoVacio(ErrorPedido):
    def __init__(self):
        super().__init__('El carrito está vacío.')


class CantidadInvalida(ErrorPedido):
    def __init__(self, sku):
        self.sku = sku
        super().__init__(f'La cantidad de {sku} debe ser al menos 1.')


class VarianteNoDisponible(ErrorPedido):
    """La variante no existe, o su producto está inactivo o sin publicar."""

    def __init__(self, sku):
        self.sku = sku
        super().__init__(f'El producto {sku} ya no está disponible.')


class StockInsuficiente(ErrorPedido):
    def __init__(self, sku, disponible):
        self.sku = sku
        self.disponible = disponible
        super().__init__(f'Stock insuficiente para {sku}. Quedan {disponible} unidades disponibles.')


class SubtotalDesactualizado(ErrorPedido):
    """El subtotal del comprador no coincide con los precios vigentes del catálogo."""

    def __init__(self, subtotal_vigente, lineas=()):
        self.subtotal_vigente = subtotal_vigente
        self.lineas = list(lineas)
        super().__init__('Los precios de tu carrito cambiaron. Revisa el nuevo total antes de pagar.')


@dataclass(frozen=True)
class ItemSolicitado:
    producto_id: str
    sku: str
    cantidad: int

    def __post_init__(self):
        if self.cantidad < 1:
            raise CantidadInvalida(self.sku)


@dataclass(frozen=True)
class VarianteCatalogo:
    nombre: str
    precio: Decimal
    stock: int
    # El producto padre está activo y publicado
    disponible: bool


@dataclass(frozen=True)
class LineaPedido:
    producto_id: str
    sku: str
    nombre: str
    precio_unitario: Decimal
    cantidad: int

    @property
    def total(self) -> Decimal:
        return self.precio_unitario * self.cantidad


def armar_linea(item: ItemSolicitado, variante: VarianteCatalogo | None) -> LineaPedido:
    """RN-03 / RF-03.4: no se vende una variante sin stock; el control es por SKU, no por producto."""
    if variante is None or not variante.disponible:
        raise VarianteNoDisponible(item.sku)
    if item.cantidad > variante.stock:
        raise StockInsuficiente(item.sku, max(variante.stock, 0))
    return LineaPedido(
        producto_id=item.producto_id, sku=item.sku, nombre=variante.nombre,
        precio_unitario=variante.precio, cantidad=item.cantidad,
    )
