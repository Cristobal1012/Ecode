from locust import HttpUser, task, between


class UsuarioEcode(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def consultar_catalogo(self):
        self.client.get(
            "/api/catalogo/productos/",
            name="Catalogo publico",
        )

    @task(2)
    def consultar_vitrina(self):
        self.client.get(
            "/api/catalogo/vitrina/",
            name="Vitrina publica",
        )

    @task(1)
    def consultar_inicio(self):
        self.client.get(
            "/",
            name="Inicio API",
        )

    @task(1)
    def consultar_configuracion(self):
        self.client.get(
            "/api/configuracion/",
            name="Configuracion global",
        )

    @task(1)
    def consultar_paginas_legales(self):
        self.client.get(
            "/api/ventas/paginas-legales/",
            name="Paginas legales",
        )
