"""Logística (RF-02.3): entregas de la tienda y lo común a los couriers, sin HTTP, Django ni un courier fijo."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
import math
import unicodedata

from .medios_pago import enmascarar


@dataclass(frozen=True)
class Paquete:
    peso_kg: Decimal
    alto_cm: Decimal
    ancho_cm: Decimal
    largo_cm: Decimal


def clave_comuna(nombre) -> str:
    """Para comparar comunas: sin tildes, con la Ñ como N, en mayúsculas y con un espacio entre palabras.

    Los couriers escriben 'NUNOA' o 'MAIPU' y la tienda puede escribir 'Ñuñoa' o 'Maipú': son la misma comuna.
    """
    sin_tildes = unicodedata.normalize('NFKD', str(nombre or '')).encode('ascii', 'ignore').decode()
    return ' '.join(sin_tildes.upper().split())


@dataclass(frozen=True)
class MedidasEnvio:
    """Peso y medidas de una unidad de una variante, como las carga el admin; sin cargar, las del catálogo."""
    peso_kg: Decimal = Decimal('1')
    alto_cm: Decimal = Decimal('10')
    ancho_cm: Decimal = Decimal('10')
    largo_cm: Decimal = Decimal('10')


# Lo mínimo que se declara si una variante tiene un valor vacío o en cero
PESO_MINIMO_KG = Decimal('0.1')
LADO_MINIMO_CM = 10


def paquete_de_envio(unidades: list[tuple[MedidasEnvio, int]]) -> Paquete:
    """RF-02.3: la caja con todo el pedido, que se cotiza y se despacha. La arma el servidor con las medidas del
    catálogo, nunca con las del navegador: si no, se podría declarar menos peso para pagar menos envío.

    Pesa la suma de los productos y es un cubo con su volumen total, de al menos el lado más largo de un producto
    y 10 cm.
    """
    peso, volumen, lado_mas_largo = Decimal('0'), 0, 0
    for medidas, cantidad in unidades:
        peso += (medidas.peso_kg if medidas.peso_kg > 0 else PESO_MINIMO_KG) * cantidad
        lados = [int(lado) if lado > 0 else LADO_MINIMO_CM
                 for lado in (medidas.alto_cm, medidas.ancho_cm, medidas.largo_cm)]
        volumen += math.prod(lados) * cantidad
        lado_mas_largo = max(lado_mas_largo, *lados)
    # La potencia 1/3 no es exacta: para 27.000 cm³ da 30,000000000000004, que sin redondear subiría a 31
    lado = Decimal(max(LADO_MINIMO_CM, lado_mas_largo, math.ceil(round(volumen ** (1 / 3), 9))))
    return Paquete(peso.quantize(Decimal('0.01'), ROUND_HALF_UP), lado, lado, lado)


class ErrorOrdenTransporte(Exception):
    """El transportista no pudo generar la orden de transporte."""


# Entregas que hace la propia tienda, sin transportista ni cotización (RF-02.3)
RETIRO_LOCAL = 'RETIRO_LOCAL'
# La tienda contacta al comprador para acordar el día y el lugar (ej. entregas en persona en su ciudad)
ENTREGA_COORDINADA = 'ENTREGA_COORDINADA'
ENTREGAS_DE_LA_TIENDA = frozenset({RETIRO_LOCAL, ENTREGA_COORDINADA})
NOMBRES_ENTREGAS_DE_LA_TIENDA = {RETIRO_LOCAL: 'Retiro en local', ENTREGA_COORDINADA: 'Entrega coordinada'}
# Lo que se le dice al comprador si el admin no escribió cómo coordina las entregas
AVISO_ENTREGA_COORDINADA = 'La tienda te contactará para acordar el día y la hora de la entrega.'

# Seguimiento de una entrega de la tienda: no hay courier, el avance es el estado del pedido (domain/ventas.py)
_ESTADOS_ENTREGA_DE_LA_TIENDA = {
    'PENDIENTE': 'Esperando el pago',
    'PAGADO': 'Pago confirmado',
    'EN_PREPARACION': 'En preparación',
    'CANCELADO': 'Cancelado',
}
_ESTADOS_FINALES_ENTREGA_DE_LA_TIENDA = {
    # ENVIADO es "Despachado" en el panel; para estas entregas significa que la tienda ya puede entregarlo
    RETIRO_LOCAL: {'ENVIADO': 'Listo para retirar', 'ENTREGADO': 'Retirado'},
    ENTREGA_COORDINADA: {'ENVIADO': 'La tienda coordinará la entrega contigo', 'ENTREGADO': 'Entregado'},
}


def aviso_entrega_coordinada(instrucciones: str) -> str:
    """Las instrucciones que escribió el admin o, si no hay, el aviso de que la tienda contactará al comprador."""
    return (instrucciones or '').strip() or AVISO_ENTREGA_COORDINADA


# Lo que ven la tienda y el comprador cuando una entrega coordinada se pidió sin dirección
DIRECCION_POR_ACORDAR = 'Dirección por acordar con la tienda'


def error_direccion_entrega(proveedor: str, direccion) -> str | None:
    """RF-02.3: la dirección que pide cada forma de entrega; None si la recibida sirve.

    - Retiro en local: ninguna, se retira en la tienda.
    - Entrega coordinada: opcional, porque la tienda puede acordarla con el comprador (decidido el 2026-10-25).
      Si el comprador la escribe, tiene que traer al menos la calle y la comuna.
    - Transportista: la comuna de destino, para cotizar y generar la orden de transporte.
    """
    direccion = direccion if isinstance(direccion, dict) else {}

    def tiene(campo):
        return bool(str(direccion.get(campo) or '').strip())

    if proveedor == RETIRO_LOCAL:
        return None
    if proveedor == ENTREGA_COORDINADA:
        if any(tiene(campo) for campo in ('calle', 'numero', 'comuna')) and not (tiene('calle') and tiene('comuna')):
            return 'Completa la calle y la comuna, o deja la dirección vacía para acordarla con la tienda.'
        return None
    return None if tiene('comuna') else 'Se requiere la comuna de destino.'


def estado_entrega_de_la_tienda(proveedor: str, estado_pedido: str) -> str:
    """RF-02.4: estado que ve el comprador en el seguimiento de un retiro o una entrega coordinada."""
    estado = str(estado_pedido)
    return (_ESTADOS_FINALES_ENTREGA_DE_LA_TIENDA.get(proveedor, {}).get(estado)
            or _ESTADOS_ENTREGA_DE_LA_TIENDA.get(estado, estado))


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
        return es_entrega_con_courier(self.proveedor)


def es_entrega_con_courier(proveedor: str | None) -> bool:
    """Toda entrega que no hace la tienda la lleva un courier, que cotiza y genera la orden de transporte."""
    return bool(proveedor) and proveedor not in ENTREGAS_DE_LA_TIENDA


# ---------- Couriers (RF-02.3): lo común a Chilexpress, Starken o el que se sume ----------

# RF-02.4: lo que ve el comprador si el courier no responde el seguimiento
ESTADO_NO_DISPONIBLE = 'Estado no disponible temporalmente'


class ErrorCourier(Exception):
    """Un courier no pudo responder lo que se le pidió."""


class SinCobertura(ErrorCourier):
    """El courier no llega a esa comuna: es un dato del comprador, no una falla (el checkout responde 400)."""


class CourierNoDisponible(ErrorCourier):
    """El courier no respondió o respondió algo inválido (el checkout responde 503)."""


@dataclass(frozen=True)
class CotizacionEnvio:
    """Tarifa de un courier para un paquete, en pesos enteros."""

    proveedor: str
    nombre: str
    precio: int
    tiempo_estimado: str = ''


@dataclass(frozen=True)
class Sucursal:
    """Oficina del courier donde el comprador retira su pedido."""

    codigo: str
    nombre: str
    direccion: str = ''


@dataclass(frozen=True)
class CampoCredencial:
    nombre: str
    etiqueta: str
    obligatorio: bool = False


class CredencialesInvalidas(Exception):
    def __init__(self, errores: dict[str, str]):
        self.errores = errores
        super().__init__('; '.join(f'{campo}: {error}' for campo, error in errores.items()))


@dataclass(frozen=True)
class CredencialesCourier:
    """Llaves de un courier que carga el admin en el panel (RNF-03): nunca en el .env ni completas hacia el
    frontend. Cada courier declara sus campos; los valores que faltan quedan vacíos.
    """

    campos: tuple[CampoCredencial, ...]
    valores: tuple[tuple[str, str], ...] = ()

    @classmethod
    def con(cls, campos, valores: dict[str, str] | None = None) -> 'CredencialesCourier':
        """Toma solo los campos declarados, en su orden; lo demás se descarta."""
        valores = valores or {}
        return cls(tuple(campos), tuple((campo.nombre, str(valores.get(campo.nombre) or '')) for campo in campos))

    def valor(self, nombre: str) -> str:
        return dict(self.valores).get(nombre, '')

    def como_dict(self) -> dict[str, str]:
        return dict(self.valores)

    @property
    def faltantes(self) -> list[str]:
        return [campo.nombre for campo in self.campos if campo.obligatorio and not self.valor(campo.nombre)]

    @property
    def configuradas(self) -> bool:
        return not self.faltantes

    def visibles(self) -> dict[str, str]:
        """Para el panel del admin: solo los últimos 4 caracteres de cada llave."""
        return {campo.nombre: enmascarar(self.valor(campo.nombre)) for campo in self.campos}

    def con_cambios(self, datos: dict[str, str]) -> 'CredencialesCourier':
        """Combina lo que envía el panel con lo guardado: una llave que llega enmascarada (tal como el panel la
        mostró) o que no llega se conserva; un texto vacío la borra.
        """
        nombres = {campo.nombre for campo in self.campos}
        errores = {nombre: 'Campo desconocido.' for nombre in datos if nombre not in nombres}
        if errores:
            raise CredencialesInvalidas(errores)
        valores = {}
        for nombre in nombres:
            actual = self.valor(nombre)
            if nombre not in datos:
                valores[nombre] = actual
                continue
            valor = str(datos[nombre] or '').strip()
            valores[nombre] = actual if valor and valor == enmascarar(actual) else valor
        return CredencialesCourier.con(self.campos, valores)
