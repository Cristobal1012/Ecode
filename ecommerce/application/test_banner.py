from unittest import TestCase

from ecommerce.application.banner import ActualizarBanners, RepositorioBanners
from ecommerce.domain.banner import EstructuraBannerInvalida, LimiteFotosBannerExcedido


class FakeRepositorioBanners(RepositorioBanners):
    def __init__(self):
        self.llamadas = []

    def guardar_banners(self, configuracion_id: int, orden_list: list, nuevos_archivos: list) -> None:
        self.llamadas.append((configuracion_id, orden_list, nuevos_archivos))


class ActualizarBannersApplicationTests(TestCase):
    def setUp(self):
        self.repo = FakeRepositorioBanners()
        self.caso_de_uso = ActualizarBanners(self.repo)

    def test_valida_formato_de_orden_valido(self):
        self.caso_de_uso.ejecutar(1, ['id:legacy', 'nuevo:0'], ['archivo1'])
        self.assertEqual(len(self.repo.llamadas), 1)
        config_id, orden, archivos = self.repo.llamadas[0]
        self.assertEqual(config_id, 1)
        self.assertEqual(orden, ['id:legacy', 'nuevo:0'])
        self.assertEqual(archivos, ['archivo1'])

    def test_valida_orden_en_formato_json_string(self):
        self.caso_de_uso.ejecutar(1, '["id:1", "nuevo:0"]', ['archivo1'])
        self.assertEqual(len(self.repo.llamadas), 1)

    def test_rechaza_formato_no_json(self):
        with self.assertRaises(EstructuraBannerInvalida):
            self.caso_de_uso.ejecutar(1, '{no-es-json', [])

    def test_rechaza_tipo_no_lista(self):
        with self.assertRaises(EstructuraBannerInvalida):
            self.caso_de_uso.ejecutar(1, 123, [])

    def test_rechaza_mas_de_10_fotos(self):
        with self.assertRaises(LimiteFotosBannerExcedido):
            self.caso_de_uso.ejecutar(1, [f'nuevo:{i}' for i in range(11)], ['f'] * 11)

    def test_rechaza_indice_nuevo_fuera_de_rango(self):
        with self.assertRaises(EstructuraBannerInvalida):
            self.caso_de_uso.ejecutar(1, ['nuevo:5'], ['f1'])

    def test_rechaza_id_invalido(self):
        with self.assertRaises(EstructuraBannerInvalida):
            self.caso_de_uso.ejecutar(1, ['id:no-es-numero'], [])
