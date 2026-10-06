import os
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

class ProveedorLogisticoAdapter:
    
    ESTADOS_ESTANDAR = {
        "ORIGEN": "En origen",
        "TRANSITO": "En tránsito",
        "REPARTO": "En reparto",
        "ENTREGADO": "Entregado"
    }

    # CACHÉ EN MEMORIA: Guarda el diccionario para no hacer 16 peticiones en cada cotización
    _CACHE_COBERTURAS = {}

    @classmethod
    def _obtener_catalogo_dinamico(cls):
        """Consume la API de Regiones y luego la de Coberturas para armar el mapa del país"""
        # Si ya lo descargamos, lo devolvemos al instante
        if cls._CACHE_COBERTURAS:
            return cls._CACHE_COBERTURAS

        api_key = os.getenv("CHILEXPRESS_API_KEY_COBERTURAS", "").strip()
        if not api_key:
            api_key = os.getenv("CHILEXPRESS_API_KEY_COTIZADOR", "").strip()
            
        headers = {
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/json"
        }
        
        nuevo_diccionario = {}
        
        try:
            # 1. Obtener todas las regiones (Sabemos que esto sí funciona en Sandbox)
            url_regiones = "https://testservices.wschilexpress.com/georeference/api/v1.0/regions"
            resp_reg = requests.get(url_regiones, headers=headers, timeout=6)
            
            if resp_reg.status_code == 200:
                regiones = resp_reg.json().get("regions", []) or resp_reg.json().get("data", {}).get("regions", [])
                
                # 2. Iterar sobre cada región y usar el endpoint exacto que encontraste
                for reg in regiones:
                    region_id = reg.get("regionId")
                    if not region_id:
                        continue
                        
                    # type=1 asegura que solo traiga comunas y omita sub-sectores confusos
                    url_cob = f"https://testservices.wschilexpress.com/georeference/api/v1.0/coverage-areas?RegionCode={region_id}&type=1"
                    resp_cob = requests.get(url_cob, headers=headers, timeout=5)
                    
                    if resp_cob.status_code == 200:
                        areas = resp_cob.json().get("coverageAreas", []) or resp_cob.json().get("data", {}).get("coverageAreas", [])
                        
                        for area in areas:
                            nombre = area.get("countyName", "").strip().upper()
                            codigo = area.get("countyCode", "").strip().upper()
                            
                            if nombre and codigo:
                                nuevo_diccionario[nombre] = codigo

            if nuevo_diccionario:
                cls._CACHE_COBERTURAS = nuevo_diccionario
                return nuevo_diccionario
                
            logger.error("No se pudo construir el diccionario dinámico. Revisa la API Key.")
            return {}
            
        except Exception as e:
            logger.error(f"Excepción armando catálogo Chilexpress: {str(e)}")
            return {}

    # ==========================================
    # 1. COBERTURAS Y COMUNAS (PARA REACT)
    # ==========================================
    @classmethod
    def obtener_comunas_chilexpress(cls):
        catalogo = cls._obtener_catalogo_dinamico()
        if not catalogo:
            return {"error": "Servicio de coberturas no disponible en este momento."}
            
        # Entregamos al frontend solo los nombres legibles ordenados alfabéticamente
        return sorted(list(catalogo.keys()))

    # ==========================================
    # 2. COTIZADOR DE ENVÍOS (PRICING)
    # ==========================================
    @classmethod
    def cotizar_envio(cls, proveedor, origen, destino, peso_kg, alto_cm, ancho_cm, largo_cm):
        proveedor_normalizado = proveedor.strip().lower()
        if proveedor_normalizado == 'chilexpress':
            return cls._cotizar_chilexpress(origen, destino, peso_kg, alto_cm, ancho_cm, largo_cm)
        return {"error": "Proveedor no soportado para cotización"}

    @classmethod
    def _cotizar_chilexpress(cls, origen, destino, peso, alto, ancho, largo):
        catalogo = cls._obtener_catalogo_dinamico()
        
        # TRADUCCIÓN: Pasamos del nombre legible (Ej: MAIPU) al código de 4 letras oficial (MIPU)
        codigo_origen = catalogo.get(str(origen).strip().upper(), "STGO")
        codigo_destino = catalogo.get(str(destino).strip().upper())
        
        if not codigo_destino:
            return {"error": f"La comuna '{destino}' no es válida o no tiene cobertura."}

        url = "https://testservices.wschilexpress.com/rating/api/v1.0/rates/business"
        api_key = os.getenv("CHILEXPRESS_API_KEY_COTIZADOR", "").strip()
        headers = {
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/json"
        }
        
        payload = {
            "originCountyCode": codigo_origen,
            "destinationCountyCode": codigo_destino,
            "package": {
                "weight": str(peso),
                "height": str(alto),
                "width": str(ancho),
                "length": str(largo)
            },
            "productType": 3,
            "contentType": 1,
            "declaredWorth": "0",
            "deliveryTime": 0,
            "customerCardNumber": "0" 
        }
        
        try:
            respuesta = requests.post(url, headers=headers, json=payload, timeout=6)
            
            if respuesta.status_code != 200:
                return {"error": f"Error del cotizador: {respuesta.text}"}
                
            data = respuesta.json()
            servicios = data.get("data", {}).get("courierServiceOptions", []) or data.get("courierServiceOptions", [])
            
            if not servicios:
                return {"error": "No hay servicios disponibles para esta ruta"}
                
            # Buscamos el servicio Express, si no existe devolvemos el primero de la lista
            servicio_optimo = next((s for s in servicios if s['serviceDescription'] == 'EXPRESS'), servicios[0])
            
            return {
                "proveedor": "Chilexpress",
                "precio": int(servicio_optimo.get("serviceValue", 0)),
                "tiempo_estimado": servicio_optimo.get("serviceDescription", "No especificado"),
                "moneda": "CLP"
            }
            
        except Exception as e:
            logger.error(f"Error cotizando con Chilexpress: {str(e)}")
            return {"error": "Servicio de cotización no disponible temporalmente"}

    # ==========================================
    # 3. SEGUIMIENTO DE ENVÍOS (TRACKING)
    # ==========================================
    @classmethod
    def consultar_estado(cls, proveedor, codigo_seguimiento):
        proveedor_normalizado = proveedor.strip().lower()
        if proveedor_normalizado == 'chilexpress':
            return cls._consultar_chilexpress(codigo_seguimiento)
        return "Proveedor no soportado"

    @classmethod
    def _consultar_chilexpress(cls, codigo):
        url = f"https://dev.chilexpress.cl/traking/api/v1.0/tracking/{codigo}" 
        headers = {
            "Ocp-Apim-Subscription-Key": os.getenv("CHILEXPRESS_API_KEY_ENVIOS", "").strip(), 
            "Content-Type": "application/json"
        }
        try:
            respuesta = requests.get(url, headers=headers, timeout=5)
            respuesta.raise_for_status()
            data = respuesta.json()
            estado_api = data.get("statusName", "")
            mapeo = {
                "RECEPCIONADO": cls.ESTADOS_ESTANDAR["ORIGEN"],
                "EN_TRANSITO": cls.ESTADOS_ESTANDAR["TRANSITO"],
                "EN_REPARTO": cls.ESTADOS_ESTANDAR["REPARTO"],
                "ENTREGADO": cls.ESTADOS_ESTANDAR["ENTREGADO"]
            }
            return mapeo.get(estado_api, "En origen")
        except Exception as e:
            logger.error(f"Error consultando tracking: {str(e)}")
            return "Estado no disponible temporalmente"

    @classmethod
    def obtener_sucursales_por_comuna(cls, nombre_comuna):
        nombre_limpio = str(nombre_comuna).strip().upper()
        
        if not nombre_limpio:
            return {"error": "Debe especificar una comuna válida."}

        # URL oficial ajustada a la documentación de Chilexpress (Type=0 para todas las oficinas)
        url = f"https://testservices.wschilexpress.com/georeference/api/v1.0/offices?Type=0&CountyName={nombre_limpio}"
        
        api_key = os.getenv("CHILEXPRESS_API_KEY_GEO", "").strip()
        if not api_key:
            api_key = os.getenv("CHILEXPRESS_API_KEY_COTIZADOR", "").strip()

        headers = {
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/json"
        }

        try:
            print(f"DEBUG CHILEXPRESS: Consultando oficinas para la comuna '{nombre_limpio}'")
            resp = requests.get(url, headers=headers, timeout=5)
            
            print(f"DEBUG SUCURSALES STATUS: {resp.status_code}")
            print(f"DEBUG SUCURSALES BODY: {resp.text}")

            if resp.status_code == 200:
                data = resp.json()
                
                # La estructura de la respuesta oficial viene dentro de un arreglo 'offices'
                offices = data.get("offices", [])
                
                sucursales = []
                for office in offices:
                    sucursales.append({
                        "codigo": office.get("officeCode"),
                        "nombre": office.get("officeName"),
                        "direccion": f"{office.get('streetName', '')} {office.get('streetNumber', '')}".strip(),
                    })
                return sucursales
            else:
                return {"error": f"Error de API Chilexpress (Código {resp.status_code})" }
        except Exception as e:
            print(f"EXCEPCIÓN SUCURSALES: {str(e)}")
            return {"error": "Servicio de sucursales no disponible temporalmente."}
        
    # ==========================================
    # 4. GENERACIÓN DE ORDEN DE TRANSPORTE (OT) Y ETIQUETAS
    # ==========================================
    @classmethod
    def generar_orden_transporte(cls, datos_envio: dict) -> dict:
        """
        Genera una Orden de Transporte (OT) en Chilexpress utilizando la API oficial de transport-orders.
        """
        url = "https://testservices.wschilexpress.com/transport-orders/api/v1.0/transport-orders"
        
        api_key = os.getenv("CHILEXPRESS_API_KEY_ENVIOS", "").strip()
        if not api_key:
            api_key = os.getenv("CHILEXPRESS_API_KEY_COTIZADOR", "").strip()

        headers = {
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/json"
        }

        # Estructura requerida por Chilexpress según documentación oficial
        payload = {
            "header": {
                "certificateNumber": 0,
                "customerCardNumber": "18578680", # TCC de pruebas oficial[cite: 1]
                "countyOfOriginCoverageCode": datos_envio.get("origen_codigo", "PUDA"),
                "labelType": 2, # 2 = Imagen en Binario + Datos[cite: 1]
                "marketplaceRut": "96756430",
                "sellerRut": "DEFAULT"
            },
            "details": [{
                "addresses": [{
                    "addressId": 0,
                    "countyCoverageCode": datos_envio.get("destino_codigo", "PROV"),
                    "streetName": datos_envio.get("calle", "SIN CALLE"),
                    "streetNumber": str(datos_envio.get("numero", "0")),
                    "supplement": datos_envio.get("supplement", ""),
                    "addressType": "DEST",
                    "deliveryOnCommercialOffice": datos_envio.get("es_sucursal", False),
                    "commercialOfficeId": str(datos_envio.get("sucursal_id", "")) if datos_envio.get("es_sucursal") else "",
                    "observation": "DEFAULT"
                }, {
                    "addressId": 0,
                    "countyCoverageCode": datos_envio.get("origen_codigo", "PUDA"),
                    "streetName": "AVENIDA DE RETORNO",
                    "streetNumber": "120",
                    "supplement": "Bodega",
                    "addressType": "DEV",
                    "deliveryOnCommercialOffice": False,
                    "observation": "DEFAULT"
                }],
                "contacts": [{
                    "name": datos_envio.get("nombre_destinatario", "Cliente"),
                    "phoneNumber": datos_envio.get("telefono", "123456789"),
                    "mail": datos_envio.get("email", "cliente@correo.cl"),
                    "contactType": "D"
                }, {
                    "name": "Remitente Tienda",
                    "phoneNumber": "999999999",
                    "mail": "contacto@tu-tienda.cl",
                    "contactType": "R"
                }],
                "packages": [{
                    "weight": str(datos_envio.get("peso", "1")),
                    "height": int(datos_envio.get("alto", 10)),
                    "width": int(datos_envio.get("ancho", 10)),
                    "length": int(datos_envio.get("largo", 10)),
                    "serviceDeliveryCode": 3,
                    "productCode": 3,
                    "deliveryReference": str(datos_envio.get("referencia", "ORDEN-1")),
                    "groupReference": "",
                    "declaredValue": int(datos_envio.get("valor_declarado", 1000)),
                    "declaredContent": 1
                    # Eliminado receivableAmountInDelivery para evitar conflictos de parseo
                }]
            }]
        }

        try:
            logger.info(f"Enviando solicitud de OT a Chilexpress para la referencia: {datos_envio.get('referencia')}")
            respuesta = requests.post(url, headers=headers, json=payload, timeout=10)
            
            if respuesta.status_code in [200, 201]:
                data = respuesta.json()
                detalle = data.get("data", {}).get("detail", [{}])[0]
                
                return {
                    "exito": True,
                    "numero_ot": detalle.get("transportOrderNumber"),
                    "codigo_barras": detalle.get("barcode"),
                    "etiqueta_data": detalle.get("label", {}).get("labelData"),
                    "data_completa": data
                }
            else:
                logger.error(f"Error generando OT en Chilexpress: {respuesta.text}")
                return {"exito": False, "error": respuesta.text}
                
        except Exception as e:
            logger.error(f"Excepción en generacion de OT Chilexpress: {str(e)}")
            return {"exito": False, "error": str(e)}