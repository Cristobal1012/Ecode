"""Contratos de cotización independientes de HTTP, Django y cada transportista."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal


class ErrorCotizacion(Exception):
    """El proveedor no pudo entregar una tarifa confiable."""


class ConfiguracionCotizacionInvalida(ErrorCotizacion):
    """Falta información necesaria para consultar el proveedor."""


@dataclass(frozen=True)
class Paquete:
    peso_kg: Decimal
    alto_cm: Decimal
    ancho_cm: Decimal
    largo_cm: Decimal


@dataclass(frozen=True)
class SolicitudCotizacion:
    comuna: str
    subtotal: Decimal
    paquete: Paquete | None = None


@dataclass(frozen=True)
class Cotizacion:
    proveedor: str
    nombre: str
    costo_envio: Decimal
    total_final: Decimal
    tipo: str = 'DESPACHO'
    moneda: str = 'CLP'


class PuertoCotizadorLogistico(ABC):
    """Puerto de salida para un único método de entrega."""

    @abstractmethod
    def cotizar(self, solicitud: SolicitudCotizacion) -> Cotizacion:
        raise NotImplementedError
