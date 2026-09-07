from django.urls import path
from . import views

ventas_urlpatterns = [
    path('api/checkout/', views.CheckoutAPIView.as_view(), name='checkout'),

    
]