from unittest import TestCase

from ecommerce.domain.catalogo import OrdenCategoriasInvalido, normalizar_orden_categorias, ordenar_categorias


class OrdenCategoriasTests(TestCase):
    def test_quita_espacios_y_conserva_el_orden(self):
        self.assertEqual(normalizar_orden_categorias([' Zeta ', 'Beta']), ['Zeta', 'Beta'])
        self.assertEqual(normalizar_orden_categorias([]), [])

    def test_rechaza_lo_que_no_es_una_lista_de_textos_validos(self):
        for valor in [None, {}, 'Beta', [''], ['   '], [1], ['x' * 101]]:
            with self.subTest(valor=valor), self.assertRaises(OrdenCategoriasInvalido):
                normalizar_orden_categorias(valor)

    def test_rechaza_repetidas_aunque_difieran_en_espacios(self):
        with self.assertRaises(OrdenCategoriasInvalido):
            normalizar_orden_categorias(['Beta', ' Beta '])

    def test_ordena_priorizadas_primero_y_el_resto_alfabetico(self):
        self.assertEqual(ordenar_categorias(['Zeta', 'Alfa', 'Beta', 'Gama'], ['Gama', 'Inexistente', 'Beta']),
                         ['Gama', 'Beta', 'Alfa', 'Zeta'])
