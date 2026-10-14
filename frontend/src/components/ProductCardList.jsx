import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProductCardList({ producto }) {
  const navigate = useNavigate();
  const id = producto.id || producto._id;
  const imagenPrincipal = producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes[0] : null;

  return (
    <div
      style={{
        border: '1px solid #ccc',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        backgroundColor: '#fff'
      }}
    >
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        {imagenPrincipal && (
          <img 
            src={imagenPrincipal} 
            alt={producto.nombre} 
            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px' }}
          />
        )}
        <div>
          <h4 style={{ margin: '0 0 5px 0', color: 'var(--color-primary)' }}>
            {producto.nombre}
          </h4>

        <div style={{ marginBottom: '10px' }}>
          {producto.variantes && producto.variantes[0] && (
            producto.variantes[0].precio_oferta ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through' }}>
                  ${producto.variantes[0].precio}
                </span>
                <span style={{ fontSize: '1.2rem', color: '#e60000', fontWeight: 'bold' }}>
                  ${producto.variantes[0].precio_oferta}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                ${producto.variantes[0].precio}
              </span>
            )
          )}
        </div>

          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 8px 0' }}>
            Categoría: {producto.categoria}
          </p>

          {producto.atributos_globales &&
            Object.keys(producto.atributos_globales).length > 0 && (
              <span style={{ fontSize: '12px', color: '#555' }}>
                {Object.entries(producto.atributos_globales)
                  .map(([key, val]) => `${key.replace('_', ' ')}: ${val}`)
                  .join(' | ')}
              </span>
            )}
        </div>
      </div>

      <button
        onClick={() => navigate(`/catalogo/producto/${id}`)}
        style={{
          padding: '10px 16px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          backgroundColor: 'var(--color-secondary)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold'
        }}
      >
        Ver producto
      </button>
    </div>
  );
}