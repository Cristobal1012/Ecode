"""Adaptador MongoDB del puerto CatalogoVariantes."""

from decimal import Decimal

from mongoengine.errors import ValidationError as MongoValidationError

from ecommerce.application.ventas import CatalogoVariantes
from ecommerce.domain.ventas import VarianteCatalogo

from .documents import Producto


class MongoCatalogoVariantes(CatalogoVariantes):
    def obtener(self, producto_id, sku):
        try:
            producto = Producto.objects(id=producto_id).first()
        except MongoValidationError:
            # ID con formato inválido: se trata igual que un producto inexistente
            return None
        if producto is None:
            return None

        variante = next((v for v in producto.variantes if str(v.sku) == str(sku)), None)
        if variante is None:
            return None

        return VarianteCatalogo(
            # Mismo nombre que muestra el carrito del frontend
            nombre=f'{producto.nombre} - {variante.sku}',
            precio=Decimal(variante.precio),
            stock=int(variante.stock),
            disponible=bool(producto.activo and producto.publicado),
        )
