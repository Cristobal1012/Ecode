import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clienteAxios from './auth/axiosConfig';
import { isAdminRoute } from '../hooks/useCookieConsent';

export const Footer = ({ onOpenCookiePreferences }) => {
  const { pathname } = useLocation();
  const [paginas, setPaginas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);

  useEffect(() => {
    const cargarPaginasLegales = async () => {
      try {
        setErrorConexion(false);
        // Corrección Error 1: Petición mediante la instancia centralizada y ruta relativa
        const res = await clienteAxios.get('/ventas/paginas-legales/');
        // Corrección Error 3: Sin filtrado de atributos inexistentes (publicada/es_publica)
        const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
        setPaginas(data);
      } catch (error) {
        console.error('Error al obtener páginas legales para el footer:', error);
        // Corrección Error 2: Flag explícito de falla de infraestructura/red
        setErrorConexion(true);
      } finally {
        setCargando(false);
      }
    };

    cargarPaginasLegales();
  }, []);

  return (
    <footer style={{
      backgroundColor: '#1f2937',
      color: '#f9fafb',
      padding: '30px 20px',
      marginTop: 'auto',
      borderTop: '1px solid #374151'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>
            © {new Date().getFullYear()} Ecode. Todos los derechos reservados.
          </p>
        </div>

        <div>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#9ca3af' }}>
            Información Legal
          </h4>
          {cargando ? (
            <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Cargando enlaces...</span>
          ) : errorConexion ? (
            /* Corrección Error 2: Distinción visual para fallas técnicas */
            <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>
              No fue posible cargar la información legal.
            </span>
          ) : paginas.length > 0 ? (
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              gap: '15px',
              flexWrap: 'wrap'
            }}>
              {paginas.map((pag) => (
                <li key={pag.id || pag.tipo_pagina}>
                  <Link
                    to={`/legal/${pag.tipo_pagina.toLowerCase()}`}
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'none',
                      fontSize: '0.9rem'
                    }}
                  >
                    {pag.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              No hay páginas legales publicadas.
            </span>
          )}
          {!isAdminRoute(pathname) && onOpenCookiePreferences && (
            <button type="button" className="cookie-preferences-button" onClick={onOpenCookiePreferences}>
              Preferencias de cookies
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
