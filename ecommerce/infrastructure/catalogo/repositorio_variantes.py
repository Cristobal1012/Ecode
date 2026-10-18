"""Adaptadores MongoDB de los puertos CatalogoVariantes e InventarioVariantes."""

from decimal import Decimal

from mongoengine.errors import ValidationError as MongoValidationError

from ecommerce.application.ventas import CatalogoVariantes, InventarioVariantes
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

        # Si la variante tiene precio_oferta válido (> 0 y menor al precio normal), se usa como precio vigente
        tiene_oferta = (
            getattr(variante, 'precio_oferta', None) is not None
            and variante.precio_oferta > 0
            and (variante.precio is None or variante.precio_oferta < variante.precio)
        )
        precio_vigente = variante.precio_oferta if tiene_oferta else variante.precio

        return VarianteCatalogo(
            # Mismo nombre que muestra el carrito del frontend
            nombre=f'{producto.nombre} - {variante.sku}',
            precio=Decimal(precio_vigente),
            stock=int(variante.stock),
            disponible=bool(producto.activo and producto.publicado),
        )


class MongoInventarioVariantes(InventarioVariantes):
    def descontar(self, producto_id, sku, cantidad):
        return Producto.reducir_stock_variante(producto_id, sku, cantidad)

    def reponer(self, producto_id, sku, cantidad):
        Producto.reponer_stock_variante(producto_id, sku, cantidad)