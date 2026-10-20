from django.contrib import admin
from .models import OrdenCompra, ConfiguracionGlobal, MedioPago, Promocion


@admin.register(OrdenCompra)
class OrdenCompraAdmin(admin.ModelAdmin):
    # El panel aplica las transiciones, el inventario y los correos mediante el caso de uso.
    # La marca de stock también se protege: determina cuánto reponer al cancelar.
    readonly_fields = ('estado', 'stock_descontado')


admin.site.register(ConfiguracionGlobal)


@admin.register(MedioPago)
class MedioPagoAdmin(admin.ModelAdmin):
    # Las credenciales se gestionan desde el panel; tampoco se muestra el texto cifrado.
    fields = ('codigo', 'habilitado', 'datos', 'actualizado')
    readonly_fields = ('actualizado',)
    list_display = ('codigo', 'habilitado', 'actualizado')


admin.site.register(Promocion)
