from rest_framework import generics
from .models import OrdenCompra
from .permissions import CanCheckout
from .serializers import OrdenCompraSerializer


# Create your views here.
class CheckoutAPIView(generics.CreateAPIView):
    queryset = OrdenCompra.objects.all()
    serializer_class = OrdenCompraSerializer
    permission_classes = [CanCheckout]
