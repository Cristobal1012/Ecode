from django.urls import path
from . import views

# Todo lo que esté aquí, Django le pondrá '/api/configuracion/' antes
configuracion_urlpatterns = [
    # Ruta resultante: GET /api/configuracion/ (Pública)
    path('', views.ConfiguracionGlobalAPIView.as_view(), name='configuracion-global'),
    
    # Ruta resultante: GET/PATCH /api/configuracion/negocio/ (Administrador)
    path('negocio/', views.ConfiguracionNegocioView.as_view(), name='configuracion-negocio'),
]

# Todo lo que esté aquí, Django le pondrá '/api/ventas/' antes
ventas_urlpatterns = [
    path('cotizaciones/', views.CotizacionesAPIView.as_view(), name='cotizaciones'),
    # Ruta resultante: POST /api/ventas/checkout/
    path('checkout/', views.CheckoutAPIView.as_view(), name='checkout'),
    
    # Ruta resultante: GET /api/ventas/dashboard/
    path('dashboard/', views.DashboardOperativoView.as_view(), name='dashboard'),

    path('checkout/reglas/', views.ReglasCheckoutView.as_view(), name='checkout-reglas'),

    path('tracking/', views.SeguimientoEnvioView.as_view(), name='tracking-envio'),
    # NUEVA RUTA PARA EL CARRITO: GET/POST /api/ventas/carrito/
    path('carrito/', views.CarritoAPIView.as_view(), name='carrito-usuario'),
    path('mis-pedidos/', views.HistorialPedidosAPIView.as_view(), name='mis-pedidos'),


    # NUEVAS RUTAs: administracion de ordenes que seria solo para administradores
    # Ruta resultante: GET /api/ventas/admin/ordenes/
    path('admin/ordenes/', views.AdminOrdenCompraListView.as_view(), name='admin-ordenes-list'),
    
    path('admin/ordenes/<int:pk>/estado/', views.AdminOrdenCompraPatchView.as_view(), name='admin-ordenes-patch'),
]

urlpatterns = configuracion_urlpatterns + ventas_urlpatterns
