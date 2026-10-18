"""Medios de pago configurables por el emprendedor (RN-02), independientes de Django."""

from dataclasses import dataclass, field
from enum import StrEnum


class CodigoMedioPago(StrEnum):
    TRANSBANK = 'TRANSBANK'
    MERCADO_PAGO = 'MERCADO_PAGO'
    TRANSFERENCIA = 'TRANSFERENCIA'


class MedioPagoNoDisponible(Exception):
    """RN-02: el comprador eligió un medio que la tienda no tiene habilitado y configurado."""

    def __init__(self, codigo):
        self.codigo = codigo
        super().__init__('Ese medio de pago no está disponible en esta tienda.')


class DatosMedioPagoInvalidos(Exception):
    def __init__(self, errores: dict[str, str]):
        self.errores = errores
        super().__init__('; '.join(f'{campo}: {error}' for campo, error in errores.items()))


@dataclass(frozen=True)
class CampoMedioPago:
    nombre: str
    etiqueta: str
    # Credencial: se guarda cifrada y nunca se devuelve completa
    secreto: bool = False
    # Valores permitidos (vacío = texto libre)
    opciones: tuple[str, ...] = ()
    # Obligatorio solo si otro campo tiene cierto valor, ej. ('ambiente', 'PRODUCCION'); None = siempre
    obligatorio_si: tuple[str, str] | None = None
    obligatorio: bool = True

    def es_obligatorio(self, datos: dict) -> bool:
        if not self.obligatorio:
            return False
        if self.obligatorio_si is None:
            return True
        campo, valor = self.obligatorio_si
        return datos.get(campo) == valor


@dataclass(frozen=True)
class DefinicionMedioPago:
    codigo: CodigoMedioPago
    nombre: str
    campos: tuple[CampoMedioPago, ...]
    # False mientras el checkout no sepa cobrar con este medio: se pueden cargar sus datos, pero no se ofrece
    integracion_lista: bool = True

    def campo(self, nombre) -> CampoMedioPago | None:
        return next((c for c in self.campos if c.nombre == nombre), None)


AMBIENTE_INTEGRACION = 'INTEGRACION'
AMBIENTE_PRODUCCION = 'PRODUCCION'

# Orden en que se muestran al comprador y en el panel. Un medio nuevo (ej. Linkify) se agrega aquí.
MEDIOS_PAGO = (
    DefinicionMedioPago(CodigoMedioPago.TRANSBANK, 'Transbank Webpay Plus', (
        # En integración se usan las llaves públicas de prueba de Transbank: no hacen falta credenciales
        CampoMedioPago('ambiente', 'Ambiente', opciones=(AMBIENTE_INTEGRACION, AMBIENTE_PRODUCCION)),
        CampoMedioPago('commerce_code', 'Código de comercio',
                       obligatorio_si=('ambiente', AMBIENTE_PRODUCCION)),
        CampoMedioPago('api_key', 'API key (llave secreta)', secreto=True,
                       obligatorio_si=('ambiente', AMBIENTE_PRODUCCION)),
    )),
    DefinicionMedioPago(CodigoMedioPago.MERCADO_PAGO, 'Mercado Pago', (
        CampoMedioPago('access_token', 'Access token', secreto=True),
        # Valida la firma x-signature de las notificaciones (webhooks)
        CampoMedioPago('webhook_secret', 'Clave secreta de notificaciones', secreto=True),
    ), integracion_lista=True),
    DefinicionMedioPago(CodigoMedioPago.TRANSFERENCIA, 'Transferencia bancaria', (
        # Datos que ve el comprador para transferir: no son secretos
        CampoMedioPago('banco', 'Banco'),
        CampoMedioPago('tipo_cuenta', 'Tipo de cuenta',
                       opciones=('Cuenta corriente', 'Cuenta vista', 'Cuenta de ahorro')),
        CampoMedioPago('numero_cuenta', 'Número de cuenta'),
        CampoMedioPago('rut_titular', 'RUT del titular'),
        CampoMedioPago('nombre_titular', 'Nombre del titular'),
        CampoMedioPago('email', 'Correo para el comprobante'),
        
        # CONFIGURACIÓN DE LINKIFY 
        CampoMedioPago('verificar_con_linkify', 'Verificar automáticamente con Linkify', 
                       opciones=('No', 'Sí'), secreto = True),
        CampoMedioPago('linkify_secret', 'Llave secreta de Linkify', secreto=True,
                       obligatorio_si=('verificar_con_linkify', 'Sí')),
    )),
)

def definicion_medio(codigo) -> DefinicionMedioPago:
    codigo = CodigoMedioPago(codigo)
    return next(d for d in MEDIOS_PAGO if d.codigo == codigo)


MASCARA = '••••'


def enmascarar(valor: str) -> str:
    """Una credencial solo se muestra con sus últimos 4 caracteres."""
    if not valor:
        return ''
    return MASCARA + valor[-4:] if len(valor) > 8 else MASCARA


@dataclass(frozen=True)
class MedioPagoConfigurado:
    codigo: CodigoMedioPago
    habilitado: bool = False
    # Valores reales, incluidas las credenciales: no deben salir del backend
    datos: dict[str, str] = field(default_factory=dict)

    @property
    def definicion(self) -> DefinicionMedioPago:
        return definicion_medio(self.codigo)

    @property
    def faltantes(self) -> list[str]:
        """Campos obligatorios sin valor, en el orden de la definición."""
        return [c.nombre for c in self.definicion.campos
                if c.es_obligatorio(self.datos) and not self.datos.get(c.nombre)]

    @property
    def disponible(self) -> bool:
        """RN-02: se ofrece al comprador solo si está habilitado, tiene todos sus datos obligatorios y el
        checkout ya sabe cobrar con él."""
        return self.definicion.integracion_lista and self.habilitado and not self.faltantes

    def datos_para_comprador(self) -> dict[str, str]:
        """Lo que el comprador necesita para pagar (ej. los datos bancarios): nunca las credenciales."""
        return {c.nombre: self.datos[c.nombre] for c in self.definicion.campos
                if not c.secreto and self.datos.get(c.nombre)}

    def datos_visibles(self) -> dict[str, str]:
        """Para el panel del admin: las credenciales van enmascaradas."""
        return {c.nombre: enmascarar(self.datos.get(c.nombre, '')) if c.secreto else self.datos.get(c.nombre, '')
                for c in self.definicion.campos}


def aplicar_cambios(actual: MedioPagoConfigurado, habilitado: bool,
                    datos_nuevos: dict[str, str]) -> MedioPagoConfigurado:
    """Combina lo que envía el panel con lo guardado.

    - Una credencial que llega enmascarada (tal como el panel la mostró) o que no llega, se conserva.
    - Un texto vacío borra el valor.
    """
    definicion = actual.definicion
    errores = {nombre: 'Campo desconocido.' for nombre in datos_nuevos if definicion.campo(nombre) is None}
    datos = dict(actual.datos)
    for campo in definicion.campos:
        if campo.nombre not in datos_nuevos:
            continue
        valor = str(datos_nuevos[campo.nombre] or '').strip()
        if campo.secreto and valor and valor == enmascarar(actual.datos.get(campo.nombre, '')):
            continue
        if valor and campo.opciones and valor not in campo.opciones:
            errores[campo.nombre] = f"Debe ser una de: {', '.join(campo.opciones)}."
            continue
        if valor:
            datos[campo.nombre] = valor
        else:
            datos.pop(campo.nombre, None)
    if errores:
        raise DatosMedioPagoInvalidos(errores)
    return MedioPagoConfigurado(actual.codigo, bool(habilitado), datos)