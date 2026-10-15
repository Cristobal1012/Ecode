import React from 'react';
import { useNavigate } from 'react-router-dom';


const obtenerInfoPrecio = (variantes) => {
  
  if (!variantes || variantes.length === 0) {
    return { texto: 'Agotado', agotado: true };
  }

  
  const variantesConStock = variantes.filter(v => v.stock > 0);

  
  if (variantesConStock.length === 0) {
    return { texto: 'Agotado', agotado: true };
  }

  
  const precios = variantesConStock.map(v => Number(v.precio));
  const minPrecio = Math.min(...precios);
  const maxPrecio = Math.max(...precios);

  
  const formatear = (valor) => `$${valor.toLocaleString('es-CL')}`;

  
  if (minPrecio === maxPrecio) {
    return { texto: formatear(minPrecio), agotado: false };
  } else {
    return { texto: `Desde ${formatear(minPrecio)}`, agotado: false };
  }
};

export default function ProductCardGrid({ producto }) {
  
  const navigate = useNavigate();
  const id = producto.id || producto._id;
  const imagenPrincipal = producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes[0] : null;

  
  const infoPrecio = obtenerInfoPrecio(producto.variantes);

  return (
    <div
      style={{
        border: '1px solid #ccc',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <div>
        {imagenPrincipal && (
          <img
            src={imagenPrincipal}
            alt={producto.nombre}
            style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px' }}
          />
        )}
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--color-primary)' }}>
          {producto.nombre}
        </h4>
        <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 10px 0' }}>
          {producto.categoria}
        </p>

        
        <div style={{ margin: '10px 0' }}>
          {/* Espacio preparado para RF-04.1 (Precio oferta) con texto tachado */}
          
          <span style={{
            fontSize: '1.2rem',
            fontWeight: 'bold',
            color: infoPrecio.agotado ? '#dc2626' : 'var(--color-primary)' // Rojo si está agotado
          }}>
            {infoPrecio.texto}
          </span>
        </div>
        {/* ------------------------------- */}

        {producto.atributos_globales && Object.keys(producto.atributos_globales).length > 0 && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px',
              backgroundColor: '#f9f9f9',
              borderRadius: '5px',
            }}
          >
            <strong style={{ fontSize: '12px' }}>Ficha Técnica:</strong>
            <ul style={{ margin: '5px 0 0 0', paddingLeft: '15px', fontSize: '12px' }}>
              {Object.entries(producto.atributos_globales).map(([key, val]) => (
                <li key={key}>
                  <b>{key.replace('_', ' ')}:</b> {val}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate(`/catalogo/producto/${id}`)}
        style={{
          marginTop: '15px',
          padding: '10px 12px',
          cursor: 'pointer',
          backgroundColor: 'var(--color-secondary)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          width: '100%'
        }}
      >
        Ver producto
      </button>
    </div>
  );
}