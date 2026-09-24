from django.urls import path
from . import views

configuracion_urlpatterns = [
    path(
        'api/configuracion/',
        views.ConfiguracionGlobalAPIView.as_view(),
        name='configuracion-global',
    ),
]

ventas_urlpatterns = [
    path('api/checkout/', views.CheckoutAPIView.as_view(), name='checkout'),
    path('api/dashboard/', views.DashboardOperativoView.as_view(), name='dashboard'),
    path('api/configuracion/negocio/', views.ConfiguracionNegocioView.as_view(), name='configuracion-negocio'),
]

# Unión de rutas para que Django las registre todas
urlpatterns = configuracion_urlpatterns + ventas_urlpatterns