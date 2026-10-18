import { useNavigate } from 'react-router-dom';
import { obtenerDatosPrecioYStock } from '../utils/precios';

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

export default function ProductCardList({ producto }) {
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        backgroundColor: '#fff'
      }}
    >
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0 }}>
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
                top: '4px',
                left: '4px',
                backgroundColor: '#dc2626',
                color: '#fff',
                fontSize: '0.65rem',
                fontWeight: 'bold',
                padding: '2px 4px',
                borderRadius: '3px',
                textTransform: 'uppercase'
              }}
            >
              Agotado
            </span>
          )}
        </div>
        <div>
          <h4 style={{ margin: '0 0 5px 0', color: '#111827' }}>
            {producto.nombre}
          </h4>

          <div style={{ marginBottom: '8px' }}>
            {agotado ? (
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                Agotado
              </span>
            ) : tieneOferta ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem', color: '#dc2626', fontWeight: 'bold' }}>
                  {textoPrecio}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#999', textDecoration: 'line-through' }}>
                  {precioTachado}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                {textoPrecio}
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 8px 0' }}>
            Categoría: {producto.categoria}
          </p>
          
          <div style={{ margin: '4px 0 8px 0' }}>
            <span style={{
              fontSize: '1.2rem',
              fontWeight: 'bold',
              color: infoPrecio.agotado ? '#dc2626' : '#111827'
            }}>
              {infoPrecio.texto}
            </span>
          </div>

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
          backgroundColor: 'var(--color-primary)',
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