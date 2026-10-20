"""Contratos de cotización independientes de HTTP, Django y cada transportista."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

from .medios_pago import enmascarar


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

# Entregas que hace la propia tienda, sin transportista ni cotización (RF-02.3)
RETIRO_LOCAL = 'RETIRO_LOCAL'
# La tienda contacta al comprador para acordar el día y el lugar (ej. entregas en persona en su ciudad)
ENTREGA_COORDINADA = 'ENTREGA_COORDINADA'
ENTREGAS_DE_LA_TIENDA = frozenset({RETIRO_LOCAL, ENTREGA_COORDINADA})


class EntregaNoHabilitada(Exception):
    """El comprador eligió una forma de entrega que la tienda no ofrece."""


@dataclass(frozen=True)
class EntregasDeLaTienda:
    """Formas de entrega propias que el admin activa en el panel; el retiro es gratis y la coordinada tiene su costo."""

    retiro_activo: bool = False
    coordinada_activa: bool = False
    costo_coordinada: Decimal = Decimal('0')

    def costo(self, proveedor: str) -> Decimal:
        if proveedor == RETIRO_LOCAL:
            if not self.retiro_activo:
                raise EntregaNoHabilitada('El retiro en local no está habilitado en esta tienda.')
            return Decimal('0')
        if proveedor == ENTREGA_COORDINADA:
            if not self.coordinada_activa:
                raise EntregaNoHabilitada('La entrega coordinada no está habilitada en esta tienda.')
            return self.costo_coordinada
        raise EntregaNoHabilitada('Esa forma de entrega no la hace la tienda.')


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
    # +56XXXXXXXXX; vacío en órdenes creadas antes de pedirlo en el checkout
    telefono: str = ''
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


class CredencialesChilexpressInvalidas(Exception):
    def __init__(self, errores: dict[str, str]):
        self.errores = errores
        super().__init__('; '.join(f'{campo}: {error}' for campo, error in errores.items()))


@dataclass(frozen=True)
class CredencialesChilexpress:
    """Llaves de las APIs de Chilexpress que carga el admin en el panel (RNF-03): nunca en el .env ni completas
    hacia el frontend. Cada API de Chilexpress tiene su propia llave; sin la de coberturas o la de envíos se usa
    la del cotizador.
    """

    cotizador: str = ''
    coberturas: str = ''
    envios: str = ''

    # (nombre, etiqueta, obligatorio), en el orden del panel
    CAMPOS = (
        ('cotizador', 'API key del cotizador (Rating)', True),
        ('coberturas', 'API key de coberturas y sucursales (Georeference)', False),
        ('envios', 'API key de envíos (Transport Orders y seguimiento)', False),
    )

    @property
    def llave_coberturas(self) -> str:
        return self.coberturas or self.cotizador

    @property
    def llave_envios(self) -> str:
        return self.envios or self.cotizador

    @property
    def faltantes(self) -> list[str]:
        return [nombre for nombre, _, obligatorio in self.CAMPOS if obligatorio and not getattr(self, nombre)]

    @property
    def configuradas(self) -> bool:
        return not self.faltantes

    def visibles(self) -> dict[str, str]:
        """Para el panel del admin: solo los últimos 4 caracteres de cada llave."""
        return {nombre: enmascarar(getattr(self, nombre)) for nombre, _, _ in self.CAMPOS}

    def con_cambios(self, datos: dict[str, str]) -> 'CredencialesChilexpress':
        """Combina lo que envía el panel con lo guardado: una llave que llega enmascarada (tal como el panel la
        mostró) o que no llega se conserva; un texto vacío la borra.
        """
        nombres = {nombre for nombre, _, _ in self.CAMPOS}
        errores = {nombre: 'Campo desconocido.' for nombre in datos if nombre not in nombres}
        if errores:
            raise CredencialesChilexpressInvalidas(errores)
        valores = {}
        for nombre in nombres:
            actual = getattr(self, nombre)
            if nombre not in datos:
                valores[nombre] = actual
                continue
            valor = str(datos[nombre] or '').strip()
            valores[nombre] = actual if valor and valor == enmascarar(actual) else valor
        return CredencialesChilexpress(**valores)
