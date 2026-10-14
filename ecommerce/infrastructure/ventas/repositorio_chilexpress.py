"""Adaptador Django (PostgreSQL) del puerto RepositorioCredencialesChilexpress, con las llaves cifradas."""

import logging

from ecommerce.application.chilexpress import RepositorioCredencialesChilexpress
from ecommerce.domain.logistica import CredencialesChilexpress

from .cifrado import CredencialesIlegibles, cifrar_json, descifrar_json
from .models import ProveedorEnvio

logger = logging.getLogger(__name__)

CODIGO = 'CHILEXPRESS'


class DjangoRepositorioCredencialesChilexpress(RepositorioCredencialesChilexpress):
    def obtener(self):
        fila = ProveedorEnvio.objects.filter(codigo=CODIGO).first()
        if fila is None:
            return CredencialesChilexpress()
        try:
            datos = descifrar_json(fila.credenciales_cifradas)
        except CredencialesIlegibles:
            # Sin llaves no se cotiza: el admin debe volver a cargarlas
            logger.error('No se pudieron descifrar las credenciales de Chilexpress: ¿cambió CLAVE_CIFRADO_CREDENCIALES?')
            return CredencialesChilexpress()
        nombres = {nombre for nombre, _, _ in CredencialesChilexpress.CAMPOS}
        return CredencialesChilexpress(**{k: v for k, v in datos.items() if k in nombres})

    def guardar(self, credenciales):
        datos = {nombre: getattr(credenciales, nombre) for nombre, _, _ in CredencialesChilexpress.CAMPOS}
        ProveedorEnvio.objects.update_or_create(codigo=CODIGO, defaults={
            'credenciales_cifradas': cifrar_json({k: v for k, v in datos.items() if v}),
        })
