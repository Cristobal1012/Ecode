"""Adaptadores MongoDB de los puertos CatalogoVariantes, InventarioVariantes, NombresProductos y StockCatalogo."""

from decimal import Decimal

from bson.errors import InvalidId
from mongoengine.errors import ValidationError as MongoValidationError

from ecommerce.application.cotizaciones import NombresProductos
from ecommerce.application.dashboard import StockCatalogo, VariantePocoStock
from ecommerce.application.ventas import CatalogoVariantes, InventarioVariantes
from ecommerce.domain.logistica import MedidasEnvio
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
            medidas=MedidasEnvio(*(Decimal(str(getattr(variante, campo) or 0))
                                   for campo in ('peso_kg', 'alto_cm', 'ancho_cm', 'largo_cm'))),
        )


class MongoInventarioVariantes(InventarioVariantes):
    def descontar(self, producto_id, sku, cantidad):
        return Producto.reducir_stock_variante(producto_id, sku, cantidad)

    def reponer(self, producto_id, sku, cantidad):
        Producto.reponer_stock_variante(producto_id, sku, cantidad)


class MongoNombresProductos(NombresProductos):
    """Para cotizar: solo productos activos y publicados (un borrador no existe para el público)."""

    def nombre(self, producto_id):
        try:
            producto = Producto.objects(id=producto_id, activo=True, publicado=True).only('nombre').first()
        except (MongoValidationError, InvalidId):
            return None
        return producto.nombre if producto else None


class MongoStockCatalogo(StockCatalogo):
    """Para "Para hoy" del dashboard: las variantes de productos activos (publicados o en borrador) con poco stock.
    Un producto dado de baja ya no se vende: no avisa."""

    def con_poco_stock(self, umbral):
        productos = Producto.objects(activo=True, variantes__stock__lte=umbral).only('nombre', 'variantes')
        return [
            VariantePocoStock(
                producto_id=str(producto.id), producto=producto.nombre, sku=str(variante.sku),
                detalle=' · '.join(f'{nombre}: {valor}' for nombre, valor in (variante.atributos_variables or {}).items()),
                stock=int(variante.stock or 0),
            )
            for producto in productos for variante in producto.variantes if int(variante.stock or 0) <= umbral
        ]
