
import { useState } from 'react';

const productoPrueba = {
  nombre: 'Polera de prueba',
  variantes: [
    {
      sku: 'TEST-M-ROJO',
      precio: 19990,
      stock: 5,
      atributos_variables: {
        talla: 'M',
        color: 'Rojo',
      },
    },
    {
      sku: 'TEST-L-ROJO',
      precio: 19990,
      stock: 0,
      atributos_variables: {
        talla: 'L',
        color: 'Rojo',
      },
    },
    {
      sku: 'TEST-M-AZUL',
      precio: 19990,
      stock: 3,
      atributos_variables: {
        talla: 'M',
        color: 'Azul',
      },
    },
    {
      sku: 'TEST-L-AZUL',
      precio: 19990,
      stock: 2,
      atributos_variables: {
        talla: 'L',
        color: 'Azul',
      },
    },
  ],
};

function VariantSelector() {
  const [atributosSeleccionados, setAtributosSeleccionados] = useState({});
  const [mensaje, setMensaje] = useState('');

  // Obtiene los nombres de los atributos de forma dinámica.
  // Por ejemplo: talla, color, material, peso, etc.
  const nombresAtributos = [
    ...new Set(
      productoPrueba.variantes.flatMap((variante) =>
        Object.keys(variante.atributos_variables)
      )
    ),
  ];

  const obtenerValores = (atributo) => [
    ...new Set(
      productoPrueba.variantes.map(
        (variante) => variante.atributos_variables[atributo]
      )
    ),
  ];

  const encontrarVariante = (atributos) => {
    const todosSeleccionados = nombresAtributos.every(
      (atributo) => atributos[atributo] !== undefined
    );

    if (!todosSeleccionados) {
      return null;
    }

    return (
      productoPrueba.variantes.find((variante) =>
        nombresAtributos.every(
          (atributo) =>
            variante.atributos_variables[atributo] ===
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

    if (variante.stock === 0) {
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

    if (varianteSeleccionada.stock === 0) {
      setMensaje('Esta variante se encuentra agotada.');
      return;
    }

    setMensaje(
      `Variante ${varianteSeleccionada.sku} agregada al carrito.`
    );
  };

  return (
    <div>
      <h2>{productoPrueba.nombre}</h2>

      {nombresAtributos.map((atributo) => (
        <div key={atributo}>
          <h3>
            {atributo.charAt(0).toUpperCase() + atributo.slice(1)}:
          </h3>

          {obtenerValores(atributo).map((valor) => {
            const seleccionado =
              atributosSeleccionados[atributo] === valor;

            return (
              <button
                key={valor}
                onClick={() => seleccionarAtributo(atributo, valor)}
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
            {varianteSeleccionada.precio.toLocaleString('es-CL')}
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
          varianteSeleccionada.stock === 0
        }
      >
        Agregar al carrito
      </button>

      {mensaje && <p>{mensaje}</p>}
    </div>
  );
}

export default VariantSelector;