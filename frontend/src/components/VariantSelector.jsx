import { useId, useState, useEffect } from 'react';

function VariantSelector({ producto, onAgregarAlCarrito }) {
  const [atributosSeleccionados, setAtributosSeleccionados] = useState({});
  // { tipo: 'exito' | 'error', texto }
  const [mensaje, setMensaje] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [agregando, setAgregando] = useState(false);
  // Prefijo único para los ids de los títulos de cada grupo de atributos
  const idBase = useId();

  // Sincroniza con el carrito local para descontar lo que el usuario ya agregó
  const [itemsCarrito, setItemsCarrito] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('carrito_local')) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const sincronizarCarrito = () => {
      try {
        setItemsCarrito(JSON.parse(localStorage.getItem('carrito_local')) || []);
      } catch {
        setItemsCarrito([]);
      }
    };
    window.addEventListener('carritoActualizado', sincronizarCarrito);
    window.addEventListener('storage', sincronizarCarrito);
    return () => {
      window.removeEventListener('carritoActualizado', sincronizarCarrito);
      window.removeEventListener('storage', sincronizarCarrito);
    };
  }, []);

  const obtenerCantidadEnCarrito = (sku) => {
    if (!sku) return 0;
    const item = itemsCarrito.find(i => i.sku === sku);
    return item ? Number(item.cantidad) || 0 : 0;
  };

  // Reinicia la selección cuando cambia el producto (no cuando solo se actualiza su stock).
  // Se ajusta durante el render, como recomienda React, en vez de usar un efecto.
  const productoId = producto?.id;
  const [productoAnterior, setProductoAnterior] = useState(productoId);
  if (productoId !== productoAnterior) {
    setProductoAnterior(productoId);
    setAtributosSeleccionados({});
    setMensaje(null);
    setCantidad(1);
  }

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
    setCantidad(1);

    const variante = encontrarVariante(nuevosAtributos);
    if (!variante) {
      setMensaje(null);
      return;
    }

    const totalStock = Number(variante.stock) || 0;
    const enCarro = obtenerCantidadEnCarrito(variante.sku);
    const disp = Math.max(0, totalStock - enCarro);

    if (totalStock === 0) {
      error('Esta variante se encuentra agotada.');
      return;
    }

    if (disp === 0) {
      error(`Esta opción está agotada: ya tienes las ${totalStock} unidad(es) en tu carrito.`);
      return;
    }

    setMensaje(null);
  };

  const varianteSeleccionada = encontrarVariante(atributosSeleccionados);
  const stockTotal = varianteSeleccionada ? Number(varianteSeleccionada.stock) || 0 : 0;
  const enCarrito = varianteSeleccionada ? obtenerCantidadEnCarrito(varianteSeleccionada.sku) : 0;
  const stockDisponibleParaAgregar = Math.max(0, stockTotal - enCarrito);

  const tieneOferta = Boolean(
    varianteSeleccionada?.precio_oferta != null &&
    Number(varianteSeleccionada.precio_oferta) > 0 &&
    Number(varianteSeleccionada.precio_oferta) < Number(varianteSeleccionada.precio)
  );

  const sinStock = !varianteSeleccionada || stockTotal === 0 || stockDisponibleParaAgregar === 0;

  const agregarAlCarrito = async () => {
    if (!varianteSeleccionada) {
      error('Selecciona una variante primero.');
      return;
    }

    if (stockTotal === 0) {
      error('Esta variante se encuentra agotada.');
      return;
    }

    if (stockDisponibleParaAgregar <= 0) {
      error(`Ya tienes todas las unidades disponibles (${stockTotal}) en tu carrito.`);
      return;
    }

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      error('La cantidad debe ser al menos 1.');
      return;
    }

    if (cantidad > stockDisponibleParaAgregar) {
      error(`Solo puedes agregar hasta ${stockDisponibleParaAgregar} unidad(es) más.`);
      return;
    }

    // Ejecutamos la función que nos pasaron desde DetalleProducto; el servidor confirma el stock
    if (onAgregarAlCarrito) {
      setAgregando(true);
      setMensaje(null);
      const resultado = await onAgregarAlCarrito(varianteSeleccionada, cantidad);
      setAgregando(false);
      setMensaje({ tipo: resultado.ok ? 'exito' : 'error', texto: resultado.mensaje });
      if (resultado.ok) {
        setCantidad(1);
      }
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
      {nombresAtributos.map((atributo, indice) => (
        <div key={atributo} style={{ marginBottom: '15px' }}>
          <h3 id={`${idBase}-atributo-${indice}`} style={{ fontSize: '1.1rem', marginBottom: '10px' }}>
            {atributo.charAt(0).toUpperCase() + atributo.slice(1)}:
          </h3>

          <div
            role="group"
            aria-labelledby={`${idBase}-atributo-${indice}`}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}
          >
            {obtenerValores(atributo).map((valor) => {
              const seleccionado = atributosSeleccionados[atributo] === valor;
              const tentativa = encontrarVariante({ ...atributosSeleccionados, [atributo]: valor });
              const tentStock = tentativa ? Number(tentativa.stock) || 0 : null;
              const tentEnCarrito = tentativa ? obtenerCantidadEnCarrito(tentativa.sku) : 0;
              const tentAgotada = tentativa && (tentStock === 0 || tentStock - tentEnCarrito <= 0);

              return (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={seleccionado}
                  onClick={() => seleccionarAtributo(atributo, valor)}
                  style={{
                    padding: '8px 16px',
                    border: seleccionado ? '2px solid #2563eb' : '1px solid #d1d5db',
                    backgroundColor: seleccionado ? '#eff6ff' : (tentAgotada ? '#f3f4f6' : 'white'),
                    color: tentAgotada && !seleccionado ? '#9ca3af' : '#1f2937',
                    fontWeight: seleccionado ? 'bold' : 'normal',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title={tentAgotada ? 'Opción sin stock disponible' : ''}
                >
                  {valor} {tentAgotada ? '(Agotado)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {varianteSeleccionada && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          
          <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>Precio:</span>
            {tieneOferta ? (
              <>
                <span style={{ fontSize: '1.4rem', color: '#dc2626', fontWeight: 'bold' }}>
                  ${Number(varianteSeleccionada.precio_oferta).toLocaleString('es-CL')}
                </span>
                <span style={{ fontSize: '1rem', color: '#9ca3af', textDecoration: 'line-through' }}>
                  ${Number(varianteSeleccionada.precio).toLocaleString('es-CL')}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#1f2937' }}>
                ${Number(varianteSeleccionada.precio).toLocaleString('es-CL')}
              </span>
            )}
          </div>

          <p style={{ margin: '0 0 10px 0', color: stockDisponibleParaAgregar > 0 ? '#166534' : '#ef4444', fontWeight: '500' }}>
            {stockTotal === 0
              ? 'Agotado'
              : stockDisponibleParaAgregar === 0
                ? `Agotado (ya tienes las ${stockTotal} unidades disponibles en tu carrito)`
                : `Stock disponible: ${stockDisponibleParaAgregar}${enCarrito > 0 ? ` (${enCarrito} en tu carrito)` : ''}`}
          </p>

          <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#6b7280' }}>
            SKU: {varianteSeleccionada.sku}
          </p>

          {/* Input numérico para la cantidad */}
          {stockDisponibleParaAgregar > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
              <label htmlFor="cantidad" style={{ fontWeight: '500', color: '#374151' }}>Cantidad:</label>
              <input 
                type="number" 
                id="cantidad"
                min="1" 
                max={stockDisponibleParaAgregar}
                value={cantidad}
                onChange={(e) => setCantidad(Math.min(stockDisponibleParaAgregar, Math.max(1, Number(e.target.value))))}
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
        {agregando 
          ? 'Verificando stock...' 
          : stockTotal === 0 
            ? 'Agotado' 
            : stockDisponibleParaAgregar === 0 
              ? 'Agotado (en tu carrito)' 
              : 'Agregar al carrito'}
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