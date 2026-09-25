import React from 'react';

export default function ProductCardList({ producto, onSeleccionarVariante }) {
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
      }}
    >
      <div>
        <h4 style={{ margin: '0 0 10px 0' }}>
          {producto.nombre}
        </h4>

        {producto.atributos_globales &&
          Object.keys(producto.atributos_globales).length > 0 && (
            <div
              style={{
                padding: '10px',
                backgroundColor: '#f9f9f9',
                borderRadius: '5px',
              }}
            >
              <strong style={{ fontSize: '12px' }}>
                Ficha Técnica:
              </strong>

              <ul
                style={{
                  margin: '5px 0 0 0',
                  paddingLeft: '20px',
                  fontSize: '13px',
                }}
              >
                {Object.entries(producto.atributos_globales).map(
                  ([key, val]) => (
                    <li key={key}>
                      <b>{key.replace('_', ' ')}:</b>{' '}
                      {val}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}
      </div>

      <button
        onClick={() => onSeleccionarVariante(producto)}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Seleccionar variante
      </button>
    </div>
  );
}