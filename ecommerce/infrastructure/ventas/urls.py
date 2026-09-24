from django.urls import path
from . import views
from .views import ConfiguracionNegocioView

configuracion_urlpatterns = [
    path(
        'api/configuracion/',
        views.ConfiguracionGlobalAPIView.as_view(),
        name='configuracion-global',
    ),
]

ventas_urlpatterns = [
    path('api/checkout/', views.CheckoutAPIView.as_view(), name='checkout'),

    # esto es para el dashboard
    path('api/dashboard/', views.DashboardOperativoView.as_view(), name='dashboard'),

    path('configuracion/', ConfiguracionNegocioView.as_view(), name='configuracion_negocio'),
]
