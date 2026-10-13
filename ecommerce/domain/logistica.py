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


class ErrorOrdenTransporte(Exception):
    """El transportista no pudo generar la orden de transporte."""


# Transportistas con los que se genera una orden de transporte (OT) al confirmarse el pago
PROVEEDORES_CON_ORDEN_TRANSPORTE = frozenset({'CHILEXPRESS'})


@dataclass(frozen=True)
class EnvioSolicitado:
    """Lo que necesita el transportista para generar la OT de una orden pagada (RF-02.3)."""

    orden_id: int
    proveedor: str
    comuna: str
    calle: str
    numero: str
    complemento: str
    destinatario: str
    email: str
    valor_declarado: int
    # Paquete cotizado en el checkout (None en órdenes anteriores a guardarlo)
    paquete: Paquete | None = None
    # Oficina del transportista donde retira el comprador; vacío si es a domicilio
    codigo_sucursal: str = ''
    # OT ya generada: no se pide otra
    numero_ot: str = ''

    @property
    def requiere_orden_transporte(self) -> bool:
        return self.proveedor in PROVEEDORES_CON_ORDEN_TRANSPORTE


class PuertoCotizadorLogistico(ABC):
    """Puerto de salida para un único método de entrega."""

    @abstractmethod
    def cotizar(self, solicitud: SolicitudCotizacion) -> Cotizacion:
        raise NotImplementedError
