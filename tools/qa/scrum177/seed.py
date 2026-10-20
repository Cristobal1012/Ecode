"""Small, fictitious fixture; refuses to overwrite existing QA data."""
import os
from datetime import datetime, timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from mongoengine.connection import get_db
from PIL import Image

from ecommerce.domain.medios_pago import CodigoMedioPago, MedioPagoConfigurado
from ecommerce.infrastructure.catalogo.documents import Producto, Variante
from ecommerce.infrastructure.ventas.models import (
    ConfiguracionGlobal, DetalleOrden, MedioPago, OrdenCompra, PaginaLegal,
)
from ecommerce.infrastructure.ventas.repositorio_medios_pago import DjangoRepositorioMediosPago
from tools.qa.scrum177.prepare import targets


def seed():
    destination = targets()
    if (settings.DATABASES['default']['NAME'] != destination['name']
            or get_db().name != destination['name']):
        raise ValueError('Fixture requires the SCRUM-177 QA databases.')
    if (get_user_model().objects.exists() or ConfiguracionGlobal.objects.exists()
            or OrdenCompra.objects.exists() or MedioPago.objects.exists() or Producto.objects.count()):
        raise ValueError('Fixture requires empty QA data; choose a new QA177_RUN_ID.')
    password = os.environ.get('QA177_PASSWORD', '')
    if len(password) < 12:
        raise ValueError('Set QA177_PASSWORD to a fictitious password of at least 12 characters.')
    get_user_model().objects.create_superuser(
        'qa177.admin@example.test', password, nombre='QA', apellido_paterno='Admin',
        apellido_materno='Ficticio', rol='ADMIN',
    )
    get_user_model().objects.create_user(
        'qa177.buyer@example.test', password, nombre='QA', apellido_paterno='Comprador',
        apellido_materno='Ficticio',
    )
    ConfiguracionGlobal.objects.create(
        pk=1, nombre_tienda='Ecode QA 177', modo_autenticacion='MIXTO',
        retiro_en_local_activo=True, calle_origen='Calle QA', numero_origen='177',
        comuna_origen='Santiago', google_analytics_id='', meta_pixel_id='',
    )
    for kind in ('TERMINOS', 'PRIVACIDAD'):
        PaginaLegal.objects.create(tipo_pagina=kind, titulo=kind + ' QA', publicada=True,
                                  contenido='<p>Contenido ficticio de pruebas locales.</p>')
    repo = DjangoRepositorioMediosPago()
    repo.guardar(MedioPagoConfigurado(CodigoMedioPago.TRANSBANK, False, {
        'ambiente': 'INTEGRACION', 'commerce_code': '597012345678', 'api_key': 'qa177-key-ficticia',
    }))
    repo.guardar(MedioPagoConfigurado(CodigoMedioPago.MERCADO_PAGO, False, {
        'access_token': 'qa177-token-ficticio', 'webhook_secret': 'qa177-firma-ficticia',
    }))
    repo.guardar(MedioPagoConfigurado(CodigoMedioPago.TRANSFERENCIA, True, {
        'banco': 'Banco QA', 'tipo_cuenta': 'Cuenta vista', 'numero_cuenta': '12345678',
        'rut_titular': '11.111.111-1', 'nombre_titular': 'Tienda QA', 'email': 'pagos@example.test',
        'verificar_con_linkify': 'No', 'linkify_secret': 'qa177-linkify-ficticio',
    }))
    # Deliberately contaminated QA row for the legacy-data regression. Never real credentials.
    MedioPago.objects.filter(codigo='MERCADO_PAGO').update(datos={'access_token': 'qa177-legacy-ficticio'})
    media = settings.QA_ROOT / 'media'
    media.mkdir(parents=True, exist_ok=True)
    Image.new('RGB', (360, 240), '#69a68e').save(media / 'qa177.png')
    products = []
    for i in range(30):
        products.append(Producto(
            nombre=f'Producto QA177 {i:02}', categoria='Pruebas' if i < 20 else 'Accesorios',
            activo=True, publicado=True, descripcion='Producto ficticio para QA.',
            fecha_creacion=datetime.now(timezone.utc), atributos_globales={'color': 'Verde'},
            imagenes=['http://localhost:8000/media/qa177.png'],
            variantes=[Variante(sku=f'QA177-{i:02}-S', precio=10000 + i * 500, stock=5),
                       Variante(sku=f'QA177-{i:02}-M', precio=12000 + i * 500, stock=8)],
        ).save())
    for i, state in enumerate(('PENDIENTE', 'PAGADO', 'PENDIENTE')):
        order = OrdenCompra.objects.create(
            email_invitado=f'pedido{i + 1}@example.test', metodo_pago='TRANSFERENCIA', estado=state,
            direccion_envio_snapshot={'comuna': 'Santiago', 'calle': 'Calle QA', 'calle_numero': '177'},
            nombre_destinatario='Persona QA', telefono_destinatario='+56912345678',
            proveedor_logistico='RETIRO_LOCAL', subtotal=20000 + i * 1000, costo_envio=0,
            total_final=20000 + i * 1000, stock_descontado=state == 'PAGADO',
            requiere_revision=i == 2, motivo_revision='Revisión ficticia QA' if i == 2 else '',
        )
        DetalleOrden.objects.create(orden=order, producto_mongo_id=str(products[i].pk),
                                  variante_sku=f'QA177-{i:02}-S', nombre_producto_snapshot=products[i].nombre,
                                  precio_unitario_snapshot=10000 + i * 500, cantidad=2)
        if state == 'PAGADO':
            products[i].variantes[0].stock = 3
            products[i].save()
    print('QA ready: 2 users, 30 products, 3 orders; payment and mail providers are local test data.')
