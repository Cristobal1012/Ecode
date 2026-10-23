import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clienteAxios from './auth/axiosConfig';
import { isAdminRoute } from '../hooks/useCookieConsent';
import useConfiguracionTienda from '../hooks/useConfiguracionTienda';
import './footer.css';

// Dirección del local en dos líneas; solo si el admin eligió mostrarla (la API no la entrega si no se usa)
const lineasDireccion = (configuracion) => {
  if (!configuracion?.mostrar_direccion_pie || !configuracion.calle_origen) return [];
  const { calle_origen, numero_origen, dpto_casa_origen, comuna_origen, region_origen } = configuracion;
  return [
    [calle_origen, numero_origen].filter(Boolean).join(' ') + (dpto_casa_origen ? `, ${dpto_casa_origen}` : ''),
    [comuna_origen, region_origen].filter(Boolean).join(', ')
  ].filter(Boolean);
};

export const Footer = ({ onOpenCookiePreferences, nombreTiendaTemporal = null }) => {
  const { pathname } = useLocation();
  const configuracion = useConfiguracionTienda();
  const nombreTienda =
    nombreTiendaTemporal ?? (configuracion?.nombre_tienda || 'Tienda');
  const direccion = lineasDireccion(configuracion);
  const correo = configuracion?.correo_contacto;
  const horario = configuracion?.horario_atencion?.trim();
  const instagram = configuracion?.instagram_usuario;
  const hayContacto = direccion.length > 0 || correo || horario || instagram;
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
      <div className={`contenedor footer-contenido${hayContacto ? ' footer-contenido--con-contacto' : ''}`}>
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
            {configuracion?.blog_activo && <li><Link to="/blog">{configuracion.blog_nombre || 'Nosotros'}</Link></li>}
            <li><Link to="/seguimiento">Seguimiento de pedido</Link></li>
            {configuracion?.cotizaciones_activas && <li><Link to="/cotizar">Cotizar un encargo</Link></li>}
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

        {/* Contacto de la tienda: lo edita el admin en Configuración > Contacto y Redes */}
        {hayContacto && (
          <section className="footer-columna" aria-labelledby="footer-titulo-contacto">
            <h2 id="footer-titulo-contacto" className="footer-titulo">Contacto</h2>
            <address className="footer-contacto">
              {direccion.length > 0 && (
                <p className="footer-dato">
                  <span className="visualmente-oculto">Dirección: </span>
                  {direccion.map((linea) => <span key={linea} className="footer-linea">{linea}</span>)}
                </p>
              )}
              {correo && (
                <p className="footer-dato">
                  <a href={`mailto:${correo}`}>{correo}</a>
                </p>
              )}
              {horario && (
                <p className="footer-dato">
                  <span className="footer-etiqueta">Horario</span>
                  <span className="footer-horario">{horario}</span>
                </p>
              )}
              {instagram && (
                <p className="footer-dato">
                  <a href={`https://www.instagram.com/${encodeURIComponent(instagram)}/`} target="_blank" rel="noopener noreferrer">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
                    </svg>
                    @{instagram}
                    <span className="visualmente-oculto"> en Instagram (se abre en una pestaña nueva)</span>
                  </a>
                </p>
              )}
            </address>
          </section>
        )}
      </div>

      <div className="contenedor footer-pie">
        <p>© {new Date().getFullYear()} {nombreTienda}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
};

export default Footer;
