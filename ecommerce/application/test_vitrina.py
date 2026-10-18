from django.test import SimpleTestCase

from ecommerce.application.vitrina import CatalogoVitrina, SeleccionarVitrina, VentasPorProducto


class VentasFalsas(VentasPorProducto):
    def __init__(self, ranking):
        self.ranking = ranking

    def mas_vendidos(self, limite):
        return self.ranking[:limite]


class CatalogoFalso(CatalogoVitrina):
    def __init__(self, visibles_del_mas_nuevo_al_mas_viejo):
        self.productos = visibles_del_mas_nuevo_al_mas_viejo

    def visibles(self, ids):
        return [i for i in ids if i in self.productos]

    def recientes(self, limite, excluir=()):
        return [i for i in self.productos if i not in excluir][:limite]


def vitrina(ranking, catalogo, cantidad=4):
    return SeleccionarVitrina(VentasFalsas(ranking), CatalogoFalso(catalogo), cantidad).ejecutar()


class SeleccionarVitrinaTests(SimpleTestCase):
    """RF-01.1: la landing muestra los más vendidos y los últimos agregados."""

    def test_los_mas_vendidos_siguen_el_ranking_de_ventas(self):
        resultado = vitrina(['c', 'a', 'f', 'b', 'e'], ['a', 'b', 'c', 'd', 'e', 'f'])

        self.assertEqual(resultado.mas_vendidos, ['c', 'a', 'f', 'b'])
        self.assertEqual(resultado.recientes, ['a', 'b', 'c', 'd'])

    def test_un_producto_vendido_que_ya_no_esta_publicado_no_aparece(self):
        resultado = vitrina(['oculto', 'c', 'borrado', 'a', 'b', 'd'], ['a', 'b', 'c', 'd'])

        self.assertEqual(resultado.mas_vendidos, ['c', 'a', 'b', 'd'])

    def test_sin_ventas_se_completa_primero_con_productos_que_no_estan_en_ultimos_agregados(self):
        resultado = vitrina([], ['n1', 'n2', 'n3', 'n4', 'v1', 'v2', 'v3', 'v4', 'v5'])

        self.assertEqual(resultado.recientes, ['n1', 'n2', 'n3', 'n4'])
        self.assertEqual(resultado.mas_vendidos, ['v1', 'v2', 'v3', 'v4'])

    def test_con_pocas_ventas_se_completa_sin_repetir_los_vendidos(self):
        resultado = vitrina(['v3'], ['n1', 'n2', 'n3', 'n4', 'v1', 'v2', 'v3'])

        self.assertEqual(resultado.mas_vendidos, ['v3', 'v1', 'v2', 'n1'])

    def test_con_un_catalogo_chico_se_repiten_productos_antes_que_dejar_la_seccion_corta(self):
        resultado = vitrina([], ['a', 'b'])

        self.assertEqual(resultado.recientes, ['a', 'b'])
        self.assertEqual(sorted(resultado.mas_vendidos), ['a', 'b'])

    def test_sin_productos_publicados_las_dos_secciones_quedan_vacias(self):
        resultado = vitrina(['a'], [])

        self.assertEqual((resultado.mas_vendidos, resultado.recientes), ([], []))
