from django.contrib import admin
from .models import OrdenCompra, ConfiguracionGlobal, MedioPago, Promocion

admin.site.register(OrdenCompra)
admin.site.register(ConfiguracionGlobal)
admin.site.register(MedioPago)
admin.site.register(Promocion)