import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clienteAxios from './auth/axiosConfig';
import { isAdminRoute } from '../hooks/useCookieConsent';
import useConfiguracionTienda from '../hooks/useConfiguracionTienda';
import './footer.css';

export const Footer = ({ onOpenCookiePreferences }) => {
  const { pathname } = useLocation();
  const configuracion = useConfiguracionTienda();
  const nombreTienda = configuracion?.nombre_tienda || 'Tienda';
  const [paginas, setPaginas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);

  useEffect(() => {
    const cargarPaginasLegales = async () => {
      try {
        const res = await clienteAxios.get('/ventas/paginas-legales/');
        const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
        setPaginas(data);
      } catch (error) {
        console.error('Error al obtener páginas legales para el footer:', error);
        // Una falla de red se distingue de "no hay páginas publicadas"
        setErrorConexion(true);
      } finally {
        setCargando(false);
      }
    };

    cargarPaginasLegales();
  }, []);

  return (
    <footer className="footer">
      <div className="contenedor footer-contenido">
        <div className="footer-marca">
          <p className="footer-nombre">{nombreTienda}</p>
          {configuracion?.subtitulo_bienvenida && (
            <p className="footer-descripcion">{configuracion.subtitulo_bienvenida}</p>
          )}
        </div>

        <nav className="footer-columna" aria-labelledby="footer-titulo-tienda">
          <h2 id="footer-titulo-tienda" className="footer-titulo">Tienda</h2>
          <ul>
            <li><Link to="/">Inicio</Link></li>
            <li><Link to="/catalogo">Catálogo</Link></li>
            <li><Link to="/seguimiento">Seguimiento de pedido</Link></li>
          </ul>
        </nav>

        {/* RF-03.5: las páginas legales publicadas aparecen enlazadas aquí */}
        <nav className="footer-columna" aria-labelledby="footer-titulo-legal">
          <h2 id="footer-titulo-legal" className="footer-titulo">Información legal</h2>
          {cargando ? (
            <p className="footer-aviso">Cargando enlaces...</p>
          ) : errorConexion ? (
            <p className="footer-aviso" role="status">No fue posible cargar la información legal.</p>
          ) : paginas.length > 0 ? (
            <ul>
              {paginas.map((pag) => (
                <li key={pag.id || pag.tipo_pagina}>
                  <Link to={`/legal/${pag.tipo_pagina.toLowerCase()}`}>{pag.titulo}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="footer-aviso">No hay páginas legales publicadas.</p>
          )}
          {!isAdminRoute(pathname) && onOpenCookiePreferences && (
            <button type="button" className="cookie-preferences-button" onClick={onOpenCookiePreferences}>
              Preferencias de cookies
            </button>
          )}
        </nav>
      </div>

      <div className="contenedor footer-pie">
        <p>© {new Date().getFullYear()} {nombreTienda}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
};

export default Footer;
