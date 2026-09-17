from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .documents import Producto
from .serializers import ProductoSerializer

class ProductoListCreateView(APIView):
    def get(self, request):
        productos = Producto.objects.all()
        serializer = ProductoSerializer(productos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ProductoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProductoDetailView(APIView):
    def get_object(self, id):
        try:
            return Producto.objects.get(id=id)
        except Producto.DoesNotExist:
            return None
        except Exception: 
            return None

    def get(self, request, id):
        producto = self.get_object(id)
        if not producto:
            return Response({"error": "Producto no encontrado"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProductoSerializer(producto)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, id):
        producto = self.get_object(id)
        if not producto:
            return Response({"error": "Producto no encontrado"}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = ProductoSerializer(producto, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, id):
        producto = self.get_object(id)
        if not producto:
            return Response({"error": "Producto no encontrado"}, status=status.HTTP_404_NOT_FOUND)
        
        producto.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)