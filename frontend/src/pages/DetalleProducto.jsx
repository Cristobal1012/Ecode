import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import Header from '../components/header/header';
import VariantSelector from '../components/VariantSelector';

export default function DetalleProducto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Índice de la imagen actualmente seleccionada
  const [imagenActual, setImagenActual] = useState(0);

  useEffect(() => {
    clienteAxios.get(`catalogo/productos/${id}/`)
      .then(({ data }) => {
        setProducto(data);
        setImagenActual(0);
        setCargando(false);
      })
      .catch((err) => {
        console.error('Error al cargar el detalle del producto:', err);
        setError('No se pudo encontrar el producto.');
        setCargando(false);
      });
  }, [id]);

  //Función unificada para agregar al carrito
  const handleAgregarAlCarrito = async (
    varianteSeleccionada,
    cantidadSeleccionada = 1
  ) => {
    if (!varianteSeleccionada) {
      alert("Por favor, selecciona una variante válida.");
      return;
    }

    const carritoGuardado = localStorage.getItem('carrito_local');
    const carritoActual = carritoGuardado
      ? JSON.parse(carritoGuardado)
      : [];

    const indiceProducto = carritoActual.findIndex(
      item => item.sku === varianteSeleccionada.sku
    );

    if (indiceProducto !== -1) {
      carritoActual[indiceProducto].cantidad += cantidadSeleccionada;
    } else {
      carritoActual.push({
        id: producto.id,
        sku: varianteSeleccionada.sku,
        nombre: `${producto.nombre} - ${
          varianteSeleccionada.valor || varianteSeleccionada.sku
        }`,
        precio: varianteSeleccionada.precio,
        cantidad: cantidadSeleccionada
      });
    }

    localStorage.setItem(
      'carrito_local',
      JSON.stringify(carritoActual)
    );

    window.dispatchEvent(new Event('carritoActualizado'));

    const token = localStorage.getItem('access_token');

    if (token) {
      try {
        await clienteAxios.post(
          'ventas/carrito/',
          { items: carritoActual }
        );
      } catch (error) {
        console.error(
          'No se pudo sincronizar el carrito con la base de datos:',
          error
        );
      }
    }
  };

  // Cambiar a la imagen anterior
  const imagenAnterior = () => {
    if (!producto?.imagenes?.length) return;

    setImagenActual((actual) =>
      actual === 0
        ? producto.imagenes.length - 1
        : actual - 1
    );
  };

  // Cambiar a la imagen siguiente
  const imagenSiguiente = () => {
    if (!producto?.imagenes?.length) return;

    setImagenActual((actual) =>
      actual === producto.imagenes.length - 1
        ? 0
        : actual + 1
    );
  };

  // Seleccionar una imagen directamente desde las miniaturas
  const seleccionarImagen = (index) => {
    setImagenActual(index);
  };

  if (cargando) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Cargando producto...
      </div>
    );
  }

  if (error || !producto) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: '#ef4444'
        }}
      >
        {error || 'Producto no disponible'}
      </div>
    );
  }

  const imagenes = producto.imagenes || [];

  return (
    <div
      style={{
        backgroundColor: 'var(--color-background)',
        minHeight: '100vh',
        paddingBottom: '50px'
      }}
    >
      <Header />

      <div
        style={{
          maxWidth: '1000px',
          margin: '30px auto',
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
      >
        <button
          onClick={() => navigate('/catalogo')}
          style={{
            marginBottom: '20px',
            padding: '8px 14px',
            backgroundColor: '#e5e7eb',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ← Volver al Catálogo
        </button>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '30px'
          }}
        >
          {/* ========================= */}
          {/* COLUMNA DE IMÁGENES */}
          {/* ========================= */}

          <div>
            {imagenes.length > 0 ? (
              <div>
                {/* Imagen principal */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%'
                  }}
                >
                  <img
                    src={imagenes[imagenActual]}
                    alt={`${producto.nombre} - Imagen ${
                      imagenActual + 1
                    }`}
                    style={{
                      width: '100%',
                      height: '400px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}
                  />

                  {/* Botón anterior */}
                  {imagenes.length > 1 && (
                    <button
                      type="button"
                      onClick={imagenAnterior}
                      aria-label="Imagen anterior"
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'rgba(0, 0, 0, 0.55)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ‹
                    </button>
                  )}

                  {/* Botón siguiente */}
                  {imagenes.length > 1 && (
                    <button
                      type="button"
                      onClick={imagenSiguiente}
                      aria-label="Imagen siguiente"
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: 'none',
                        backgroundColor: 'rgba(0, 0, 0, 0.55)',
                        color: '#fff',
                        fontSize: '24px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ›
                    </button>
                  )}

                  {/* Contador */}
                  {imagenes.length > 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '0.85rem'
                      }}
                    >
                      {imagenActual + 1} / {imagenes.length}
                    </div>
                  )}
                </div>

                {/* Miniaturas */}
                {imagenes.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      marginTop: '12px',
                      overflowX: 'auto',
                      paddingBottom: '5px'
                    }}
                  >
                    {imagenes.map((imagen, index) => (
                      <button
                        key={imagen || index}
                        type="button"
                        onClick={() => seleccionarImagen(index)}
                        aria-label={`Ver imagen ${index + 1}`}
                        style={{
                          padding: '2px',
                          border:
                            index === imagenActual
                              ? '3px solid var(--color-primary)'
                              : '1px solid #d1d5db',
                          borderRadius: '6px',
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        <img
                          src={imagen}
                          alt={`Miniatura ${index + 1}`}
                          style={{
                            width: '70px',
                            height: '70px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            display: 'block'
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '400px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9ca3af'
                }}
              >
                Sin imagen disponible
              </div>
            )}
          </div>

          {/* ========================= */}
          {/* INFORMACIÓN DEL PRODUCTO */}
          {/* ========================= */}

          <div>
            <span
              style={{
                backgroundColor: '#e5e7eb',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 'bold'
              }}
            >
              {producto.categoria}
            </span>

            <h1
              style={{
                margin: '15px 0 10px 0',
                color: 'var(--color-primary)',
                fontSize: '2rem',
                lineHeight: '1.2'
              }}
            >
              {producto.nombre}
            </h1>

            <p
              style={{
                color: '#4b5563',
                lineHeight: '1.6',
                marginBottom: '20px'
              }}
            >
              {producto.descripcion ||
                'Sin descripción disponible.'}
            </p>

            {/* Ficha Técnica */}
            {producto.atributos_globales &&
              Object.keys(producto.atributos_globales).length > 0 && (
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <strong>Ficha Técnica:</strong>

                  <ul
                    style={{
                      margin: '5px 0 0 0',
                      paddingLeft: '20px',
                      fontSize: '0.9rem'
                    }}
                  >
                    {Object.entries(
                      producto.atributos_globales
                    ).map(([key, val]) => (
                      <li key={key}>
                        <b>
                          {key.replace('_', ' ')}:
                        </b>{' '}
                        {val}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {/* Selector de variantes */}
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                paddingTop: '20px'
              }}
            >
              <VariantSelector
                producto={producto}
                onAgregarAlCarrito={handleAgregarAlCarrito}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}