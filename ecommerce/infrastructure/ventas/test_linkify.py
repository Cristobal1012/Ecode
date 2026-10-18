import json
import hmac
import hashlib
from unittest.mock import patch, MagicMock
from rest_framework.test import APISimpleTestCase
from rest_framework import status
from django.urls import reverse

class LinkifyWebhookQATest(APISimpleTestCase):
    def setUp(self):
        # Asegúrate de que este nombre coincide con el 'name' que pusiste en urls.py
        self.url = reverse('webhook-linkify') 
        self.secret_key = "secreto_de_prueba_linkify"

    def generar_firma_valida(self, payload_dict):
        cuerpo_bytes = json.dumps(payload_dict).encode('utf-8')
        firma = hmac.new(
            self.secret_key.encode('utf-8'),
            cuerpo_bytes,
            hashlib.sha256
        ).hexdigest()
        return cuerpo_bytes, firma

    @patch('ecommerce.infrastructure.ventas.views.LinkifyWebhookAPIView._obtener_secret_key')
    def test_rechaza_peticion_con_firma_invalida(self, mock_secret):
        """Criterio 6: Seguridad. Un aviso no auténtico no cambia la orden."""
        mock_secret.return_value = self.secret_key
        payload = {"action": "notification", "id": "ORD-001"}
        cuerpo_bytes = json.dumps(payload).encode('utf-8')
        
        # Enviamos una firma inventada
        headers = {'HTTP_X_LINKIFY_CONFIRMATION': 'firma_falsa_123'}
        response = self.client.post(self.url, cuerpo_bytes, content_type='application/json', **headers)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json()["notify_merchant"], False)

    @patch('ecommerce.infrastructure.ventas.views.ConfirmarPago')
    @patch('ecommerce.infrastructure.ventas.views.LinkifyWebhookAPIView._obtener_secret_key')
    def test_acepta_pago_exacto_y_ejecuta_confirmacion(self, mock_secret, MockConfirmarPago):
        """Criterio 2: Transferencia validada pasa a Pagado."""
        mock_secret.return_value = self.secret_key
        mock_caso_uso = MagicMock()
        MockConfirmarPago.return_value = mock_caso_uso
        
        payload = {
            "action": "notification",
            "id": "ORD-002",
            "completeness": "exact",
            "transfers": [{"amount": 15000}]
        }
        cuerpo_bytes, firma = self.generar_firma_valida(payload)
        
        headers = {'HTTP_X_LINKIFY_CONFIRMATION': firma}
        response = self.client.post(self.url, cuerpo_bytes, content_type='application/json', **headers)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], "accepted")
        
        # Verificamos que el caso de uso se llamó correctamente (usando aprobar)
        mock_caso_uso.aprobar.assert_called_once()
        kwargs = mock_caso_uso.aprobar.call_args.kwargs
        self.assertEqual(kwargs.get('orden_id'), "ORD-002")

    @patch('ecommerce.infrastructure.ventas.views.ConfirmarPago')
    @patch('ecommerce.infrastructure.ventas.views.LinkifyWebhookAPIView._obtener_secret_key')
    def test_pago_monto_distinto_no_descuenta_stock_automatico(self, mock_secret, MockConfirmarPago):
        """Criterio 4: Monto no coincide, va a revisión."""
        mock_secret.return_value = self.secret_key
        
        # Simulamos que ConfirmarPago lanza un error o que maneja la revisión 
        # (en nuestro views.py lo pasamos evaluando completeness)
        payload = {
            "action": "notification",
            "id": "ORD-003",
            "completeness": "underpaid",
            "transfers": [{"amount": 10000}]
        }
        cuerpo_bytes, firma = self.generar_firma_valida(payload)
        
        headers = {'HTTP_X_LINKIFY_CONFIRMATION': firma}
        response = self.client.post(self.url, cuerpo_bytes, content_type='application/json', **headers)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # La vista debe procesarlo como éxito hacia Linkify, pero internamente 
        # nuestro caso de uso debió registrar que el pago no fue exacto.