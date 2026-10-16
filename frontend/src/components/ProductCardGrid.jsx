import { useNavigate } from 'react-router-dom';
import { obtenerDatosPrecioYStock } from '../utils/precios';

export default function ProductCardGrid({ producto }) {
  const navigate = useNavigate();
  const id = producto.id || producto._id;
  const imagenPrincipal = producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes[0] : null;
  const { agotado, textoPrecio, precioTachado, tieneOferta } = obtenerDatosPrecioYStock(producto.variantes);

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
        justifyContent: 'space-between',
        position: 'relative'
      }}
    >
      <div>
        <div style={{ position: 'relative', width: '100%', height: '180px', marginBottom: '10px' }}>
          {imagenPrincipal ? (
            <img 
              src={imagenPrincipal} 
              alt={producto.nombre} 
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '6px' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', backgroundColor: '#f3f4f6', borderRadius: '6px' }} />
          )}
          {agotado && (
            <span
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                padding: '4px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Agotado
            </span>
          )}
        </div>
        <h4 style={{ margin: '0 0 10px 0', color: 'var(--color-primary)' }}>
          {producto.nombre}
        </h4>
        
        <div style={{ marginBottom: '10px', minHeight: '44px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {agotado ? (
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
              Agotado
            </span>
          ) : tieneOferta ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through' }}>
                {precioTachado}
              </span>
              <span style={{ fontSize: '1.25rem', color: '#dc2626', fontWeight: 'bold' }}>
                {textoPrecio}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
              {textoPrecio}
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.9rem', color: '#666', margin: '0 0 10px 0' }}>
          {producto.categoria}
        </p>

        {producto.atributos_globales &&
          Object.keys(producto.atributos_globales).length > 0 && (
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