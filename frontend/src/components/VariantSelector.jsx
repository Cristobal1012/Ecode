import { useEffect, useState } from 'react';

function VariantSelector({ producto }) {
  const [atributosSeleccionados, setAtributosSeleccionados] = useState({});
  const [mensaje, setMensaje] = useState('');

  // Reinicia la selección cuando cambia el producto
  useEffect(() => {
    setAtributosSeleccionados({});
    setMensaje('');
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
          .map(
            (variante) =>
              variante.atributos_variables?.[atributo]
          )
          .filter(
            (valor) => valor !== undefined && valor !== null
          )
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
            variante.atributos_variables?.[atributo] ===
            atributos[atributo]
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

  const varianteSeleccionada = encontrarVariante(
    atributosSeleccionados
  );

  const agregarAlCarrito = () => {
    if (!varianteSeleccionada) {
      setMensaje('Selecciona una variante primero.');
      return;
    }

    if (Number(varianteSeleccionada.stock) === 0) {
      setMensaje('Esta variante se encuentra agotada.');
      return;
    }

    setMensaje(
      `Variante ${varianteSeleccionada.sku} agregada al carrito.`
    );
  };

  if (variantes.length === 0) {
    return (
      <div>
        <h2>{producto.nombre}</h2>
        <p>Este producto no tiene variantes disponibles.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{producto.nombre}</h2>

      {nombresAtributos.map((atributo) => (
        <div key={atributo}>
          <h3>
            {atributo.charAt(0).toUpperCase() +
              atributo.slice(1)}
            :
          </h3>

          {obtenerValores(atributo).map((valor) => {
            const seleccionado =
              atributosSeleccionados[atributo] === valor;

            return (
              <button
                key={valor}
                onClick={() =>
                  seleccionarAtributo(atributo, valor)
                }
                style={{
                  marginRight: '8px',
                  marginBottom: '8px',
                  opacity: seleccionado ? 0.6 : 1,
                }}
              >
                {valor}
              </button>
            );
          })}
        </div>
      ))}

      {varianteSeleccionada && (
        <div>
          <p>
            Precio: $
            {Number(varianteSeleccionada.precio).toLocaleString(
              'es-CL'
            )}
          </p>

          <p>
            Stock disponible: {varianteSeleccionada.stock}
          </p>

          <p>
            SKU: {varianteSeleccionada.sku}
          </p>
        </div>
      )}

      <button
        onClick={agregarAlCarrito}
        disabled={
          !varianteSeleccionada ||
          Number(varianteSeleccionada.stock) === 0
        }
      >
        Agregar al carrito
      </button>

      {mensaje && <p>{mensaje}</p>}
    </div>
  );
}

export default VariantSelector;