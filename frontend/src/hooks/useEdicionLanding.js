import { useEffect, useRef, useState } from 'react';
import clienteAxios from '../components/auth/axiosConfig';
import { recargarConfiguracion } from './useConfiguracionTienda';

// Lo que el admin edita en la landing (RF-01.1, RF-01.2). Los máximos son los del backend.
export const CAMPOS_TEXTO = {
  nombre_tienda: { etiqueta: 'Nombre de la tienda', maximo: 255, obligatorio: true },
  subtitulo_bienvenida: { etiqueta: 'Antetítulo', maximo: 200 },
  texto_bienvenida: { etiqueta: 'Título', maximo: 300, obligatorio: true },
  texto_landing: { etiqueta: 'Texto de la portada', maximo: 1000 },
  nosotros_titulo: { etiqueta: 'Título de Nosotros', maximo: 120 },
  nosotros_texto: { etiqueta: 'Texto de Nosotros', maximo: 2000 },
  // RN-01: dónde va el logo de la Universidad: 'HEADER' (o vacío) o 'FOOTER'; no hay opción para ocultarlo
  ubicacion_logo_universidad: { etiqueta: 'Logo de la Universidad' },
  // Vitrina: 'MAS_VENDIDOS' (o vacío) o 'DESTACADOS'; vacío el título vuelve a "Destacados" (domain/destacados.py)
  vitrina_modo: { etiqueta: 'Vitrina' },
  destacados_titulo: { etiqueta: 'Título de la sección', maximo: 60 }
};

// Destacados: hasta 4 productos y publicaciones del blog, en el orden que elige el admin (domain/destacados.py)
export const MAX_DESTACADOS = 4;

// Fotos de la sección de Instagram: 6 espacios fijos (el usuario se configura en el panel)
export const CAMPOS_FOTOS_INSTAGRAM = [1, 2, 3, 4, 5, 6].map((numero) => `instagram_foto_${numero}`);

export const CAMPOS_IMAGEN = {
  logo: 'logo',
  favicon: 'favicon',
  banner: 'imagen de portada',
  nosotros_imagen: 'foto de Nosotros',
  ...Object.fromEntries(CAMPOS_FOTOS_INSTAGRAM.map((campo, indice) => [campo, `foto ${indice + 1} de Instagram`]))
};

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const MAXIMO_BYTES = 5 * 1024 * 1024;

const sinCampo = (objeto, campo) => {
  const copia = { ...objeto };
  delete copia[campo];
  return copia;
};

export const obtenerBannersIniciales = (conf) => {
  if (conf?.banners && Array.isArray(conf.banners) && conf.banners.length > 0) {
    return conf.banners.map((b, i) => ({ id: b.id, imagen: b.imagen, orden: b.orden ?? i }));
  }
  if (conf?.banner || conf?.banner_url?.trim()) {
    return [{ id: 'legacy', imagen: conf.banner || conf.banner_url.trim(), orden: 0 }];
  }
  return [];
};

const textosDe = (configuracion) =>
  Object.fromEntries(Object.keys(CAMPOS_TEXTO).map((campo) => [campo, configuracion?.[campo] ?? '']));

// [{ tipo, id }]: el id siempre como texto, igual que lo guarda el backend
const destacadosDe = (configuracion) => (Array.isArray(configuracion?.destacados) ? configuracion.destacados : [])
  .map(({ tipo, id }) => ({ tipo, id: String(id) }));
const mismaSeleccion = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
 * - destacados: la selección de la vitrina en orden ([{ tipo, id }]); null fuera del modo edición.
 */
export default function useEdicionLanding(configuracion) {
  const [textos, setTextos] = useState(null);
  const [imagenes, setImagenes] = useState({});
  const [banners, setBanners] = useState(null);
  const [destacados, setDestacados] = useState(null);
  const [menu, setMenu] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState('');
  const vistasPrevias = useRef(new Set());

  const editando = textos !== null;
  const original = textosDe(configuracion);
  const textosCambiados = editando
    ? Object.keys(CAMPOS_TEXTO).filter((campo) => textos[campo] !== original[campo])
    : [];
  const bannersIniciales = obtenerBannersIniciales(configuracion);
  const bannersCambiados = Boolean(
    banners !== null &&
    JSON.stringify(banners.map((b) => b.id || b.imagen)) !==
      JSON.stringify(bannersIniciales.map((b) => b.id || b.imagen))
  );

  const destacadosCambiados = editando && destacados !== null && !mismaSeleccion(destacados, destacadosDe(configuracion));
  const menuCambiado = editando && JSON.stringify(menu) !== JSON.stringify(configuracion?.menu_principal || {});
  const hayCambios = textosCambiados.length > 0 || Object.keys(imagenes).length > 0 || bannersCambiados || destacadosCambiados || menuCambiado;

  const liberarVistasPrevias = () => {
    vistasPrevias.current.forEach((url) => URL.revokeObjectURL(url));
    vistasPrevias.current.clear();
  };

  // Al salir de la página se liberan las vistas previas que queden
  useEffect(() => liberarVistasPrevias, []);

  const iniciar = () => {
    setTextos(textosDe(configuracion));
    setBanners(obtenerBannersIniciales(configuracion));
    setDestacados(destacadosDe(configuracion));
    setMenu(configuracion?.menu_principal || {});
    setErrores({});
    setMensaje('');
  };

  const cambiarTexto = (campo, valor) => {
    setTextos((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => sinCampo(actual, campo));
    setMensaje('');
  };

  const cambiarMenu = (valor) => {
    setMenu(valor);
    setErrores((actual) => sinCampo(actual, 'menu_principal'));
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
    if (campo === 'banner') {
      if (archivo) {
        setBanners([{ id: 'nuevo_banner', archivo, vistaPrevia, imagen: vistaPrevia }]);
      } else {
        setBanners([]);
      }
      setErrores((actual) => sinCampo(actual, campo));
      setMensaje('');
      return;
    }
    setImagenes((actual) => ({ ...actual, [campo]: { archivo, vistaPrevia } }));

    setErrores((actual) => sinCampo(actual, campo));
    setMensaje('');
  };

  const MAX_FOTOS_BANNER = 10;

  const agregarFotosBanner = (nuevosArchivos) => {
    const lista = Array.from(nuevosArchivos || []);
    if (!lista.length) return;

    const base = banners ?? obtenerBannersIniciales(configuracion);
    if (base.length >= MAX_FOTOS_BANNER) {
      setErrores((actual) => ({ ...actual, banner: `No puedes subir más de ${MAX_FOTOS_BANNER} fotos al banner.` }));
      return;
    }
    if (base.length + lista.length > MAX_FOTOS_BANNER) {
      setErrores((actual) => ({
        ...actual,
        banner: `Solo puedes agregar ${MAX_FOTOS_BANNER - base.length} foto(s) más (máximo ${MAX_FOTOS_BANNER}).`,
      }));
      return;
    }

    for (const archivo of lista) {
      if (!TIPOS_IMAGEN.includes(archivo.type)) {
        setErrores((actual) => ({ ...actual, banner: 'Solo se admiten imágenes JPEG, PNG o WebP.' }));
        return;
      }
      if (archivo.size > MAXIMO_BYTES) {
        setErrores((actual) => ({ ...actual, banner: 'La imagen pesa más de 5 MB.' }));
        return;
      }
    }

    const agregados = lista.map((archivo) => {
      const vistaPrevia = URL.createObjectURL(archivo);
      vistasPrevias.current.add(vistaPrevia);
      return {
        id: `nuevo_${Math.random().toString(36).slice(2, 9)}`,
        archivo,
        vistaPrevia,
        imagen: vistaPrevia,
      };
    });

    setBanners((actual) => {
      const baseActual = actual ?? obtenerBannersIniciales(configuracion);
      return [...baseActual, ...agregados];
    });
    setErrores((actual) => sinCampo(actual, 'banner'));
    setMensaje('');
  };

  const reordenarFotosBanner = (origen, destino) => {
    setBanners((actual) => {
      const base = [...(actual ?? obtenerBannersIniciales(configuracion))];
      if (origen < 0 || origen >= base.length || destino < 0 || destino >= base.length) return base;
      const [movido] = base.splice(origen, 1);
      base.splice(destino, 0, movido);
      return base;
    });
    setMensaje('');
  };

  const eliminarFotoBanner = (indice) => {
    setBanners((actual) => {
      const base = [...(actual ?? obtenerBannersIniciales(configuracion))];
      if (indice < 0 || indice >= base.length) return base;
      const eliminado = base[indice];
      if (eliminado?.vistaPrevia) {
        URL.revokeObjectURL(eliminado.vistaPrevia);
        vistasPrevias.current.delete(eliminado.vistaPrevia);
      }
      base.splice(indice, 1);
      return base;
    });
    setMensaje('');
  };

  // Selección de destacados: agregar al final (hasta 4, sin repetir), mover un lugar y quitar
  const cambiarDestacados = (cambio) => {
    setDestacados((actual) => cambio([...(actual || [])]));
    setErrores((actual) => sinCampo(actual, 'destacados'));
    setMensaje('');
  };

  const agregarDestacado = ({ tipo, id }) => cambiarDestacados((lista) => {
    const nuevo = { tipo, id: String(id) };
    const repetido = lista.some((elegido) => elegido.tipo === nuevo.tipo && elegido.id === nuevo.id);
    return repetido || lista.length >= MAX_DESTACADOS ? lista : [...lista, nuevo];
  });

  const moverDestacado = (indice, paso) => cambiarDestacados((lista) => {
    const destino = indice + paso;
    if (indice < 0 || destino < 0 || indice >= lista.length || destino >= lista.length) return lista;
    [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
    return lista;
  });

  const quitarDestacado = (indice) => cambiarDestacados((lista) => lista.filter((_, posicion) => posicion !== indice));

  const descartar = () => {
    liberarVistasPrevias();
    setImagenes({});
    setTextos(textosDe(configuracion));
    setBanners(obtenerBannersIniciales(configuracion));
    setDestacados(destacadosDe(configuracion));
    setMenu(configuracion?.menu_principal || {});
    setErrores({});
    setMensaje('');
  };

  const salir = () => {
    liberarVistasPrevias();
    setImagenes({});
    setTextos(null);
    setBanners(null);
    setDestacados(null);
    setMenu(null);
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
      const nuevas = Object.entries(imagenes).filter(([campo, { archivo }]) => campo !== 'banner' && archivo);
      const quitadas = Object.fromEntries(
        Object.entries(imagenes).filter(([campo, { archivo }]) => campo !== 'banner' && !archivo).map(([campo]) => [campo, null]));
      const textosNuevos = Object.fromEntries(textosCambiados.map((campo) => [campo, textos[campo]]));
      if (menuCambiado) textosNuevos.menu_principal = menu;

      // Banners
      const bannersActuales = banners ?? obtenerBannersIniciales(configuracion);
      const nuevosArchivosBanner = bannersActuales.filter((b) => b.archivo).map((b) => b.archivo);
      let manifestBanners = null;
      if (bannersCambiados) {
        manifestBanners = bannersActuales.map((b) => {
          if (b.archivo) {
            const idx = nuevosArchivosBanner.indexOf(b.archivo);
            return `nuevo:${idx}`;
          }
          return `id:${b.id}`;
        });
      }

      const hayArchivos = nuevas.length > 0 || nuevosArchivosBanner.length > 0;
      if (hayArchivos) {
        const formulario = new FormData();
        Object.entries(textosNuevos).forEach(([campo, valor]) => formulario.append(campo, typeof valor === 'object' ? JSON.stringify(valor) : valor));
        nuevas.forEach(([campo, { archivo }]) => formulario.append(campo, archivo));
        if (destacadosCambiados) formulario.append('destacados', JSON.stringify(destacados));
        nuevosArchivosBanner.forEach((arch) => formulario.append('banner_fotos', arch));
        if (manifestBanners !== null) {
          formulario.append('banner_orden', JSON.stringify(manifestBanners));
        }
        await clienteAxios.patch('configuracion/negocio/', formulario, { headers: { 'Content-Type': undefined } });
      }

      const enJson = hayArchivos ? quitadas : { ...textosNuevos, ...quitadas, ...(destacadosCambiados ? { destacados } : {}) };
      if (manifestBanners !== null && !hayArchivos) {
        enJson.banner_orden = JSON.stringify(manifestBanners);
      }
      if (Object.keys(enJson).length) await clienteAxios.patch('configuracion/negocio/', enJson);

      const guardada = await recargarConfiguracion();
      liberarVistasPrevias();
      setImagenes({});
      setTextos(textosDe(guardada));
      setBanners(obtenerBannersIniciales(guardada));
      setDestacados(destacadosDe(guardada));
      setMenu(guardada?.menu_principal || {});
      setMensaje('Cambios guardados: ya están publicados en tu tienda.');
    } catch (error) {
      setErrores(erroresDe(error));
    } finally {
      setGuardando(false);
    }
  };

  // Lo que se dibuja: la configuración publicada con el borrador encima
  const listaBannersVista = (banners ?? obtenerBannersIniciales(configuracion)).map((b) => ({
    ...b,
    imagen: b.vistaPrevia || b.imagen,
  }));

  const vista = editando
    ? {
        ...configuracion,
        ...textos,
        menu_principal: menu,
        ...Object.fromEntries(Object.entries(imagenes).map(([campo, { vistaPrevia }]) => [campo, vistaPrevia])),
        banners: listaBannersVista,
      }
    : configuracion;

  return {
    editando, vista, textos, destacados, menu, hayCambios, guardando, errores, mensaje,
    banners: listaBannersVista,
    iniciar, cambiarTexto, cambiarImagen, agregarFotosBanner, reordenarFotosBanner, eliminarFotoBanner,
    agregarDestacado, moverDestacado, quitarDestacado, cambiarMenu,
    descartar, salir, guardar
  };
}
