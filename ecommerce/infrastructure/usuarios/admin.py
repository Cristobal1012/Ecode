from django.contrib import admin

# Register your models here.
from django.contrib import admin
from django.contrib.auth import get_user_model

# Obtenemos el modelo de usuario que ustedes crearon
User = get_user_model()

# Lo registramos para que aparezca en el panel
admin.site.register(User)