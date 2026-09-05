from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager

class UsuarioManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('El email es obligatorio')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('rol', 'ADMIN')
        return self.create_user(email, password, **extra_fields)

class Usuario(AbstractBaseUser, PermissionsMixin):
    ROLES = [
        ('ADMIN', 'Administrador / Vendedor'),
        ('COMPRADOR', 'Comprador'),
    ]

    nombre = models.CharField(max_length=255)
    apellido_paterno = models.CharField(max_length=255)
    apellido_materno = models.CharField(max_length=255)
    email = models.EmailField(unique=True, max_length=255)
    
    # --- NUEVO CAMPO PARA CELULAR ---
    # Usamos max_length=20 para soportar códigos de país (ej: +569...)
    telefono = models.CharField(max_length=20, blank=True, null=True)
    
    rol = models.CharField(max_length=20, choices=ROLES, default='COMPRADOR')
    google_sso_id = models.CharField(max_length=255, blank=True, null=True)
    acepta_cookies = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UsuarioManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['nombre', 'apellido_paterno', 'apellido_materno']

    def __str__(self):
        return f"{self.nombre} {self.apellido_paterno} ({self.rol}) - {self.email}"