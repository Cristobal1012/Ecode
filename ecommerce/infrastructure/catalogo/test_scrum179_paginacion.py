import os
from unittest.mock import MagicMock, patch
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_project.settings')
django.setup()

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from ecommerce.infrastructure.catalogo.documents import Producto
from ecommerce.infrastructure.catalogo.views import (
    FiltrosCatalogoView,
    ProductoListCreateView,
    obtener_filtros_catalogo,
)


class IndicesMongoCatalogoTests(SimpleTestCase):
    """
    Criterio de Aceptación 4 (SCRUM-179):
    Hay índices en MongoDB sobre activo, publicado, categoría y fecha de creación.
    Los atributos usados en filtros también se indexan.
    """

    def test_indices_definidos_en_documento_producto(self):
        indexes = Producto._meta.get('indexes', [])
        # Validar índices individuales
        self.assertIn('activo', indexes)
        self.assertIn('publicado', indexes)
        self.assertIn('categoria', indexes)
        self.assertIn('fecha_creacion', indexes)

        # Validar índices compuestos de alta concurrencia
        self.assertTrue(
            any(('activo', 'publicado', 'categoria') == idx for idx in indexes)
        )
        self.assertTrue(
            any(('activo', 'publicado', '-fecha_creacion') == idx for idx in indexes)
        )
        self.assertTrue(
            any(('activo', 'publicado', 'precio_minimo_vigente') == idx for idx in indexes)
        )
        self.assertTrue(
            any(('activo', 'publicado', '-precio_minimo_vigente') == idx for idx in indexes)
        )

        # Validar cobertura de índices sobre rutas internas y dinámicas de atributos (E03)
        index_specs = Producto._meta.get('index_specs', [])
        campos_indexados = [spec.get('fields') for spec in index_specs if 'fields' in spec]

        self.assertTrue(
            any(
                [('activo', 1), ('publicado', 1), ('categoria', 1), ('atributos_globales.color', 1)] == f
                for f in campos_indexados
            ),
            "Falta índice compuesto sobre activo, publicado, categoria y atributos_globales.color"
        )
        self.assertTrue(
            any([('atributos_globales.$**', 1)] == f for f in campos_indexados),
            "Falta índice comodín sobre atributos_globales.$**"
        )


class PaginacionYFiltrosCatalogoTests(SimpleTestCase):
    """
    Criterios de Aceptación 1, 2, 3 y 5 (SCRUM-179):
    - Paginación de 24 en servidor.
    - Filtros y orden aplicados en el servidor sobre el queryset.
    - Opciones de filtros del servidor para no perder opciones de otras páginas.
    - Soporte de lista completa con ?todos=true para inventario y formulario.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = ProductoListCreateView.as_view()

    @patch('ecommerce.infrastructure.catalogo.views.obtener_filtros_catalogo')
    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_respuesta_paginada_contiene_metadatos_y_resultados(self, mock_objects, mock_filtros):
        mock_filtros.return_value = {'categorias': ['Calzado'], 'atributos': {}}

        # Simular queryset mockeado con 50 productos
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 50
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        request = self.factory.get('/api/catalogo/productos/?page=2&page_size=24')
        response = self.view(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('count', response.data)
        self.assertIn('total_pages', response.data)
        self.assertIn('current_page', response.data)
        self.assertIn('page_size', response.data)
        self.assertIn('results', response.data)
        self.assertIn('filtros', response.data)

        self.assertEqual(response.data['count'], 50)
        self.assertEqual(response.data['total_pages'], 3)
        self.assertEqual(response.data['current_page'], 2)
        self.assertEqual(response.data['page_size'], 24)

    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_parametro_todos_retorna_lista_plana_para_inventario_y_formulario(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_objects.filter.return_value = mock_qs

        with patch('ecommerce.infrastructure.catalogo.views.ProductoSerializer') as mock_serializer:
            mock_serializer.return_value.data = [{'id': '1', 'nombre': 'Prod 1'}]

            request = self.factory.get('/api/catalogo/productos/?todos=true')
            response = self.view(request)

            self.assertEqual(response.status_code, 200)
            self.assertIsInstance(response.data, list)
            self.assertEqual(len(response.data), 1)

    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_filtro_categoria_se_aplica_al_queryset_en_servidor(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 10
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        request = self.factory.get('/api/catalogo/productos/?categoria=Electronica')
        self.view(request)

        # Debe filtrarse en el queryset de MongoDB
        mock_qs.filter.assert_any_call(categoria='Electronica')

    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_filtro_atributos_texto_y_numerico_en_servidor(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 5
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        # 1. Filtro de texto simple
        request_texto = self.factory.get('/api/catalogo/productos/?atributo_color=Azul')
        self.view(request_texto)
        mock_qs.filter.assert_any_call(atributos_globales__color='Azul')

        # 2. Filtro numérico (E02): debe probar tanto string como int para coincidir con DictField
        request_num = self.factory.get('/api/catalogo/productos/?atributo_capacidad_gb=128')
        self.view(request_num)
        mock_qs.filter.assert_any_call(atributos_globales__capacidad_gb__in=['128', 128])

    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_orden_precio_asc_y_desc_en_servidor(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 10
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        # Precio ascendente (E01)
        request_asc = self.factory.get('/api/catalogo/productos/?orden=precio-asc')
        self.view(request_asc)
        mock_qs.order_by.assert_called_with('precio_minimo_vigente')

        # Precio descendente (E01)
        request_desc = self.factory.get('/api/catalogo/productos/?orden=precio-desc')
        self.view(request_desc)
        mock_qs.order_by.assert_called_with('-precio_minimo_vigente')

        # Más nuevos
        request_recientes = self.factory.get('/api/catalogo/productos/?orden=recientes')
        self.view(request_recientes)
        mock_qs.order_by.assert_called_with('-fecha_creacion')

        # Nombre A-Z
        request_nombre = self.factory.get('/api/catalogo/productos/?orden=nombre')
        self.view(request_nombre)
        mock_qs.order_by.assert_called_with('nombre')

    def test_calculo_precio_minimo_vigente_con_ofertas_y_variantes(self):
        """
        Validación directa del requerimiento E01:
        - Oferta mil: normal $10.000 y oferta válida $1.000 -> precio vigente $1.000
        - Normal dos mil: $2.000 -> precio vigente $2.000
        - Desde mil: variantes de $1.000 y $90.000 -> precio vigente $1.000
        """
        from ecommerce.infrastructure.catalogo.documents import Variante

        # Caso 1: Producto con oferta válida
        p_oferta = Producto(
            nombre='Oferta mil',
            categoria='QA179 Precios',
            variantes=[Variante(sku='SKU-OFERTA', precio='10000.00', precio_oferta='1000.00')]
        )
        p_oferta.actualizar_precio_minimo_vigente()
        self.assertEqual(float(p_oferta.precio_minimo_vigente), 1000.0)

        # Caso 2: Producto sin oferta
        p_normal = Producto(
            nombre='Normal dos mil',
            categoria='QA179 Precios',
            variantes=[Variante(sku='SKU-NORMAL', precio='2000.00')]
        )
        p_normal.actualizar_precio_minimo_vigente()
        self.assertEqual(float(p_normal.precio_minimo_vigente), 2000.0)

        # El producto de oferta ($1.000) debe preceder al de $2.000 en ascendente
        self.assertLess(float(p_oferta.precio_minimo_vigente), float(p_normal.precio_minimo_vigente))

        # Caso 3: Producto con múltiples variantes ("Desde mil")
        p_variantes = Producto(
            nombre='Desde mil',
            categoria='QA179 Precios',
            variantes=[
                Variante(sku='SKU-BARATO', precio='1000.00'),
                Variante(sku='SKU-CARO', precio='90000.00'),
            ]
        )
        p_variantes.actualizar_precio_minimo_vigente()
        self.assertEqual(float(p_variantes.precio_minimo_vigente), 1000.0)

        # En orden descendente, productos con precio $8.300 deben quedar por encima de $1.000
        p_caro = Producto(
            nombre='Caro ocho mil',
            categoria='QA179 Precios',
            variantes=[Variante(sku='SKU-CARO-8300', precio='8300.00')]
        )
        p_caro.actualizar_precio_minimo_vigente()
        self.assertGreater(float(p_caro.precio_minimo_vigente), float(p_variantes.precio_minimo_vigente))

    @patch('ecommerce.infrastructure.catalogo.views.obtener_filtros_catalogo')
    def test_endpoint_filtros_catalogo_publico(self, mock_filtros):
        mock_filtros.return_value = {
            'categorias': ['Calzado', 'Ropa'],
            'atributos': {'Ropa': {'talla': ['S', 'M', 'L']}},
        }
        view_filtros = FiltrosCatalogoView.as_view()
        request = self.factory.get('/api/catalogo/filtros/')
        response = view_filtros(request)

        self.assertEqual(response.status_code, 200)
        self.assertIn('categorias', response.data)
        self.assertIn('atributos', response.data)
        self.assertEqual(response.data['categorias'], ['Calzado', 'Ropa'])
