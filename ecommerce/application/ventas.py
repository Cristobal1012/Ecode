"""Caso de uso para validar un carrito contra el catálogo antes de crear la orden."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

from ecommerce.domain.ventas import (
    ItemSolicitado, LineaPedido, PedidoVacio, SubtotalDesactualizado, VarianteCatalogo, armar_linea,
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
