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
    # NUEVO ENDPOINT LOGÍSTICO CHILEXPRESS
    # Ruta resultante: POST /api/ventas/logistica/cotizar/
    path('logistica/cotizar/', views.CotizacionEnvioView.as_view(), name='cotizar-envio'),
    path('logistica/comunas/', views.ComunasCoberturaAPIView.as_view(), name='comunas-cobertura'),
    path('logistica/sucursales/', views.SucursalesChilexpressAPIView.as_view(), name='sucursales-chilexpress'),
    
    # Ruta resultante: POST /api/ventas/checkout/
    path('checkout/', views.CheckoutAPIView.as_view(), name='checkout'),
    
    # NUEVA RUTA PARA EL RETORNO DE TRANSBANK
    # Ruta resultante: GET/POST /api/ventas/transbank/retorno/
    path('transbank/retorno/', views.TransbankRetornoView.as_view(), name='transbank_retorno'),
    
    # Ruta resultante: GET /api/ventas/dashboard/
    path('dashboard/', views.DashboardOperativoView.as_view(), name='dashboard'),
    
    # --- NUEVA RUTA: MÉTRICAS DEL DASHBOARD ---
    # Ruta resultante: GET /api/ventas/dashboard/metricas/
    path('dashboard/metricas/', views.DashboardMetricasView.as_view(), name='dashboard_metricas'),
    
    path('checkout/reglas/', views.ReglasCheckoutView.as_view(), name='checkout-reglas'),

    path('tracking/', views.SeguimientoEnvioView.as_view(), name='tracking-envio'),
    
    # RUTA PARA EL CARRITO: GET/POST /api/ventas/carrito/
    path('carrito/', views.CarritoAPIView.as_view(), name='carrito-usuario'),
    
    path('mis-pedidos/', views.HistorialPedidosAPIView.as_view(), name='mis-pedidos'),
    
    # --- RUTAS PARA DIRECCIONES DE ENVÍO ---
    # Ruta resultante: GET/POST /api/ventas/direcciones/
    path('direcciones/', views.DireccionEnvioListCreateView.as_view(), name='direcciones-list-create'),
    # Ruta resultante: GET/PUT/PATCH/DELETE /api/ventas/direcciones/<id>/
    path('direcciones/<int:pk>/', views.DireccionEnvioDetailView.as_view(), name='direcciones-detail'),
    
    # Ruta para descargar la etiqueta de Chilexpress
    path('ordenes/<int:orden_id>/etiqueta/', views.DescargarEtiquetaView.as_view(), name='descargar-etiqueta'),

    # NUEVAS RUTAS: administración de órdenes (solo administradores)
    # Ruta resultante: GET /api/ventas/admin/ordenes/
    path('admin/ordenes/', views.AdminOrdenCompraListView.as_view(), name='admin-ordenes-list'),
    # Ruta resultante: PATCH /api/ventas/admin/ordenes/<pk>/estado/
    path('admin/ordenes/<int:pk>/estado/', views.AdminOrdenCompraPatchView.as_view(), name='admin-ordenes-patch'),
]

urlpatterns = configuracion_urlpatterns + ventas_urlpatterns