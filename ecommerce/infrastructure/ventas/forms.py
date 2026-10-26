"""Datos públicos de pago en el admin; las credenciales se gestionan en el panel."""
from django import forms
from django.core.exceptions import ValidationError

from ecommerce.domain.medios_pago import definicion_medio

from .models import MedioPago


def campos_publicos(codigo):
    try:
        return {campo.nombre: campo for campo in definicion_medio(codigo).campos if not campo.secreto}
    except ValueError:
        return {}


def dato_publico_admitido(nombre, valor, campos):
    campo = campos.get(nombre)
    return (campo is not None and isinstance(valor, str)
            and (not valor or not campo.opciones or valor in campo.opciones))


def datos_publicos_admitidos(datos, campos):
    return isinstance(datos, dict) and all(
        dato_publico_admitido(nombre, valor, campos) for nombre, valor in datos.items()
    )


class DatosPublicosField(forms.JSONField):
    def prepare_value(self, value):
        # Evitar que Django muestre secretos, incluso si el JSON recibido está mal formado.
        # Solo se filtra la presentación; clean_datos valida la entrada original.
        publicos = {nombre: valor for nombre, valor in value.items()
                    if dato_publico_admitido(nombre, valor, self.campos)} if isinstance(value, dict) else {}
        return super().prepare_value(publicos)

    def to_python(self, value):
        return {} if value in self.empty_values else super().to_python(value)


class MedioPagoAdminForm(forms.ModelForm):
    datos = DatosPublicosField(required=False)

    class Meta:
        model = MedioPago
        fields = ('codigo', 'habilitado', 'datos')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Un código manipulado no debe cambiar el proveedor de un registro existente.
        codigo = self.instance.codigo if self.instance.pk else (
            self.data.get('codigo') if self.is_bound else self.initial.get('codigo', self.instance.codigo)
        )
        self.campos_publicos = campos_publicos(codigo)
        self.fields['datos'].campos = self.campos_publicos
        self.datos_anteriores_invalidos = bool(
            self.instance.pk and not datos_publicos_admitidos(self.instance.datos, self.campos_publicos)
        )
        nombres = ', '.join(self.campos_publicos) or 'ninguno (use {})'
        self.fields['datos'].help_text = f'Campos públicos admitidos: {nombres}. Las credenciales se gestionan en el panel.'
        if self.datos_anteriores_invalidos:
            self.fields['datos'].help_text += (
                ' Este registro contiene datos no admitidos. Su guardado está bloqueado;'
                ' requiere una regularización individual antes de editarlo aquí.'
            )

    def clean_datos(self):
        datos = self.cleaned_data['datos']
        if not datos_publicos_admitidos(datos, self.campos_publicos):
            raise ValidationError('Use solo los campos públicos admitidos, con valores de texto y opciones válidas.')
        return datos

    def clean(self):
        cleaned = super().clean()
        if self.datos_anteriores_invalidos:
            # No borrar ni cifrar datos antiguos automáticamente al editar otros campos.
            raise ValidationError('El registro contiene datos no admitidos. No se guardó ningún cambio.')
        return cleaned
