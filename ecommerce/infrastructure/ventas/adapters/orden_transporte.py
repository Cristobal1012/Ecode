"""Adaptador Chilexpress del puerto TransportistaOrdenes (orden de transporte, RF-02.3)."""

from ecommerce.application.ventas import TransportistaOrdenes
from ecommerce.domain.logistica import ErrorOrdenTransporte

from ..models import ConfiguracionGlobal
from .logistica import ProveedorLogisticoAdapter

# Para órdenes creadas antes de guardar el paquete cotizado
PAQUETE_POR_DEFECTO = {'peso': '1', 'alto': 10, 'ancho': 10, 'largo': 10}


class ChilexpressOrdenTransporte(TransportistaOrdenes):
    def generar_orden_transporte(self, envio):
        # Chilexpress contacta al destinatario: no se le envía un teléfono inventado
        if not envio.telefono:
            raise ErrorOrdenTransporte('La orden no tiene teléfono del destinatario.')

        catalogo = ProveedorLogisticoAdapter._obtener_catalogo_dinamico()
        if not catalogo:
            raise ErrorOrdenTransporte('Servicio de coberturas de Chilexpress no disponible.')

        config = ConfiguracionGlobal.objects.filter(pk=1).first()
        comuna_origen = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
        codigo_destino = catalogo.get(envio.comuna.upper())
        if not codigo_destino:
            raise ErrorOrdenTransporte(f'Chilexpress no tiene cobertura para la comuna {envio.comuna}.')

        datos_envio = {
            'origen_codigo': catalogo.get(comuna_origen.upper(), 'PUDA'),
            'destino_codigo': codigo_destino,
            'calle': envio.calle,
            'numero': envio.numero,
            'supplement': envio.complemento,
            # Retiro en una oficina de Chilexpress: se entrega ahí y no en la dirección
            'es_sucursal': bool(envio.codigo_sucursal),
            'sucursal_id': envio.codigo_sucursal,
            'nombre_destinatario': envio.destinatario,
            # Número nacional de 9 dígitos, sin el +56 (mismo largo que el valor que aceptó el sandbox)
            'telefono': envio.telefono.removeprefix('+56'),
            'email': envio.email,
            'referencia': f'ORD-{envio.orden_id}',
            'valor_declarado': envio.valor_declarado,
            **self._paquete(envio.paquete),
        }

        respuesta = ProveedorLogisticoAdapter.generar_orden_transporte(datos_envio)
        if not respuesta.get('exito') or not respuesta.get('numero_ot'):
            raise ErrorOrdenTransporte(f"Chilexpress rechazó la orden de transporte: {respuesta.get('error', '')}")
        return respuesta['numero_ot']

    @staticmethod
    def _paquete(paquete):
        if paquete is None:
            return PAQUETE_POR_DEFECTO
        # Chilexpress pide el peso como texto y las medidas en centímetros enteros
        return {
            'peso': str(paquete.peso_kg),
            'alto': max(1, round(paquete.alto_cm)),
            'ancho': max(1, round(paquete.ancho_cm)),
            'largo': max(1, round(paquete.largo_cm)),
        }
