"""Orquestación de opciones de entrega a partir de la configuración de tienda."""

import unicodedata

from ecommerce.domain.logistica import ConfiguracionCotizacionInvalida, ErrorCotizacion
from ecommerce.infrastructure.ventas.logistics_adapters import (
    ChilexpressAdapter,
    RetiroEnLocalAdapter,
    StarkenAdapter,
)


def _normalizar_comuna(comuna):
    return ''.join(c for c in unicodedata.normalize('NFKD', comuna.casefold().strip())
                   if not unicodedata.combining(c))


class ServicioCotizacion:
    ADAPTADORES = {'STARKEN': StarkenAdapter, 'CHILEXPRESS': ChilexpressAdapter}

    def __init__(self, configuracion, session=None):
        self.configuracion = configuracion if isinstance(configuracion, dict) else {}
        self.session = session

    @property
    def proveedor_activo(self):
        return self.configuracion.get('proveedor_activo')

    def _adaptador_despacho(self, comuna):
        proveedor = self.proveedor_activo
        if proveedor not in self.ADAPTADORES:
            raise ConfiguracionCotizacionInvalida('No hay proveedor logístico activo.')
        cfg = self.configuracion.get(proveedor)
        if not isinstance(cfg, dict) or not isinstance(cfg.get('comunas'), dict):
            raise ConfiguracionCotizacionInvalida('Falta la cobertura del proveedor.')
        comunas = {_normalizar_comuna(nombre): codigo
                   for nombre, codigo in cfg['comunas'].items()
                   if isinstance(nombre, str)}
        codigo = comunas.get(_normalizar_comuna(comuna))
        if codigo is None or codigo == '':
            raise ConfiguracionCotizacionInvalida('La comuna no tiene cobertura configurada.')
        return self.ADAPTADORES[proveedor](cfg, codigo, session=self.session)

    def retiro_habilitado(self):
        retiro = self.configuracion.get('retiro_en_local')
        return isinstance(retiro, dict) and retiro.get('activo') is True

    def cotizar(self, solicitud, proveedor=None):
        if proveedor == 'RETIRO_LOCAL':
            if not self.retiro_habilitado():
                raise ConfiguracionCotizacionInvalida('El retiro en local no está habilitado.')
            return RetiroEnLocalAdapter(
                self.configuracion['retiro_en_local'].get('nombre') or 'Retiro en local'
            ).cotizar(solicitud)
        if proveedor is not None and proveedor != self.proveedor_activo:
            raise ConfiguracionCotizacionInvalida('El proveedor seleccionado no está activo.')
        if not solicitud.paquete:
            raise ConfiguracionCotizacionInvalida('Se requiere peso y dimensiones del paquete.')
        return self._adaptador_despacho(solicitud.comuna).cotizar(solicitud)

    def opciones(self, solicitud):
        opciones, errores = [], []
        if self.proveedor_activo:
            try:
                opciones.append(self.cotizar(solicitud))
            except ErrorCotizacion as exc:
                errores.append({'proveedor': self.proveedor_activo, 'detalle': str(exc)})
        if self.retiro_habilitado():
            opciones.append(self.cotizar(solicitud, 'RETIRO_LOCAL'))
        if not opciones and not errores:
            raise ConfiguracionCotizacionInvalida('No hay métodos de entrega configurados.')
        return opciones, errores
