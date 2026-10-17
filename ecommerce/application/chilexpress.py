"""Casos de uso de las credenciales de Chilexpress: el admin las carga desde el panel (RNF-03, RF-02.3)."""

from abc import ABC, abstractmethod

from ecommerce.domain.logistica import CredencialesChilexpress


class RepositorioCredencialesChilexpress(ABC):
    """Puerto de salida: las llaves de Chilexpress, guardadas cifradas."""

    @abstractmethod
    def obtener(self) -> CredencialesChilexpress:
        """Devuelve credenciales vacías si aún no se configuraron."""
        raise NotImplementedError

    @abstractmethod
    def guardar(self, credenciales: CredencialesChilexpress) -> None:
        raise NotImplementedError


class ConfigurarChilexpress:
    """RNF-03: el admin carga o reemplaza las llaves de Chilexpress desde el panel.

    Se puede guardar incompleto; sin la llave del cotizador no se puede cotizar ni generar la OT.
    """

    def __init__(self, repositorio: RepositorioCredencialesChilexpress):
        self.repositorio = repositorio

    def ejecutar(self, datos: dict[str, str]) -> CredencialesChilexpress:
        credenciales = self.repositorio.obtener().con_cambios(datos)
        self.repositorio.guardar(credenciales)
        return credenciales
