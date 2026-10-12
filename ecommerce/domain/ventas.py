"""Reglas para armar un pedido, independientes de HTTP, Django y la base de catálogo."""

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum


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


class EstadoPedido(StrEnum):
    PENDIENTE = 'PENDIENTE'
    PAGADO = 'PAGADO'
    EN_PREPARACION = 'EN_PREPARACION'
    ENVIADO = 'ENVIADO'
    ENTREGADO = 'ENTREGADO'
    CANCELADO = 'CANCELADO'

    @property
    def etiqueta(self):
        return ETIQUETAS_ESTADO[self]


ETIQUETAS_ESTADO = {
    EstadoPedido.PENDIENTE: 'Pendiente',
    EstadoPedido.PAGADO: 'Pagado',
    EstadoPedido.EN_PREPARACION: 'En Preparación',
    EstadoPedido.ENVIADO: 'Despachado',
    EstadoPedido.ENTREGADO: 'Entregado',
    EstadoPedido.CANCELADO: 'Cancelado',
}

# Estados en los que el pago ya se confirmó
ESTADOS_PAGADOS = frozenset({
    EstadoPedido.PAGADO, EstadoPedido.EN_PREPARACION, EstadoPedido.ENVIADO, EstadoPedido.ENTREGADO,
})

# AGENTS.md §9: cualquier transición que no esté aquí se rechaza
TRANSICIONES_PERMITIDAS = {
    EstadoPedido.PENDIENTE: {EstadoPedido.PAGADO, EstadoPedido.CANCELADO},
    EstadoPedido.PAGADO: {EstadoPedido.EN_PREPARACION, EstadoPedido.CANCELADO},
    EstadoPedido.EN_PREPARACION: {EstadoPedido.ENVIADO, EstadoPedido.CANCELADO},
    EstadoPedido.ENVIADO: {EstadoPedido.ENTREGADO},
    EstadoPedido.ENTREGADO: set(),
    EstadoPedido.CANCELADO: set(),
}


class TransicionNoPermitida(Exception):
    def __init__(self, actual, nuevo):
        self.actual = actual
        self.nuevo = nuevo
        super().__init__(
            f'Un pedido {_etiqueta(actual)} no puede pasar a {_etiqueta(nuevo)}.')


def _etiqueta(estado):
    try:
        return EstadoPedido(estado).etiqueta
    except ValueError:
        return str(estado)


def transiciones_desde(estado) -> list[EstadoPedido]:
    """Estados a los que puede pasar un pedido, en el orden del flujo (vacío si es final)."""
    try:
        permitidas = TRANSICIONES_PERMITIDAS[EstadoPedido(estado)]
    except ValueError:
        return []
    return [siguiente for siguiente in EstadoPedido if siguiente in permitidas]


def validar_transicion(actual, nuevo) -> EstadoPedido:
    """RF-03.3 / AGENTS.md §9: devuelve el nuevo estado si la transición está permitida."""
    try:
        actual, nuevo = EstadoPedido(actual), EstadoPedido(nuevo)
    except ValueError:
        raise TransicionNoPermitida(actual, nuevo) from None
    if nuevo not in TRANSICIONES_PERMITIDAS[actual]:
        raise TransicionNoPermitida(actual, nuevo)
    return nuevo


@dataclass(frozen=True)
class OrdenRegistrada:
    """Una orden ya creada, con lo necesario para confirmar su pago."""

    id: int
    estado: EstadoPedido
    items: tuple[ItemSolicitado, ...]
    # Al cancelar solo se repone el stock que realmente se descontó
    stock_descontado: bool = False
