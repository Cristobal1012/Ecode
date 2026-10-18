"""Vitrina de la landing (RF-01.1): los productos más vendidos y los últimos agregados al catálogo."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


class VentasPorProducto(ABC):
    """Puerto de salida: unidades vendidas en pedidos pagados (PostgreSQL)."""

    @abstractmethod
    def mas_vendidos(self, limite: int) -> list[str]:
        """IDs de producto ordenados de más a menos unidades vendidas."""
        raise NotImplementedError


class CatalogoVitrina(ABC):
    """Puerto de salida: productos visibles para el público (MongoDB)."""

    @abstractmethod
    def visibles(self, ids: list[str]) -> list[str]:
        """De esos IDs, los que siguen activos y publicados, en el mismo orden."""
        raise NotImplementedError

    @abstractmethod
    def recientes(self, limite: int, excluir: list[str] = ()) -> list[str]:
        """IDs de los productos visibles más nuevos primero, sin los excluidos."""
        raise NotImplementedError


@dataclass(frozen=True)
class Vitrina:
    mas_vendidos: list[str]
    recientes: list[str]


class SeleccionarVitrina:
    """Arma las dos secciones de productos de la landing.

    - Más vendidos: por unidades en pedidos pagados. Si no alcanzan (una tienda nueva no tiene ventas), se
      completa con otros productos visibles, primero los que no aparecen en "últimos agregados" (decidido
      el 2026-10-18).
    - Últimos agregados: los productos visibles más nuevos.
    """

    def __init__(self, ventas: VentasPorProducto, catalogo: CatalogoVitrina, cantidad: int = 4):
        self.ventas = ventas
        self.catalogo = catalogo
        self.cantidad = cantidad

    def ejecutar(self) -> Vitrina:
        # Se piden más de los necesarios: algunos vendidos pueden estar despublicados o borrados
        vendidos = self.catalogo.visibles(self.ventas.mas_vendidos(self.cantidad * 3))[:self.cantidad]
        recientes = self.catalogo.recientes(self.cantidad)

        faltan = self.cantidad - len(vendidos)
        if faltan > 0:
            vendidos += self.catalogo.recientes(faltan, excluir=vendidos + recientes)
        faltan = self.cantidad - len(vendidos)
        if faltan > 0:
            # Catálogo chico: se repiten productos de "últimos agregados" antes que dejar la sección corta
            vendidos += self.catalogo.recientes(faltan, excluir=vendidos)
        return Vitrina(mas_vendidos=vendidos, recientes=recientes)
