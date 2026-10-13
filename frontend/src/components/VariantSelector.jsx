import { useEffect, useState } from 'react';

function VariantSelector({ producto, onAgregarAlCarrito }) {
  const [atributosSeleccionados, setAtributosSeleccionados] = useState({});
  // { tipo: 'exito' | 'error', texto }
  const [mensaje, setMensaje] = useState(null);
  const [cantidad, setCantidad] = useState(1); // Nuevo estado para manejar la cantidad
  const [agregando, setAgregando] = useState(false);

  // Reinicia la selección cuando cambia el producto (no cuando solo se actualiza su stock)
  const productoId = producto?.id;
  useEffect(() => {
    setAtributosSeleccionados({});
    setMensaje(null);
    setCantidad(1);
  }, [productoId]);

  const error = (texto) => setMensaje({ tipo: 'error', texto });

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
      setMensaje(null);
      return;
    }

    if (Number(variante.stock) === 0) {
      error('Esta variante se encuentra agotada.');
      return;
    }

    setMensaje(null);
  };

  const varianteSeleccionada = encontrarVariante(atributosSeleccionados);

  const agregarAlCarrito = async () => {
    if (!varianteSeleccionada) {
      error('Selecciona una variante primero.');
      return;
    }

    if (Number(varianteSeleccionada.stock) === 0) {
      error('Esta variante se encuentra agotada.');
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      error('La cantidad debe ser al menos 1.');
      return;
    }

    if (cantidad > Number(varianteSeleccionada.stock)) {
      error('No hay suficiente stock para esa cantidad.');
      return;
    }

    // Ejecutamos la función que nos pasaron desde DetalleProducto; el servidor confirma el stock
    if (onAgregarAlCarrito) {
      setAgregando(true);
      setMensaje(null);
      const resultado = await onAgregarAlCarrito(varianteSeleccionada, cantidad);
      setAgregando(false);
      setMensaje({ tipo: resultado.ok ? 'exito' : 'error', texto: resultado.mensaje });
    }
  };

  const sinStock = !varianteSeleccionada || Number(varianteSeleccionada.stock) === 0;

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
        disabled={sinStock || agregando}
        style={{
            marginTop: '20px',
            padding: '12px 24px',
            backgroundColor: sinStock || agregando ? '#d1d5db' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: sinStock || agregando ? 'not-allowed' : 'pointer',
            width: '100%',
            fontSize: '1.1rem',
            transition: 'background-color 0.2s'
        }}
      >
        {agregando ? 'Verificando stock...' : 'Agregar al carrito'}
      </button>

      {mensaje && (
        <p
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          style={{
            marginTop: '15px', fontWeight: '600', textAlign: 'center', padding: '10px', borderRadius: '6px',
            color: mensaje.tipo === 'error' ? '#991b1b' : '#166534',
            backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : '#dcfce7'
          }}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}

export default VariantSelector;