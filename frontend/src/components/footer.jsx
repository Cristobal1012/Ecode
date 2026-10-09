import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export const Footer = () => {
  const [paginas, setPaginas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarPaginasLegales = async () => {
      try {
        // Endpoint que expone las páginas legales
        const res = await axios.get('http://127.0.0.1:8000/api/ventas/paginas-legales/');
        // Aseguramos que solo se listen las publicadas
        const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
        const publicadas = data.filter(p => p.publicada !== false && p.es_publica !== false);
        setPaginas(publicadas);
      } catch (error) {
        console.error('Error al obtener páginas legales para el footer:', error);
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
                <li key={pag.id || pag.slug}>
                  <Link
                    to={`/legal/${pag.slug || pag.id}`}
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'none',
                      fontSize: '0.9rem'
                    }}
                  >
                    {pag.titulo || pag.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
              No hay páginas legales publicadas.
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;