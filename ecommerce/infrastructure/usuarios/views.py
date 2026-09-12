from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import RegistroUsuarioSerializer, GoogleAuthSerializer
from .services import GoogleAuthService

User = get_user_model()

class RegistroView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistroUsuarioSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)

            return Response({
                "message": "Usuario registrado exitosamente.",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "nombre": user.nombre,
                    "rol": user.rol
                },
                "tokens": {
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = serializer.validated_data['id_token']
        payload = GoogleAuthService.verificar_token(token)

        email = payload.get('email')
        google_id = payload.get('sub')
        nombre = payload.get('given_name', 'Usuario')
        apellido = payload.get('family_name', 'Google')

        if not email:
            return Response(
                {"detail": "La cuenta de Google no tiene un email público asociado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.filter(email=email).first()

        if not user:
            user = User.objects.create_user(
                email=email,
                nombre=nombre,
                apellido_paterno=apellido,
                apellido_materno="",
                rol='COMPRADOR',
                google_sso_id=google_id,
                password=None
            )
            user.set_unusable_password()
            user.save()
        else:
            if not user.google_sso_id:
                user.google_sso_id = google_id
                user.save(update_fields=['google_sso_id'])

        refresh = RefreshToken.for_user(user)

        return Response({
            "message": "Autenticación Google exitosa.",
            "user": {
                "id": user.id,
                "email": user.email,
                "nombre": user.nombre,
                "rol": user.rol,
                "google_sso_id": user.google_sso_id
            },
            "tokens": {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)

class UsuarioActualAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'email': request.user.email,
            'rol': request.user.rol,
            'nombre': request.user.nombre,
        })