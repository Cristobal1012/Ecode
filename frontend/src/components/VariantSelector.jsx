import { useEffect, useState } from 'react';

function VariantSelector({ producto, onAgregarAlCarrito }) {
  const [atributosSeleccionados, setAtributosSeleccionados] = useState({});
  const [mensaje, setMensaje] = useState('');
  const [cantidad, setCantidad] = useState(1); // Nuevo estado para manejar la cantidad

  // Reinicia la selección cuando cambia el producto
  useEffect(() => {
    setAtributosSeleccionados({});
    setMensaje('');
    setCantidad(1);
  }, [producto]);

  // Si todavía no se ha seleccionado un producto
  if (!producto) {
    return (
      <div>
        <p>No se ha seleccionado ningún producto.</p>
      </div>
    );
  }

  const variantes = producto.variantes || [];

  // Obtiene los nombres de los atributos
  const nombresAtributos = [
    ...new Set(
      variantes.flatMap((variante) =>
        Object.keys(variante.atributos_variables || {})
      )
    ),
  ];

  const obtenerValores = (atributo) => {
    return [
      ...new Set(
        variantes
          .map((variante) => variante.atributos_variables?.[atributo])
          .filter((valor) => valor !== undefined && valor !== null)
      ),
    ];
  };

  const encontrarVariante = (atributos) => {
    if (variantes.length === 0 || nombresAtributos.length === 0) {
      return null;
    }

    const todosSeleccionados = nombresAtributos.every(
      (atributo) => atributos[atributo] !== undefined
    );

    if (!todosSeleccionados) {
      return null;
    }

    return (
      variantes.find((variante) =>
        nombresAtributos.every(
          (atributo) =>
            variante.atributos_variables?.[atributo] === atributos[atributo]
        )
      ) || null
    );
  };

  const seleccionarAtributo = (atributo, valor) => {
    const nuevosAtributos = {
      ...atributosSeleccionados,
      [atributo]: valor,
    };

    setAtributosSeleccionados(nuevosAtributos);
    setCantidad(1); // Reiniciamos la cantidad al cambiar de variante

    const variante = encontrarVariante(nuevosAtributos);

    if (!variante) {
      setMensaje('');
      return;
    }

    if (Number(variante.stock) === 0) {
      setMensaje('Esta variante se encuentra agotada.');
      return;
    }

    setMensaje('');
  };

  const varianteSeleccionada = encontrarVariante(atributosSeleccionados);

  const agregarAlCarrito = () => {
    if (!varianteSeleccionada) {
      setMensaje('Selecciona una variante primero.');
      return;
    }

    if (Number(varianteSeleccionada.stock) === 0) {
      setMensaje('Esta variante se encuentra agotada.');
      return;
    }

    if (cantidad > Number(varianteSeleccionada.stock)) {
      setMensaje('No hay suficiente stock para esa cantidad.');
      return;
    }

    // Ejecutamos la función que nos pasaron desde DetalleProducto
    if (onAgregarAlCarrito) {
      onAgregarAlCarrito(varianteSeleccionada, cantidad);
      setMensaje(`¡Agregaste ${cantidad} unidad(es) al carrito!`);
    }
  };

  if (variantes.length === 0) {
    return (
      <div>
        <p>Este producto no tiene variantes disponibles.</p>
      </div>
    );
  }

  return (
    <div>
      {nombresAtributos.map((atributo) => (
        <div key={atributo} style={{ marginBottom: '15px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px' }}>
            {atributo.charAt(0).toUpperCase() + atributo.slice(1)}:
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {obtenerValores(atributo).map((valor) => {
              const seleccionado = atributosSeleccionados[atributo] === valor;

              return (
                <button
                  key={valor}
                  onClick={() => seleccionarAtributo(atributo, valor)}
                  style={{
                    padding: '8px 16px',
                    border: seleccionado ? '2px solid #2563eb' : '1px solid #d1d5db',
                    backgroundColor: seleccionado ? '#eff6ff' : 'white',
                    fontWeight: seleccionado ? 'bold' : 'normal',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {valor}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {varianteSeleccionada && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 10px 0', color: '#1f2937' }}>
            Precio: ${Number(varianteSeleccionada.precio).toLocaleString('es-CL')}
          </p>
          <p style={{ margin: '0 0 10px 0', color: Number(varianteSeleccionada.stock) > 0 ? '#166534' : '#ef4444', fontWeight: '500' }}>
            Stock disponible: {varianteSeleccionada.stock}
          </p>
          <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#6b7280' }}>
            SKU: {varianteSeleccionada.sku}
          </p>

          {/* Input numérico para la cantidad */}
          {Number(varianteSeleccionada.stock) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
              <label htmlFor="cantidad" style={{ fontWeight: '500', color: '#374151' }}>Cantidad:</label>
              <input 
                type="number" 
                id="cantidad"
                min="1" 
                max={varianteSeleccionada.stock}
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
                style={{ width: '70px', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', textAlign: 'center' }}
              />
            </div>
          )}
        </div>
      )}

      <button
        onClick={agregarAlCarrito}
        disabled={!varianteSeleccionada || Number(varianteSeleccionada.stock) === 0}
        style={{
            marginTop: '20px',
            padding: '12px 24px',
            backgroundColor: (!varianteSeleccionada || Number(varianteSeleccionada.stock) === 0) ? '#d1d5db' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: (!varianteSeleccionada || Number(varianteSeleccionada.stock) === 0) ? 'not-allowed' : 'pointer',
            width: '100%',
            fontSize: '1.1rem',
            transition: 'background-color 0.2s'
        }}
      >
        Agregar al carrito
      </button>

      {mensaje && (
        <p style={{ marginTop: '15px', color: '#16a34a', fontWeight: '600', textAlign: 'center', backgroundColor: '#dcfce7', padding: '10px', borderRadius: '6px' }}>
          {mensaje}
        </p>
      )}
    </div>
  );
}

export default VariantSelector;