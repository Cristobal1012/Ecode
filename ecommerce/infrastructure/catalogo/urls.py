from django.urls import path
from .views import (
    ProductoDetailView,
    ProductoImagenDetailView,
    ProductoImagenListCreateView,
    ProductoListCreateView,
)

catalogo_urlpatterns = [
    path('productos/', ProductoListCreateView.as_view(), name='lista_productos'),
    
    path('productos/<str:id>/', ProductoDetailView.as_view(), name='detalle_producto'),
    path('productos/<str:id>/imagenes/', ProductoImagenListCreateView.as_view(), name='imagenes_producto'),
    path('productos/<str:id>/imagenes/<str:imagen_id>/', ProductoImagenDetailView.as_view(), name='detalle_imagen_producto'),
]
