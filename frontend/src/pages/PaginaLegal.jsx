import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
// Mismas clases que el editor: alineaciones, sangrías y viñetas de las listas
import 'react-quill-new/dist/quill.snow.css';
import clienteAxios from '../components/auth/axiosConfig';
import Header from '../components/header/header';

// RF-03.5: página pública de Términos, Privacidad o Reembolsos (solo si está publicada)
export default function PaginaLegal() {
  const { tipo } = useParams();
  // Se guarda a qué tipo corresponde: si no coincide con la URL, la página aún está cargando
  const [resultado, setResultado] = useState({ tipo: null, pagina: null, error: null });

  useEffect(() => {
    clienteAxios.get(`ventas/paginas-legales/${encodeURIComponent(tipo)}/`)
      .then(({ data }) => setResultado({ tipo, pagina: data, error: null }))
      .catch((error) => setResultado({
        tipo,
        pagina: null,
        error: error.response?.status === 404 ? 'no-encontrada' : 'conexion'
      }));
  }, [tipo]);

  const cargando = resultado.tipo !== tipo;
  const { pagina, error } = resultado;

  useEffect(() => {
    if (pagina) document.title = pagina.titulo;
  }, [pagina]);

  return (
    <div style={{ backgroundColor: 'var(--color-background, #f3f4f6)', minHeight: '100vh' }}>
      <Header />

      <section style={{ maxWidth: '800px', margin: '40px auto', padding: '30px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        {cargando ? (
          <p style={{ color: '#4b5563' }}>Cargando...</p>
        ) : pagina ? (
          <article>
            <h1 style={{ color: '#1f2937', fontSize: '2rem', marginBottom: '8px' }}>{pagina.titulo}</h1>
            <p style={{ color: '#4b5563', fontSize: '0.9rem', marginTop: 0 }}>
              Última actualización: {new Date(pagina.ultima_actualizacion).toLocaleDateString('es-CL', { dateStyle: 'long' })}
            </p>
            <div className="ql-snow">
              {/* El servidor limpia este HTML al guardarlo: solo queda el formato del editor */}
              <div className="ql-editor" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: pagina.contenido }} />
            </div>
          </article>
        ) : (
          <div role={error === 'conexion' ? 'alert' : undefined}>
            <h1 style={{ color: '#1f2937', fontSize: '1.6rem' }}>
              {error === 'conexion' ? 'No pudimos cargar esta página' : 'Página no encontrada'}
            </h1>
            <p style={{ color: '#4b5563' }}>
              {error === 'conexion'
                ? 'Revisa tu conexión e inténtalo nuevamente.'
                : 'La página legal que buscas no existe o aún no está publicada.'}
            </p>
            <Link to="/catalogo" style={{ color: 'var(--color-primary, #2563eb)', fontWeight: 'bold' }}>Ir al catálogo</Link>
          </div>
        )}
      </section>
    </div>
  );
}
