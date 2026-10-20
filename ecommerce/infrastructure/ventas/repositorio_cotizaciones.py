"""Adaptador Django (PostgreSQL) del puerto RepositorioCotizaciones."""

from ecommerce.application.cotizaciones import RepositorioCotizaciones

from .models import Cotizacion


class DjangoRepositorioCotizaciones(RepositorioCotizaciones):
    def guardar(self, solicitud):
        return Cotizacion.objects.create(
            nombre=solicitud.nombre, correo=solicitud.correo, telefono=solicitud.telefono,
            producto_id=solicitud.producto_id, producto_nombre=solicitud.producto_nombre,
            descripcion=solicitud.descripcion, cantidad=solicitud.cantidad,
            personalizacion=solicitud.personalizacion, fecha_requerida=solicitud.fecha_requerida,
            datos_empresa=solicitud.empresa.como_dict() if solicitud.empresa else None,
        ).id

    def cambiar_estado(self, cotizacion_id, estado):
        return Cotizacion.objects.filter(id=cotizacion_id).update(estado=estado.value) == 1
