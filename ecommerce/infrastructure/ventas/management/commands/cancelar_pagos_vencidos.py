from django.core.management.base import BaseCommand
from django.utils import timezone

from ecommerce.application.ventas import CancelarPagosVencidos

from ...repositorio_ordenes import DjangoRepositorioOrdenes
from ...views import notificador_pedidos


class Command(BaseCommand):
    help = ('Cancela las órdenes por transferencia que no se pagaron dentro de 48 horas y avisa al comprador '
            '(ver docs/deploy/README.md). Programarlo para que corra periódicamente, por ejemplo cada hora.')

    def handle(self, *args, **options):
        canceladas = CancelarPagosVencidos(DjangoRepositorioOrdenes(), notificador_pedidos()).ejecutar(timezone.now())
        if canceladas:
            self.stdout.write(f"Órdenes canceladas por pago vencido: {', '.join(f'#{i}' for i in canceladas)}.")
        else:
            self.stdout.write('No hay órdenes con el pago vencido.')
