from django.urls import path
from . import views

usuarios_urlpatterns = [
    path('me/', views.UsuarioActualAPIView.as_view(), name='usuario_actual'),

]