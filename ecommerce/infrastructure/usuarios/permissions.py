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
