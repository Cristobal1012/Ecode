from django.urls import path
from .views import ProductoListCreateView, ProductoDetailView

catalogo_urlpatterns = [
    path('productos/', ProductoListCreateView.as_view(), name='lista_productos'),
    
    path('productos/<str:id>/', ProductoDetailView.as_view(), name='detalle_producto'),
]