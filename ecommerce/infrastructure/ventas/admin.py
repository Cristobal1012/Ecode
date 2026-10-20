from django.contrib import admin
from .forms import MedioPagoAdminForm
from .models import OrdenCompra, ConfiguracionGlobal, MedioPago, Promocion


@admin.register(OrdenCompra)
class OrdenCompraAdmin(admin.ModelAdmin):
    # El panel aplica las transiciones, el inventario y los correos mediante el caso de uso.
    # La marca de stock también se protege: determina cuánto reponer al cancelar.
    readonly_fields = ('estado', 'stock_descontado')
    campos_editables = ('nombre_destinatario', 'telefono_destinatario', 'direccion_envio_snapshot')

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return self.readonly_fields
        return tuple(campo.name for campo in self.model._meta.fields if campo.name not in self.campos_editables)

    def save_model(self, request, obj, form, change):
        if change:
            # A concurrent panel update must not be overwritten by a recipient correction.
            obj.save(update_fields=self.campos_editables)
        else:
            super().save_model(request, obj, form, change)


admin.site.register(ConfiguracionGlobal)


@admin.register(MedioPago)
class MedioPagoAdmin(admin.ModelAdmin):
    # Las credenciales se gestionan desde el panel; tampoco se muestra el texto cifrado.
    form = MedioPagoAdminForm
    fields = ('codigo', 'habilitado', 'datos', 'actualizado')
    readonly_fields = ('actualizado',)
    list_display = ('codigo', 'habilitado', 'actualizado')

    def get_readonly_fields(self, request, obj=None):
        return (*self.readonly_fields, 'codigo') if obj is not None else self.readonly_fields

    def save_model(self, request, obj, form, change):
        if change:
            # Do not rewrite credentials, including a concurrent update from the panel.
            obj.save(update_fields=('habilitado', 'datos', 'actualizado'))
        else:
            super().save_model(request, obj, form, change)


admin.site.register(Promocion)
