from django.urls import path
from . import views
from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import RegistroView, GoogleLoginView
usuarios_urlpatterns = [
    #Endpoint para el registro de usuarios
    path('registro/', RegistroView.as_view(), name='registro'),
    #acceso a los tokens JWT
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    #Endpoint para el login con Google
    path('google/', GoogleLoginView.as_view(), name='google_login'),
]