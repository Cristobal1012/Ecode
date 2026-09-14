from google.oauth2 import id_token
from google.auth.transport import requests
from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed

class GoogleAuthService:
    @staticmethod
    def verificar_token(token: str) -> dict:
        try:
            # Si tienes configurado GOOGLE_CLIENT_ID en settings.py se valida contra él.
            client_id = getattr(settings, 'GOOGLE_CLIENT_ID', None)
            
            payload = id_token.verify_oauth2_token(
                token, 
                requests.Request(), 
                audience=client_id
            )
            return payload
        except ValueError as exc:
            raise AuthenticationFailed(f"Token de Google inválido o expirado: {str(exc)}")