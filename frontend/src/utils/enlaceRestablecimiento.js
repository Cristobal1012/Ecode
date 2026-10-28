// El enlace del correo para elegir una nueva contraseña trae uid y token en la URL. main.jsx los guarda y los quita de
// la barra de direcciones antes de montar la app: así la analítica (si se aceptaron las cookies) nunca los recibe.
export const RUTA_RESTABLECER = '/restablecer-contrasena';
const CLAVE = 'enlace_restablecer_contrasena';

// Respaldo si el navegador bloquea sessionStorage; sessionStorage deja recargar la página sin perder el enlace
let enlaceEnMemoria = null;

export function capturarEnlaceRestablecimiento(ubicacion = window.location, historial = window.history) {
  if (ubicacion.pathname !== RUTA_RESTABLECER) return;
  const parametros = new URLSearchParams(ubicacion.search);
  const uid = parametros.get('uid');
  const token = parametros.get('token');
  if (!uid || !token) return;
  enlaceEnMemoria = { uid, token };
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(enlaceEnMemoria));
  } catch {
    // Queda solo en memoria
  }
  historial.replaceState(historial.state, '', RUTA_RESTABLECER);
}

export function leerEnlaceRestablecimiento() {
  if (enlaceEnMemoria) return enlaceEnMemoria;
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (guardado?.uid && guardado?.token) return { uid: guardado.uid, token: guardado.token };
  } catch {
    // Sin enlace guardado
  }
  return null;
}

export function olvidarEnlaceRestablecimiento() {
  enlaceEnMemoria = null;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar
  }
}
