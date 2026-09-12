"""DRF adapter for the explicit administrator/seller role."""

from rest_framework.permissions import BasePermission


class IsAdministrador(BasePermission):
    """Require an active ADMIN, regardless of staff and superuser flags."""

    message = 'Se requiere el rol ADMIN para realizar esta operación.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and user.rol == 'ADMIN'
        )

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
import jwt
from django.conf import settings
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import AuthenticationFailed

class IsEmprendedor(BasePermission):
    """
    Permiso de DRF que intercepta la petición, decodifica el JWT del header
    y verifica que el rol del usuario sea 'Emprendedor'.
    """
    def has_permission(self, request, view):
        # aca extraemos el el header de autoriacion y verificamos que sea un token JWT válido
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return False

        # separamos la palabra Bearer del token real
        token = auth_header.split(' ')[1]
        
        try:
            # en esta parte decodificar el JWT usando la clave secreta
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            
            # aca verifico el rol dentro del payload
            rol = payload.get('rol')
            if rol == 'Emprendedor':
               #Guardamos el payload en el request para que la vista pueda saber que emprendedor consulta el panel
                request.jwt_payload = payload
                return True
                
            return False
            
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('El token ha expirado. Por favor, inicie sesion nuevamente.')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Token invalido o corrupto.')
