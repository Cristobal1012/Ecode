import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clienteAxios from './auth/axiosConfig';
import { isAdminRoute } from '../hooks/useCookieConsent';
import useConfiguracionTienda from '../hooks/useConfiguracionTienda';
import logoUniversidad from './header/logoU.png';
import { resolverMenu } from '../utils/menuPrincipal';
import './footer.css';

// Redes sociales del pie: solo se muestran las que el admin cargó (Configuración > Contacto y Redes)
const REDES_SOCIALES = [
  { campo: 'facebook_url', nombre: 'Facebook', icono: 'M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12z' },
  { campo: 'x_url', nombre: 'X', icono: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zm-1.29 19.49h2.039L6.486 3.24H4.298z' },
  { campo: 'youtube_url', nombre: 'YouTube', icono: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z' },
  { campo: 'tiktok_url', nombre: 'TikTok', icono: 'M16.7 0h-4.1v16.5a3.5 3.5 0 1 1-3-3.5V8.8a7.7 7.7 0 1 0 7.1 7.7V8.1a10 10 0 0 0 5.8 1.9V5.9A5.9 5.9 0 0 1 16.7 0z' },
];

// Dirección del local en dos líneas; solo si el admin eligió mostrarla (la API no la entrega si no se usa)
const lineasDireccion = (configuracion) => {
  if (!configuracion?.mostrar_direccion_pie || !configuracion.calle_origen) return [];
  const { calle_origen, numero_origen, dpto_casa_origen, comuna_origen, region_origen } = configuracion;
  return [
    [calle_origen, numero_origen].filter(Boolean).join(' ') + (dpto_casa_origen ? `, ${dpto_casa_origen}` : ''),
    [comuna_origen, region_origen].filter(Boolean).join(', ')
  ].filter(Boolean);
};

// marcaTemporal: en modo edición de la landing, el borrador del nombre, el logo y la ubicación del logo de la
// Universidad, para ver el cambio antes de guardarlo
export const Footer = ({ onOpenCookiePreferences, marcaTemporal = null }) => {
  const { pathname } = useLocation();
  const publicada = useConfiguracionTienda();
  const configuracion = marcaTemporal ? { ...publicada, ...marcaTemporal } : publicada;
  const nombreTienda = marcaTemporal ? marcaTemporal.nombre_tienda : (configuracion?.nombre_tienda || 'Tienda');
  // RN-01: si el admin lo llevó aquí, el logo de la Universidad va en el footer y más grande; el de la tienda
  // sigue en el header
  const universidadEnFooter = configuracion?.ubicacion_logo_universidad === 'FOOTER';
  const direccion = lineasDireccion(configuracion);
  const correo = configuracion?.correo_contacto;
  const horario = configuracion?.horario_atencion?.trim();
  const instagram = configuracion?.instagram_usuario;
  const telefono = configuracion?.telefono_comercial;
  const redesSociales = REDES_SOCIALES.filter((red) => configuracion?.[red.campo]);
  const hayContacto = Boolean(direccion.length > 0 || correo || horario || instagram || telefono || redesSociales.length > 0);
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
          {universidadEnFooter && (
            <img className="footer-logo-universidad" src={logoUniversidad} alt="Logo de la Universidad Autónoma" />
          )}
        </div>

        <nav className="footer-columna" aria-labelledby="footer-titulo-tienda">
          <h2 id="footer-titulo-tienda" className="footer-titulo">Tienda</h2>
          <ul>
            {/* El mismo orden y los mismos nombres del menú; el seguimiento va siempre al final */}
            {resolverMenu(configuracion).filter((enlace) => enlace.visible).map((enlace) => (
              <li key={enlace.id}><Link to={enlace.to}>{enlace.nombre}</Link></li>
            ))}
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
              {/* Teléfono comercial: permite llamar directamente desde dispositivos compatibles */}
              {telefono && (
                <p className="footer-dato">
                  <a href={`tel:${telefono}`} aria-label={`Llamar a ${nombreTienda} al ${telefono}`}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.19 18a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 1.09 3.18 2 2 0 0 1 3.08 1h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.81a2 2 0 0 1-.45 2.11L7.04 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.68A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {telefono}
                  </a>
                </p>
              )}
              {redesSociales.map((red) => (
                <p className="footer-dato" key={red.campo}>
                  <a href={configuracion[red.campo]} target="_blank" rel="noopener noreferrer"
                    aria-label={`${red.nombre} de ${nombreTienda} (se abre en una pestaña nueva)`}>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d={red.icono} />
                    </svg>
                    {red.nombre}
                  </a>
                </p>
              ))}
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
