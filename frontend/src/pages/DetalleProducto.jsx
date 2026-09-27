import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import Header from '../components/header/header';
import VariantSelector from '../components/VariantSelector';

export default function DetalleProducto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    clienteAxios.get(`catalogo/productos/${id}/`)
      .then(({ data }) => {
        setProducto(data);
        setCargando(false);
      })
      .catch((err) => {
        console.error('Error al cargar el detalle del producto:', err);
        setError('No se pudo encontrar el producto.');
        setCargando(false);
      });
  }, [id]);

  if (cargando) return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando producto...</div>;
  if (error || !producto) return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>{error || 'Producto no disponible'}</div>;

  return (
    <div style={{ backgroundColor: 'var(--color-background)', minHeight: '100vh', paddingBottom: '50px' }}>
      <Header />
      <div style={{ maxWidth: '1000px', margin: '30px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <button 
          onClick={() => navigate('/catalogo')}
          style={{ marginBottom: '20px', padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          ← Volver al Catálogo
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
          {/* Columna de Imágenes */}
          <div>
            {producto.imagenes && producto.imagenes.length > 0 ? (
              <img 
                src={producto.imagenes[0]} 
                alt={producto.nombre} 
                style={{ width: '100%', height: '400px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            ) : (
              <div style={{ width: '100%', height: '400px', backgroundColor: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                Sin imagen disponible
              </div>
            )}
          </div>

          {/* Columna de Información y Variantes */}
          <div>
            <span style={{ backgroundColor: '#e5e7eb', padding: '4px 10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}>
              {producto.categoria}
            </span>
            <h1 style={{ 
                margin: '15px 0 10px 0', 
                color: 'var(--color-primary)', 
                fontSize: '2rem', 
                lineHeight: '1.2' // <-- ESTO SOLUCIONA EL SOLAPAMIENTO
            }}>
                {producto.nombre}
            </h1>
            <p style={{ color: '#4b5563', lineHeight: '1.6', marginBottom: '20px' }}>{producto.descripcion || 'Sin descripción disponible.'}</p>

            {/* Ficha Técnica / Atributos Globales */}
            {producto.atributos_globales && Object.keys(producto.atributos_globales).length > 0 && (
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <strong>Ficha Técnica:</strong>
                <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', fontSize: '0.9rem' }}>
                  {Object.entries(producto.atributos_globales).map(([key, val]) => (
                    <li key={key}><b>{key.replace('_', ' ')}:</b> {val}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Selector de Variantes (Tallas, Colores, Stock, Precios) */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
              <VariantSelector producto={producto} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}