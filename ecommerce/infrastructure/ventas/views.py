from django.shortcuts import render
from rest_framework import generics
from rest_framework.permissions import AllowAny
from .models import OrdenCompra
from .serializers import OrdenCompraSerializer


# Create your views here.
class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [AllowAny]  #esto permite que cualquier usuario, autenticado o no, pueda acceder a esta vista para realizar el checkout.