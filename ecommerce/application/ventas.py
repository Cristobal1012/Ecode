"""Casos de uso de ventas: validar el carrito, confirmar el pago y cambiar el estado de la orden."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
import logging

from ecommerce.domain.logistica import EnvioSolicitado, ErrorOrdenTransporte
from ecommerce.domain.medios_pago import CodigoMedioPago
from ecommerce.domain.ventas import (
    ESTADOS_PAGADOS, EstadoPedido, EventoPedido, ItemSolicitado, LineaPedido, LineaRevisada, OrdenRegistrada,
    AVISO_ANTES_DEL_VENCIMIENTO, OrdenTransporteNoPermitida, PedidoVacio, PLAZO_PAGO_TRANSFERENCIA,
    SubtotalDesactualizado, VarianteCatalogo,
    armar_linea, revisar_linea, validar_generacion_orden_transporte, validar_transicion,
)

logger = logging.getLogger(__name__)


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

        lineas = [armar_linea(item, self.catalogo.obtener(item.producto_id, item.sku))
                  for item in agrupar_por_sku(items)]
        subtotal = sum((linea.total for linea in lineas), Decimal('0'))
        if subtotal != Decimal(subtotal_informado):
            raise SubtotalDesactualizado(subtotal, lineas)
        return PedidoPreparado(lineas=lineas, subtotal=subtotal)


def agrupar_por_sku(items: list[ItemSolicitado]) -> list[ItemSolicitado]:
    """Varias líneas del mismo SKU deben respetar el stock en conjunto."""
    cantidades = {}
    for item in items:
        clave = (item.producto_id, item.sku)
        cantidades[clave] = cantidades.get(clave, 0) + item.cantidad
    return [ItemSolicitado(producto_id, sku, cantidad)
            for (producto_id, sku), cantidad in cantidades.items()]


class RevisarCarrito:
    """RN-03: valida el stock al agregar al carrito y al abrir el checkout.

    No reserva nada: el stock se vuelve a validar al crear la orden y al confirmar el pago.
    """

    def __init__(self, catalogo: CatalogoVariantes):
        self.catalogo = catalogo

    def ejecutar(self, items: list[ItemSolicitado]) -> list[LineaRevisada]:
        return [revisar_linea(item, self.catalogo.obtener(item.producto_id, item.sku))
                for item in agrupar_por_sku(items)]


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
                       motivo_cancelacion: str = '', motivo_revision: str = '') -> bool:
        """Cambia el estado de forma atómica solo si sigue siendo `desde`; False si no.

        Con `motivo_revision`, el mismo cambio deja la orden marcada para revisión.
        """
        raise NotImplementedError

    @abstractmethod
    def registrar_stock_descontado(self, orden_id, descontado: bool = True) -> None:
        raise NotImplementedError

    @abstractmethod
    def completar_pago(self, orden_id) -> None:
        """Registra el stock descontado y quita la marca de revisión provisional, en un solo paso."""
        raise NotImplementedError

    @abstractmethod
    def marcar_revision(self, orden_id, motivo: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def resolver_revision(self, orden_id) -> bool:
        """Quita la marca de revisión y conserva el motivo; False si no estaba marcada."""
        raise NotImplementedError

    @abstractmethod
    def obtener_envio(self, orden_id) -> EnvioSolicitado | None:
        raise NotImplementedError

    @abstractmethod
    def registrar_orden_transporte(self, orden_id, numero_ot: str = '', error: str = '') -> None:
        """Guarda la OT generada, o el error del transportista para reintentarlo."""
        raise NotImplementedError

    @abstractmethod
    def pendientes_de_pago(self, metodo_pago: str, creadas_antes_de: datetime, sin_recordatorio: bool = False) -> list:
        """Ids de las órdenes Pendientes con ese medio de pago creadas antes de la fecha.

        Con `sin_recordatorio`, solo las que aún no recibieron el recordatorio de pago.
        """
        raise NotImplementedError

    @abstractmethod
    def marcar_recordatorio_pago(self, orden_id) -> bool:
        """Marca el recordatorio como enviado si la orden sigue Pendiente y sin él; False si no."""
        raise NotImplementedError


class NotificadorPedidos(ABC):
    """Puerto de salida (NotificationSender, RF-04.2): avisa al comprador un hito de su pedido.

    El adaptador envía después del commit y nunca lanza: un correo que falla no deshace el cambio.
    """

    @abstractmethod
    def notificar(self, orden_id, evento: EventoPedido) -> None:
        raise NotImplementedError


class TransportistaOrdenes(ABC):
    """Puerto de salida: genera la orden de transporte (OT) con el transportista."""

    @abstractmethod
    def generar_orden_transporte(self, envio: EnvioSolicitado) -> str:
        """Devuelve el número de OT; lanza ErrorOrdenTransporte si el transportista falla."""
        raise NotImplementedError


class GenerarOrdenTransporte:
    """RF-02.3: al confirmarse el pago se genera la OT con el transportista elegido.

    - Solo para transportistas con OT (no retiro en local) y una sola vez por orden.
    - Un fallo del transportista no deshace el pago: el error queda en la orden para reintentarlo.
    """

    def __init__(self, ordenes: RepositorioOrdenes, transportista: TransportistaOrdenes):
        self.ordenes = ordenes
        self.transportista = transportista

    def ejecutar(self, orden_id) -> str | None:
        """Tras confirmarse el pago: nunca lanza, para no afectar la confirmación."""
        envio = self.ordenes.obtener_envio(orden_id)
        if envio is None or not envio.requiere_orden_transporte:
            return None
        try:
            return self._generar(envio)
        except ErrorOrdenTransporte:
            return None

    def reintentar(self, orden_id) -> str:
        """El admin la genera desde el panel; lanza el error para mostrárselo."""
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            raise OrdenNoEncontrada()
        validar_generacion_orden_transporte(orden.estado, orden.requiere_revision)
        envio = self.ordenes.obtener_envio(orden_id)
        if not envio.requiere_orden_transporte:
            raise OrdenTransporteNoPermitida('Este pedido no se despacha con un transportista.')
        return self._generar(envio)

    def _generar(self, envio: EnvioSolicitado) -> str:
        if envio.numero_ot:
            return envio.numero_ot
        try:
            numero_ot = self.transportista.generar_orden_transporte(envio)
        except ErrorOrdenTransporte as error:
            self.ordenes.registrar_orden_transporte(envio.orden_id, error=str(error))
            raise
        except Exception:
            logger.exception('Error inesperado al generar la OT de la orden %s', envio.orden_id)
            self.ordenes.registrar_orden_transporte(envio.orden_id, error=MOTIVO_ERROR_OT_INESPERADO)
            raise ErrorOrdenTransporte(MOTIVO_ERROR_OT_INESPERADO) from None
        self.ordenes.registrar_orden_transporte(envio.orden_id, numero_ot)
        return numero_ot


class ResultadoPago(StrEnum):
    PAGADO = 'PAGADO'
    # Pago aprobado, pero el admin debe revisar la orden (sin stock, orden cancelada...)
    EN_REVISION = 'EN_REVISION'
    # La orden ya estaba pagada: confirmación repetida, sin efectos
    REPETIDO = 'REPETIDO'
    NO_ENCONTRADA = 'NO_ENCONTRADA'


MOTIVO_PAGO_RECHAZADO = 'Pago rechazado'
MOTIVO_PAGO_ANULADO = 'Pago anulado por el comprador'
MOTIVO_PAGO_VENCIDO = 'Pago no recibido a tiempo'
MOTIVO_CANCELACION_ADMIN = 'Cancelado por el administrador'
MOTIVO_SIN_STOCK = 'Pago confirmado sin stock para {sku}'
MOTIVO_ORDEN_NO_PENDIENTE = 'Pago aprobado sobre una orden en estado {estado}'
MOTIVO_ERROR_INVENTARIO = 'No se pudo descontar el stock'
MOTIVO_ERROR_OT_INESPERADO = 'Error inesperado al generar la orden de transporte'
# Marca provisional mientras se descuenta el stock; solo queda a la vista si el proceso se interrumpe
MOTIVO_CONFIRMACION_INTERRUMPIDA = (
    'El pago se aprobó, pero la confirmación del stock no terminó. Verifica el stock de la orden.')


class ConfirmarPago:
    """RF-02.2 y RN-03: aplica el resultado de la pasarela a la orden.

    - Solo la primera confirmación de una orden PENDIENTE descuenta stock (idempotencia).
    - Stock todo o nada: si falta en una línea, se repone lo descontado y la orden queda
      PAGADO marcada para revisión del admin, que decide si reembolsa.
    - Un pago aprobado sobre una orden no pendiente ni pagada (ej. cancelada) también va a revisión.
    - Postgres (estado) y Mongo (stock) no comparten transacción: la orden pasa a PAGADO ya marcada
      para revisión y la marca se quita al terminar. Si el proceso cae a mitad, el admin la ve.
    - Solo una orden recién pagada con stock genera la orden de transporte (RF-02.3).
    - RF-04.2: avisa al comprador solo quien cambió la orden; una confirmación repetida no reenvía correos.
    """

    def __init__(self, ordenes: RepositorioOrdenes, inventario: InventarioVariantes,
                 orden_transporte: GenerarOrdenTransporte | None = None,
                 notificador: NotificadorPedidos | None = None):
        self.ordenes = ordenes
        self.inventario = inventario
        self.orden_transporte = orden_transporte
        self.notificador = notificador

    def _notificar(self, orden_id, evento: EventoPedido):
        if self.notificador:
            self.notificador.notificar(orden_id, evento)

    def aprobar(self, orden_id, pago_exacto: bool = True) -> ResultadoPago:
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            return ResultadoPago.NO_ENCONTRADA

        if not self.ordenes.cambiar_estado(orden.id, EstadoPedido.PENDIENTE, EstadoPedido.PAGADO,
                                           motivo_revision=MOTIVO_CONFIRMACION_INTERRUMPIDA):
            estado = self.ordenes.obtener(orden.id).estado
            if estado in ESTADOS_PAGADOS:
                return ResultadoPago.REPETIDO
            self.ordenes.marcar_revision(
                orden.id, MOTIVO_ORDEN_NO_PENDIENTE.format(estado=estado.etiqueta))
            self._notificar(orden.id, EventoPedido.PAGO_EN_REVISION)
            return ResultadoPago.EN_REVISION

        # Si el monto transferido es mayor o menor (underpaid/overpaid), 
        # marcamos para revisión y abortamos antes de tocar el stock.
        if not pago_exacto:
            self.ordenes.marcar_revision(orden.id, "Monto transferido no coincide con el total de la orden.")
            self._notificar(orden.id, EventoPedido.PAGO_EN_REVISION)
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
            self._notificar(orden.id, EventoPedido.PAGO_EN_REVISION)
            raise

        if faltante is not None:
            reponer_stock(self.inventario, descontados)
            self.ordenes.marcar_revision(orden.id, MOTIVO_SIN_STOCK.format(sku=faltante.sku))
            self._notificar(orden.id, EventoPedido.PAGO_EN_REVISION)
            return ResultadoPago.EN_REVISION

        self.ordenes.completar_pago(orden.id)
        if self.orden_transporte:
            self.orden_transporte.ejecutar(orden.id)
        self._notificar(orden.id, EventoPedido.PAGO_APROBADO)
        return ResultadoPago.PAGADO

    def rechazar(self, orden_id, motivo: str) -> bool:
        """Pago rechazado o anulado: la orden pendiente se cancela con su motivo."""
        orden = self.ordenes.obtener(orden_id)
        if orden is None or not self.ordenes.cambiar_estado(
                orden.id, EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO, motivo):
            return False
        # Si el comprador anuló el pago, el aviso es de cancelación, no de un rechazo del banco
        self._notificar(orden.id, EventoPedido.CANCELADO if motivo == MOTIVO_PAGO_ANULADO
                        else EventoPedido.PAGO_RECHAZADO)
        return True


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
    """RF-03.3: cambio de estado manual desde el panel del admin.

    - Solo se permiten las transiciones de la máquina de estados (TransicionNoPermitida).
    - PENDIENTE → PAGADO (ej. transferencia validada, RF-02.2) aplica las mismas reglas que un
      pago en línea: descuenta stock todo o nada, si falta la orden queda en revisión, y si no
      se genera la orden de transporte.
    - Al cancelar se repone el stock solo si la orden lo había descontado.
    - RF-04.2: cada cambio aplicado se le avisa al comprador (despacho con enlace de seguimiento).
    """

    def __init__(self, ordenes: RepositorioOrdenes, inventario: InventarioVariantes,
                 orden_transporte: GenerarOrdenTransporte | None = None,
                 notificador: NotificadorPedidos | None = None):
        self.ordenes = ordenes
        self.inventario = inventario
        self.orden_transporte = orden_transporte
        self.notificador = notificador

    def ejecutar(self, orden_id, nuevo_estado) -> EstadoPedido:
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            raise OrdenNoEncontrada()
        nuevo = validar_transicion(orden.estado, nuevo_estado)

        if nuevo == EstadoPedido.PAGADO:
            pago = ConfirmarPago(self.ordenes, self.inventario, self.orden_transporte, self.notificador)
            if pago.aprobar(orden.id) == ResultadoPago.REPETIDO:
                raise PedidoModificado()
            return nuevo

        cancelando = nuevo == EstadoPedido.CANCELADO
        motivo = MOTIVO_CANCELACION_ADMIN if cancelando else ''
        if not self.ordenes.cambiar_estado(orden.id, orden.estado, nuevo, motivo):
            raise PedidoModificado()
        if cancelando and orden.stock_descontado:
            reponer_stock(self.inventario, orden.items)
            self.ordenes.registrar_stock_descontado(orden.id, False)
        if self.notificador:
            self.notificador.notificar(orden.id, EVENTO_POR_ESTADO[nuevo])
        return nuevo


# Aviso al comprador de cada cambio manual del admin (PAGADO pasa por ConfirmarPago)
EVENTO_POR_ESTADO = {
    EstadoPedido.EN_PREPARACION: EventoPedido.EN_PREPARACION,
    EstadoPedido.ENVIADO: EventoPedido.DESPACHADO,
    EstadoPedido.ENTREGADO: EventoPedido.ENTREGADO,
    EstadoPedido.CANCELADO: EventoPedido.CANCELADO,
}


class CancelarPagosVencidos:
    """Plazo de pago: una transferencia que no se paga dentro del plazo (48 h) se cancela y se avisa.

    - No toca stock: la transferencia no lo reserva mientras está Pendiente.
    - El UPDATE condicional evita cancelar una orden que el admin validó mientras tanto.
    - Si el pago llega después, ConfirmarPago deja la orden cancelada en revisión del admin.
    """

    def __init__(self, ordenes: RepositorioOrdenes, notificador: NotificadorPedidos | None = None):
        self.ordenes = ordenes
        self.notificador = notificador

    def ejecutar(self, ahora: datetime) -> list:
        canceladas = []
        for orden_id in self.ordenes.pendientes_de_pago(CodigoMedioPago.TRANSFERENCIA.value,
                                                         ahora - PLAZO_PAGO_TRANSFERENCIA):
            if not self.ordenes.cambiar_estado(orden_id, EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO,
                                               MOTIVO_PAGO_VENCIDO):
                continue
            if self.notificador:
                self.notificador.notificar(orden_id, EventoPedido.CANCELADO)
            canceladas.append(orden_id)
        return canceladas


class RecordarPagosPorVencer:
    """Plazo de pago de la transferencia: a las 24 h sin pagar se le recuerda al comprador que le quedan 24 h.

    - Se ejecuta después de CancelarPagosVencidos, para no recordar una orden que ya venció.
    - El UPDATE condicional evita repetir el recordatorio y saltarse una orden que el admin validó mientras tanto.
    """

    def __init__(self, ordenes: RepositorioOrdenes, notificador: NotificadorPedidos | None = None):
        self.ordenes = ordenes
        self.notificador = notificador

    def ejecutar(self, ahora: datetime) -> list:
        recordadas = []
        creadas_antes_de = ahora - (PLAZO_PAGO_TRANSFERENCIA - AVISO_ANTES_DEL_VENCIMIENTO)
        for orden_id in self.ordenes.pendientes_de_pago(CodigoMedioPago.TRANSFERENCIA.value, creadas_antes_de,
                                                         sin_recordatorio=True):
            if not self.ordenes.marcar_recordatorio_pago(orden_id):
                continue
            if self.notificador:
                self.notificador.notificar(orden_id, EventoPedido.RECORDATORIO_PAGO)
            recordadas.append(orden_id)
        return recordadas


class SinRevisionPendiente(Exception):
    def __init__(self):
        super().__init__('La orden no tiene una revisión pendiente.')


class ResolverRevision:
    """RF-03.3: el admin marca como resuelta la revisión de una orden (ej. ya reembolsó).

    El motivo se conserva como historial.
    """

    def __init__(self, ordenes: RepositorioOrdenes):
        self.ordenes = ordenes

    def ejecutar(self, orden_id) -> None:
        orden = self.ordenes.obtener(orden_id)
        if orden is None:
            raise OrdenNoEncontrada()
        if not self.ordenes.resolver_revision(orden.id):
            raise SinRevisionPendiente()
