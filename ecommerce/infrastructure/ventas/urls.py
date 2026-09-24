from django.urls import path
from . import views
from .views import ConfiguracionNegocioView

ventas_urlpatterns = [
    path('api/checkout/', views.CheckoutAPIView.as_view(), name='checkout'),

    # esto es para el dashboard
    path('api/dashboard/', views.DashboardOperativoView.as_view(), name='dashboard'),

    path('configuracion/', ConfiguracionNegocioView.as_view(), name='configuracion_negocio'),
]
