

class ProveedorLogisticoAdapter:
    @staticmethod
    def consultar_estado(proveedor, codigo_seguimiento):
        """
        Consulta la API del proveedor logístico y estandariza el estado.
        Línea de tiempo esperada: ['En origen', 'En tránsito', 'En reparto', 'Entregado']
        """
        if not codigo_seguimiento:
            return "Pendiente de despacho"

        proveedor = proveedor.lower()

        if proveedor == 'starken':
            # Aquí harías el request.get() real a la API de Starken
            # Simulamos que la API responde con un estado interno:
            estado_interno_api = 'EN_RUTA' 
            
            # Diccionario de traducción (Hexagonal: aislar el dominio de la infraestructura externa)
            traduccion_starken = {
                'RECIBIDO_EN_AGENCIA': 'En origen',
                'EN_RUTA': 'En tránsito',
                'EN_REPARTO': 'En reparto',
                'ENTREGADO': 'Entregado'
            }
            return traduccion_starken.get(estado_interno_api, 'En origen')
            
        elif proveedor == 'chilexpress':
            # Lógica análoga para otro proveedor
            pass

        return "Pendiente de despacho"