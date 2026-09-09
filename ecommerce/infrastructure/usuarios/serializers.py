from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()

class RegistroUsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, 
        required=True, 
        validators=[validate_password]
    )
    password2 = serializers.CharField(
        write_only=True, 
        required=True
    )

    class Meta:
        model = User
        fields = (
            'id', 
            'email', 
            'nombre', 
            'apellido_paterno', 
            'apellido_materno', 
            'telefono', 
            'rol', 
            'acepta_cookies', 
            'password', 
            'password2'
        )
        extra_kwargs = {
            'email': {'required': True},
            'nombre': {'required': True},
            'apellido_paterno': {'required': True},
            'apellido_materno': {'required': False},
            'telefono': {'required': False},
            'rol': {'required': False},
            'acepta_cookies': {'required': False},
        }

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Las contraseñas no coinciden."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = User.objects.create_user(
            password=password,
            **validated_data
        )
        return user