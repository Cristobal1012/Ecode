import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useConfiguracionTienda from '../hooks/useConfiguracionTienda';

const TITULOS = {
  '/': 'Inicio', '/catalogo': 'Catálogo', '/checkout': 'Finalizar compra',
  '/login': 'Acceso y registro', '/seguimiento': 'Seguimiento de pedido',
  '/mis-direcciones': 'Mis direcciones', '/mis-pedidos': 'Mis pedidos',
  '/pago-exitoso': 'Resultado del pago', '/pedido-recibido': 'Pedido recibido',
  '/pago-cancelado': 'Pago cancelado', '/pago-rechazado': 'Pago rechazado',
  '/admin': 'Panel de administración', '/variantes': 'Selección de variantes', '/resena': 'Deja tu reseña',
};

export default function AccesibilidadNavegacion() {
  const { pathname } = useLocation();
  const configuracion = useConfiguracionTienda();
  const rutaAnterior = useRef(null);

  useEffect(() => {
    const cambioRuta = rutaAnterior.current !== pathname;
    const inicial = rutaAnterior.current === null;
    // Producto y página legal ponen su título al terminar la consulta. Una actualización
    // posterior de la configuración no debe sustituir esos metadatos específicos.
    const dinamica = pathname.startsWith('/catalogo/producto/') || pathname.startsWith('/legal/');
    if (cambioRuta || !dinamica) {
      document.title = `${TITULOS[pathname] || (dinamica ? 'Contenido de la tienda' : 'Tienda')} · ${configuracion?.nombre_tienda || 'Tienda'}`;
    }
    if (cambioRuta && !inicial && !document.activeElement?.closest('.cookie-banner')) {
      document.querySelector('main')?.focus({ preventScroll: true });
    }
    rutaAnterior.current = pathname;
  }, [pathname, configuracion?.nombre_tienda]);

  return <a className="saltar-contenido" href="#contenido" onClick={() => document.querySelector('main')?.focus()}>Saltar al contenido</a>;
}
