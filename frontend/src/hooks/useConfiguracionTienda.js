import { useEffect, useState } from 'react';
import clienteAxios from '../components/auth/axiosConfig';

// Configuración pública de la tienda (nombre, logo, favicon, textos de la landing...). Se pide una sola vez y la
// comparten el header, el footer y la landing; recargarConfiguracion() la vuelve a pedir tras editarla.
let configuracion = null;
let peticion = null;
const oyentes = new Set();

function cargar() {
  if (!peticion) {
    peticion = clienteAxios.get('configuracion/')
      .then(({ data }) => {
        configuracion = Array.isArray(data) ? data[0] : data;
        aplicarIdentidad(configuracion);
        oyentes.forEach((avisar) => avisar(configuracion));
        return configuracion;
      })
      .catch((error) => {
        // Se puede reintentar en el próximo montaje
        peticion = null;
        throw error;
      });
  }
  return peticion;
}

export function recargarConfiguracion() {
  peticion = null;
  return cargar();
}

// Nombre de la pestaña y favicon del negocio (RF-01.2)
function aplicarIdentidad(config) {
  if (!config) return;
  if (config.nombre_tienda) document.title = config.nombre_tienda;
  if (config.favicon) {
    let icono = document.querySelector('link[rel="icon"]');
    if (!icono) {
      icono = document.createElement('link');
      icono.rel = 'icon';
      document.head.appendChild(icono);
    }
    icono.removeAttribute('type');
    icono.href = config.favicon;
  }
}

export default function useConfiguracionTienda() {
  const [valor, setValor] = useState(configuracion);

  useEffect(() => {
    oyentes.add(setValor);
    cargar().catch((error) => console.error('No se pudo cargar la configuración de la tienda:', error));
    return () => oyentes.delete(setValor);
  }, []);

  return valor;
}
