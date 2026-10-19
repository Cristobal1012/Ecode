from django.contrib import admin
from .models import OrdenCompra, ConfiguracionGlobal, MedioPago, Promocion


@admin.register(OrdenCompra)
class OrdenCompraAdmin(admin.ModelAdmin):
    # El panel aplica las transiciones, el inventario y los correos mediante el caso de uso.
    # La marca de stock también se protege: determina cuánto reponer al cancelar.
    readonly_fields = ('estado', 'stock_descontado')


admin.site.register(ConfiguracionGlobal)
admin.site.register(MedioPago)
admin.site.register(Promocion)
