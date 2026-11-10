from unittest import TestCase

from ecommerce.domain.banner import (
    DESTINO_POR_DEFECTO, LARGO_ANTETITULO, LARGO_TEXTO, LARGO_TITULO, TextosFoto, TextosFotoInvalidos,
    normalizar_textos_foto,
)


class TextosFotoTests(TestCase):
    def test_normaliza_espacios_y_conserva_el_destino(self):
        textos = normalizar_textos_foto({'antetitulo': ' Nuevo ', 'titulo': ' Murales ', 'texto': ' Hechos a mano ',
                                         'destino': 'BLOG'})
        self.assertEqual(textos, TextosFoto('Nuevo', 'Murales', 'Hechos a mano', 'BLOG'))

    def test_sin_destino_el_boton_lleva_al_catalogo(self):
        for datos in [{'titulo': 'Murales'}, {'titulo': 'Murales', 'destino': ''}, {'titulo': 'Murales', 'destino': None}]:
            with self.subTest(datos=datos):
                self.assertEqual(normalizar_textos_foto(datos).destino, DESTINO_POR_DEFECTO)

    def test_el_antetitulo_y_el_texto_son_opcionales(self):
        textos = normalizar_textos_foto({'titulo': 'Murales', 'antetitulo': None})
        self.assertEqual((textos.antetitulo, textos.texto), ('', ''))

    def test_el_titulo_es_obligatorio(self):
        for titulo in [None, '', '   ']:
            with self.subTest(titulo=titulo), self.assertRaises(TextosFotoInvalidos):
                normalizar_textos_foto({'titulo': titulo})

    def test_respeta_los_largos_de_la_portada(self):
        maximos = {'antetitulo': LARGO_ANTETITULO, 'titulo': LARGO_TITULO, 'texto': LARGO_TEXTO}
        for campo, largo in maximos.items():
            with self.subTest(campo=campo):
                datos = {'titulo': 'Murales', campo: 'x' * largo}
                self.assertEqual(getattr(normalizar_textos_foto(datos), campo), 'x' * largo)
                with self.assertRaises(TextosFotoInvalidos):
                    normalizar_textos_foto({'titulo': 'Murales', campo: 'x' * (largo + 1)})

    def test_rechaza_destinos_y_formatos_invalidos(self):
        for datos in [{'titulo': 'Murales', 'destino': 'SOBRE_MI'}, {'titulo': 'Murales', 'destino': 'catalogo'},
                      {'titulo': 5}, 'Murales', None]:
            with self.subTest(datos=datos), self.assertRaises(TextosFotoInvalidos):
                normalizar_textos_foto(datos)
