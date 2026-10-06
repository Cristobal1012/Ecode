import os
import django

# Configurar entorno de Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_project.settings')
django.setup()

from ecommerce.infrastructure.ventas.models import OrdenCompra, ConfiguracionGlobal
from ecommerce.infrastructure.ventas.adapters.logistica import ProveedorLogisticoAdapter

def simular_pago_y_ot():
    try:
        orden = OrdenCompra.objects.get(id=19)
        orden.estado = 'PAGADO'
        orden.save()
        print(f"Orden {orden.id} marcada como PAGADO.")

        if orden.proveedor_logistico == 'CHILEXPRESS':
            config = ConfiguracionGlobal.objects.first()
            catalogo = ProveedorLogisticoAdapter._obtener_catalogo_dinamico()
            
            comuna_origen_nombre = config.comuna_origen if config and config.comuna_origen else 'SANTIAGO'
            codigo_origen = catalogo.get(comuna_origen_nombre.upper(), "PUDA")
            
            comuna_destino_nombre = orden.direccion_envio_snapshot.get('comuna', '')
            codigo_destino = catalogo.get(comuna_destino_nombre.upper(), "PROV")

            datos_envio = {
                "origen_codigo": codigo_origen,
                "destino_codigo": codigo_destino,
                "calle": orden.direccion_envio_snapshot.get('calle', 'SIN CALLE'),
                "numero": orden.direccion_envio_snapshot.get('numero', '0'),
                "supplement": orden.direccion_envio_snapshot.get('dpto_casa', ''),
                "nombre_destinatario": getattr(orden.usuario, 'get_full_name', lambda: 'Cliente E-commerce')() if orden.usuario else 'Cliente Invitado',
                "telefono": "999999999",
                "email": orden.email_invitado or (orden.usuario.email if orden.usuario else 'cliente@correo.cl'),
                "peso": "1",
                "alto": "10",
                "ancho": "10",
                "largo": "10",
                "referencia": f"ORD-{orden.id}",
                "valor_declarado": int(orden.total_final)
            }

            respuesta_chx = ProveedorLogisticoAdapter.generar_orden_transporte(datos_envio)
            
            if respuesta_chx.get('exito'):
                orden.id_transaccion_pasarela = f"SIMULADO-TBK | OT: {respuesta_chx.get('numero_ot')}"
                orden.save()
                print(f"¡ÉXITO! Orden de Transporte generada: #{respuesta_chx.get('numero_ot')}")
            else:
                print(f"Fallo al generar OT en Chilexpress: {respuesta_chx.get('error')}")
    except Exception as e:
        print(f"Ocurrió un error: {str(e)}")

if __name__ == '__main__':
    simular_pago_y_ot()