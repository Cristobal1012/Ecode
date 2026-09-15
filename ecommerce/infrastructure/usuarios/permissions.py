import jwt
from django.conf import settings
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import AuthenticationFailed, NotAuthenticated

class IsEmprendedor(BasePermission):
    """
    Permiso de DRF que intercepta la petición, decodifica el JWT del header
    y verifica que el rol del usuario sea 'Emprendedor'.
    """
    def has_permission(self, request, view):
        # aca extraemos el el header de autoriacion y verificamos que sea un token JWT válido
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise NotAuthenticated('No se proporcionó un token de autenticación.')
        # separamos la palabra Bearer del token real
        token = auth_header.split(' ')[1]
        
        try:
            # en esta parte decodificar el JWT usando la clave secreta
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            
            # aca verifico el rol dentro del payload
            rol = payload.get('rol')
            if rol == 'Emprendedor':
               
                request.jwt_payload = payload
                return True
                
            return False
            
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('El token ha expirado. Por favor, inicie sesion nuevamente.')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Token invalido o corrupto.')