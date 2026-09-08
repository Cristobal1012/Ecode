from rest_framework.views import APIView
from rest_framework.response import Response
from ecommerce.infrastructure.usuarios.permissions import IsEmprendedor

class CheckoutAPIView(APIView):
    def post(self, request):
        return Response({"mensaje": "Módulo de checkout en construcción"})

#esta es la vista para los emprendedores que quieran su dashboar, osea su panel de cotrol
class DashboardOperativoView(APIView):
    permission_classes = [IsEmprendedor]

    def get(self, request):
        emprendedor_id = request.jwt_payload.get('user_id')
        return Response({
            "mensaje": "bienvendo al panel de Control",
            "emprendedor_id": emprendedor_id
        })