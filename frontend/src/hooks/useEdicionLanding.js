import { useEffect, useRef, useState } from 'react';
import clienteAxios from '../components/auth/axiosConfig';
import { recargarConfiguracion } from './useConfiguracionTienda';

// Lo que el admin edita en la landing (RF-01.1, RF-01.2). Los máximos son los del backend.
export const CAMPOS_TEXTO = {
  nombre_tienda: { etiqueta: 'Nombre de la tienda', maximo: 255, obligatorio: true },
  subtitulo_bienvenida: { etiqueta: 'Antetítulo', maximo: 200 },
  texto_bienvenida: { etiqueta: 'Título', maximo: 300, obligatorio: true },
  texto_landing: { etiqueta: 'Texto de la portada', maximo: 1000 },
  texto_boton_ingreso: { etiqueta: 'Texto del botón', maximo: 100, obligatorio: true },
  nosotros_titulo: { etiqueta: 'Título de Nosotros', maximo: 120 },
  nosotros_texto: { etiqueta: 'Texto de Nosotros', maximo: 2000 }
};

export const CAMPOS_IMAGEN = {
  logo: 'logo',
  favicon: 'favicon',
  banner: 'imagen de portada',
  nosotros_imagen: 'foto de Nosotros'
};

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const MAXIMO_BYTES = 5 * 1024 * 1024;

const sinCampo = (objeto, campo) => {
  const copia = { ...objeto };
  delete copia[campo];
  return copia;
};

const textosDe = (configuracion) =>
  Object.fromEntries(Object.keys(CAMPOS_TEXTO).map((campo) => [campo, configuracion?.[campo] ?? '']));

// Convierte los errores del backend ({campo: ['mensaje']}) en un texto por campo
const erroresDe = (error) => {
  const datos = error?.response?.data;
  if (!datos || typeof datos !== 'object') return { general: 'No se pudieron guardar los cambios. Inténtalo de nuevo.' };
  return Object.fromEntries(Object.entries(datos).map(([campo, mensajes]) => [campo, [].concat(mensajes).join(' ')]));
};

/**
 * Borrador de la landing en modo edición. Nada se publica hasta guardar().
 * - textos: null fuera del modo edición.
 * - imagenes: { campo: { archivo: File | null, vistaPrevia } }; archivo null = quitar la imagen.
 */
export default function useEdicionLanding(configuracion) {
  const [textos, setTextos] = useState(null);
  const [imagenes, setImagenes] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const vistasPrevias = useRef(new Set());

  const editando = textos !== null;
  const original = textosDe(configuracion);
  const textosCambiados = editando
    ? Object.keys(CAMPOS_TEXTO).filter((campo) => textos[campo] !== original[campo])
    : [];
  const hayCambios = textosCambiados.length > 0 || Object.keys(imagenes).length > 0;

  const liberarVistasPrevias = () => {
    vistasPrevias.current.forEach((url) => URL.revokeObjectURL(url));
    vistasPrevias.current.clear();
  };

  // Al salir de la página se liberan las vistas previas que queden
  useEffect(() => liberarVistasPrevias, []);

  const iniciar = () => {
    setTextos(textosDe(configuracion));
    setErrores({});
    setMensaje('');
  };

  const cambiarTexto = (campo, valor) => {
    setTextos((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => sinCampo(actual, campo));
    setMensaje('');
  };

  const cambiarImagen = (campo, archivo) => {
    if (archivo && !TIPOS_IMAGEN.includes(archivo.type)) {
      setErrores((actual) => ({ ...actual, [campo]: 'Solo se admiten imágenes JPEG, PNG o WebP.' }));
      return;
    }
    if (archivo && archivo.size > MAXIMO_BYTES) {
      setErrores((actual) => ({ ...actual, [campo]: 'La imagen pesa más de 5 MB.' }));
      return;
    }
    const vistaPrevia = archivo ? URL.createObjectURL(archivo) : null;
    if (vistaPrevia) vistasPrevias.current.add(vistaPrevia);
    setImagenes((actual) => ({ ...actual, [campo]: { archivo, vistaPrevia } }));
    setErrores((actual) => sinCampo(actual, campo));
    setMensaje('');
  };

  const descartar = () => {
    liberarVistasPrevias();
    setImagenes({});
    setTextos(textosDe(configuracion));
    setErrores({});
    setMensaje('');
  };

  const salir = () => {
    liberarVistasPrevias();
    setImagenes({});
    setTextos(null);
    setErrores({});
    setMensaje('');
  };

  const guardar = async () => {
    const faltantes = Object.entries(CAMPOS_TEXTO)
      .filter(([campo, { obligatorio }]) => obligatorio && !textos[campo].trim())
      .map(([campo]) => [campo, 'No puede quedar vacío.']);
    if (faltantes.length) {
      setErrores(Object.fromEntries(faltantes));
      return;
    }

    setGuardando(true);
    setErrores({});
    try {
      // Las imágenes nuevas viajan en multipart junto con los textos (una sola petición: si falla, no queda
      // publicada la mitad). Quitar una imagen es un null, que solo se puede enviar en JSON.
      const nuevas = Object.entries(imagenes).filter(([, { archivo }]) => archivo);
      const quitadas = Object.fromEntries(
        Object.entries(imagenes).filter(([, { archivo }]) => !archivo).map(([campo]) => [campo, null]));
      const textosNuevos = Object.fromEntries(textosCambiados.map((campo) => [campo, textos[campo]]));

      if (nuevas.length) {
        const formulario = new FormData();
        Object.entries(textosNuevos).forEach(([campo, valor]) => formulario.append(campo, valor));
        nuevas.forEach(([campo, { archivo }]) => formulario.append(campo, archivo));
        // Sin Content-Type fijo: el navegador pone multipart/form-data con su boundary (como GaleriaImagenes)
        await clienteAxios.patch('configuracion/negocio/', formulario, { headers: { 'Content-Type': undefined } });
      }
      const enJson = nuevas.length ? quitadas : { ...textosNuevos, ...quitadas };
      if (Object.keys(enJson).length) await clienteAxios.patch('configuracion/negocio/', enJson);

      const guardada = await recargarConfiguracion();
      liberarVistasPrevias();
      setImagenes({});
      setTextos(textosDe(guardada));
      setMensaje('Cambios guardados: ya están publicados en tu tienda.');
    } catch (error) {
      setErrores(erroresDe(error));
    } finally {
      setGuardando(false);
    }
  };

  // Lo que se dibuja: la configuración publicada con el borrador encima
  const vista = editando
    ? {
        ...configuracion,
        ...textos,
        ...Object.fromEntries(Object.entries(imagenes).map(([campo, { vistaPrevia }]) => [campo, vistaPrevia]))
      }
    : configuracion;

  return {
    editando, vista, textos, hayCambios, guardando, errores, mensaje,
    iniciar, cambiarTexto, cambiarImagen, descartar, salir, guardar
  };
}
