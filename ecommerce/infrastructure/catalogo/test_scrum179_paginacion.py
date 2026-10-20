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
        self.assertIn('atributos_globales', indexes)

        # Validar índices compuestos de alta concurrencia
        self.assertTrue(
            any(('activo', 'publicado', 'categoria') == idx for idx in indexes)
        )
        self.assertTrue(
            any(('activo', 'publicado', '-fecha_creacion') == idx for idx in indexes)
        )
        self.assertTrue(
            any(('activo', 'publicado', 'variantes.precio') == idx for idx in indexes)
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
    def test_filtro_atributos_se_aplica_al_queryset_en_servidor(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 5
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        request = self.factory.get('/api/catalogo/productos/?atributo_color=Azul')
        self.view(request)

        mock_qs.filter.assert_any_call(atributos_globales__color='Azul')

    @patch('ecommerce.infrastructure.catalogo.documents.Producto.objects')
    def test_orden_precio_asc_y_desc_en_servidor(self, mock_objects):
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 10
        mock_qs.__getitem__.return_value = []
        mock_objects.filter.return_value = mock_qs

        # Precio ascendente
        request_asc = self.factory.get('/api/catalogo/productos/?orden=precio-asc')
        self.view(request_asc)
        mock_qs.order_by.assert_called_with('variantes.precio')

        # Precio descendente
        request_desc = self.factory.get('/api/catalogo/productos/?orden=precio-desc')
        self.view(request_desc)
        mock_qs.order_by.assert_called_with('-variantes.precio')

        # Más nuevos
        request_recientes = self.factory.get('/api/catalogo/productos/?orden=recientes')
        self.view(request_recientes)
        mock_qs.order_by.assert_called_with('-fecha_creacion')

        # Nombre A-Z
        request_nombre = self.factory.get('/api/catalogo/productos/?orden=nombre')
        self.view(request_nombre)
        mock_qs.order_by.assert_called_with('nombre')

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
