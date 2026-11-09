import { useId, useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';
import './FormularioProducto.css';
import GaleriaImagenes from './GaleriaImagenes';
import Spinner from './carga/Spinner';

const crearVarianteVacia = () => ({
  sku: '',
  precio: '',
  precio_oferta: '',
  stock: '',
  peso_kg: 1.0,
  alto_cm: 10,
  ancho_cm: 10,
  largo_cm: 10,
  atributosVariables: []
});

// Estado inicial del formulario: vacío al crear, o los datos del producto al editar. El formulario se
// monta de nuevo para cada producto (Admin le pone key), así que basta con leerlo una vez.
const leerProductoAEditar = (productoAEditar) => {
  if (!productoAEditar) {
    return {
      producto: {
        nombre: '',
        descripcion: '',
        categoria: '',
        publicado: false,
        coleccion_privada: false,
        version_a_la_venta: '',
        texto_boton_version: 'Disponible en print',
        meta_titulo: '',
        meta_descripcion: ''
      },
      imagenes: [],
      productoGuardadoId: null,
      atributosGlobales: [],
      variantes: [crearVarianteVacia()]
    };
  }

  const atributosGlobales = productoAEditar.atributos_globales
    ? Object.entries(productoAEditar.atributos_globales).map(([clave, valor]) => ({
        clave: clave.replace(/_/g, ' '),
        valor: String(valor)
      }))
    : [];

  const variantes =
    productoAEditar.variantes && productoAEditar.variantes.length > 0
      ? productoAEditar.variantes.map((v) => ({
          sku: v.sku || '',
          precio: v.precio ?? '',
          precio_oferta: v.precio_oferta ?? '',
          stock: v.stock ?? 0,

          // Campos logísticos
          peso_kg: v.peso_kg ?? 1.0,
          alto_cm: v.alto_cm ?? 10,
          ancho_cm: v.ancho_cm ?? 10,
          largo_cm: v.largo_cm ?? 10,

          atributosVariables: v.atributos_variables
            ? Object.entries(v.atributos_variables).map(([clave, valor]) => ({
                clave: clave.replace(/_/g, ' '),
                valor: String(valor)
              }))
            : []
        }))
      : [crearVarianteVacia()];

  return {
    producto: {
      nombre: productoAEditar.nombre || '',
      descripcion: productoAEditar.descripcion || '',
      categoria: productoAEditar.categoria || '',
      publicado: productoAEditar.publicado !== undefined ? productoAEditar.publicado : false,
      coleccion_privada: Boolean(productoAEditar.coleccion_privada),
      version_a_la_venta: productoAEditar.version_a_la_venta || '',
      texto_boton_version: productoAEditar.texto_boton_version || 'Disponible en print',
      meta_titulo: productoAEditar.meta_titulo || '',
      meta_descripcion: productoAEditar.meta_descripcion || ''
    },
    // Conservamos las imágenes existentes
    imagenes: productoAEditar.imagenes || [],
    // Guardamos el ID para poder subir imágenes
    productoGuardadoId: productoAEditar.id || productoAEditar._id || null,
    atributosGlobales,
    variantes
  };
};

export default function FormularioProducto({
  alCancelar,
  alGuardar,
  productoAEditar
}) {
  const [inicial] = useState(() => leerProductoAEditar(productoAEditar));
  // Asocia cada etiqueta con su campo (WCAG 1.3.1); en las variantes se suma el índice
  const idFormulario = useId();
  const [producto, setProducto] = useState(inicial.producto);

  // Imágenes existentes/devueltas por el backend
  const [imagenes, setImagenes] = useState(inicial.imagenes);

  // Archivos gestionados por GaleriaImagenes
  const [archivosGestionados, setArchivosGestionados] = useState([]);

  // ID del producto ya guardado
  const [productoGuardadoId, setProductoGuardadoId] = useState(inicial.productoGuardadoId);

  // Atributos globales
  const [atributosGlobales, setAtributosGlobales] = useState(inicial.atributosGlobales);

  // Variantes
  const [variantes, setVariantes] = useState(inicial.variantes);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [categoriasExistentes, setCategoriasExistentes] = useState([]);
  const [productosCatalogo, setProductosCatalogo] = useState([]);
  const [modoNuevaCategoria, setModoNuevaCategoria] = useState(false);

  // ============================================================
  // CARGAR CATEGORÍAS EXISTENTES
  // ============================================================

  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const { data } = await clienteAxios.get(
          'catalogo/productos/?todos=true'
        );
        const lista = Array.isArray(data) ? data : (data?.results || []);

        if (Array.isArray(lista)) {
          setProductosCatalogo(lista);
          const categoriasUnicas = [
            ...new Set(
              lista
                .map((p) => p.categoria)
                .filter(Boolean)
            )
          ];

          setCategoriasExistentes(categoriasUnicas);

          if (
            categoriasUnicas.length === 0 &&
            !productoAEditar
          ) {
            setModoNuevaCategoria(true);
          }
        }
      } catch (err) {
        console.error(
          'Error cargando categorías:',
          err.response?.data || err.message
        );

        if (!productoAEditar) {
          setModoNuevaCategoria(true);
        }
      }
    };

    cargarCategorias();
  }, [productoAEditar]);

  // ============================================================
  // CAMBIOS DEL PRODUCTO
  // ============================================================

  const handleChangeProducto = (e) => {
    const { name, value } = e.target;

    setProducto((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // ============================================================
  // ATRIBUTOS GLOBALES
  // ============================================================

  const agregarAtributoGlobal = () => {
    setAtributosGlobales((prev) => [
      ...prev,
      {
        clave: '',
        valor: ''
      }
    ]);
  };

  const actualizarAtributoGlobal = (
    index,
    campo,
    valor
  ) => {
    setAtributosGlobales((prev) =>
      prev.map((attr, i) =>
        i === index
          ? {
              ...attr,
              [campo]: valor
            }
          : attr
      )
    );
  };

  const eliminarAtributoGlobal = (index) => {
    setAtributosGlobales((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // ============================================================
  // VARIANTES
  // ============================================================

  const agregarVariante = () => {
    setVariantes((prev) => [
      ...prev,
      crearVarianteVacia()
    ]);
  };

  const actualizarVariante = (
    index,
    campo,
    valor
  ) => {
    setVariantes((prev) =>
      prev.map((variante, i) =>
        i === index
          ? {
              ...variante,
              [campo]: valor
            }
          : variante
      )
    );
  };

  const eliminarVariante = (index) => {
    if (variantes.length === 1) {
      alert(
        'El producto debe tener al menos una variante.'
      );
      return;
    }

    setVariantes((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  // ============================================================
  // ATRIBUTOS DE VARIANTE
  // ============================================================

  const agregarAtributoVariante = (varIndex) => {
    setVariantes((prev) =>
      prev.map((variante, i) =>
        i === varIndex
          ? {
              ...variante,
              atributosVariables: [
                ...variante.atributosVariables,
                {
                  clave: '',
                  valor: ''
                }
              ]
            }
          : variante
      )
    );
  };

  const actualizarAtributoVariante = (
    varIndex,
    attrIndex,
    campo,
    valor
  ) => {
    setVariantes((prev) =>
      prev.map((variante, i) => {
        if (i !== varIndex) {
          return variante;
        }

        return {
          ...variante,
          atributosVariables:
            variante.atributosVariables.map(
              (attr, j) =>
                j === attrIndex
                  ? {
                      ...attr,
                      [campo]: valor
                    }
                  : attr
            )
        };
      })
    );
  };

  const eliminarAtributoVariante = (
    varIndex,
    attrIndex
  ) => {
    setVariantes((prev) =>
      prev.map((variante, i) => {
        if (i !== varIndex) {
          return variante;
        }

        return {
          ...variante,
          atributosVariables:
            variante.atributosVariables.filter(
              (_, j) => j !== attrIndex
            )
        };
      })
    );
  };

  // ============================================================
  // GUARDAR PRODUCTO
  // ============================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setCargando(true);
    setError('');

    try {
      // ========================================================
      // ATRIBUTOS GLOBALES
      // ========================================================

      const objAtributosGlobales =
        atributosGlobales.reduce((acc, attr) => {
          if (
            attr.clave?.trim() &&
            attr.valor?.trim()
          ) {
            const clave = attr.clave
              .toLowerCase()
              .trim()
              .replace(/\s+/g, '_');

            acc[clave] = attr.valor.trim();
          }

          return acc;
        }, {});

      // ========================================================
      // VALIDACIÓN DE SKUS ÚNICOS
      // ========================================================
      const listaSkus = variantes.map((v) => v.sku?.trim()).filter(Boolean);
      const skusDuplicados = listaSkus.filter((sku, index) => listaSkus.indexOf(sku) !== index);
      if (skusDuplicados.length > 0) {
        setError(`Cada variante debe tener un SKU único. Hay un SKU duplicado: "${skusDuplicados[0]}".`);
        setCargando(false);
        return;
      }

      // ========================================================
      // VARIANTES
      // ========================================================

      const payloadVariantes = variantes.map((v) => {
        const objAtributosVariables =
          v.atributosVariables.reduce(
            (acc, attr) => {
              if (
                attr.clave?.trim() &&
                attr.valor?.trim()
              ) {
                const clave = attr.clave
                  .toLowerCase()
                  .trim()
                  .replace(/\s+/g, '_');

                acc[clave] = attr.valor.trim();
              }

              return acc;
            },
            {}
          );

        return {
          sku: v.sku.trim(),

          precio: parseFloat(v.precio),
          precio_oferta: v.precio_oferta ? parseFloat(v.precio_oferta) : null,
          stock: parseInt(v.stock, 10),

          // Campos logísticos
          peso_kg: parseFloat(v.peso_kg),
          alto_cm: parseInt(v.alto_cm, 10),
          ancho_cm: parseInt(v.ancho_cm, 10),
          largo_cm: parseInt(v.largo_cm, 10),

          atributos_variables:
            objAtributosVariables
        };
      });

      // ========================================================
      // PAYLOAD
      // ========================================================

      const payload = {
        nombre: producto.nombre.trim(),
        descripcion: producto.descripcion.trim(),
        categoria: producto.categoria.trim(),
        meta_titulo: producto.meta_titulo.trim(),
        meta_descripcion: producto.meta_descripcion.trim(),

        activo: true,
        publicado: producto.publicado,
        coleccion_privada: Boolean(producto.coleccion_privada),
        version_a_la_venta: producto.coleccion_privada && producto.version_a_la_venta ? producto.version_a_la_venta : null,
        texto_boton_version: (producto.texto_boton_version || '').trim() || 'Disponible en print',

        atributos_globales:
          objAtributosGlobales,

        variantes: payloadVariantes
      };

      let idProducto;

      // ========================================================
      // EDITAR PRODUCTO
      // ========================================================

      if (productoAEditar) {
        idProducto =
          productoAEditar.id ||
          productoAEditar._id;

        if (!idProducto) {
          throw new Error(
            'No se encontró el ID del producto.'
          );
        }

        await clienteAxios.put(
          `catalogo/productos/${idProducto}/`,
          payload
        );

        setProductoGuardadoId(idProducto);

        alert(
          '¡Producto actualizado! Ahora puedes agregar imágenes nuevas.'
        );
      }

      // ========================================================
      // CREAR PRODUCTO
      // ========================================================

      else {
        const response =
          await clienteAxios.post(
            'catalogo/productos/',
            payload
          );

        idProducto =
          response.data?.id ||
          response.data?._id;

        if (!idProducto) {
          throw new Error(
            'El backend no devolvió el ID del producto creado.'
          );
        }

        setProductoGuardadoId(idProducto);

        alert(
          '¡Producto creado! Ahora puedes agregar imágenes.'
        );
      }

      /*
       * IMPORTANTE:
       *
       * NO llamamos alGuardar() aquí.
       *
       * Dejamos el formulario abierto para que
       * GaleriaImagenes pueda utilizar el ID del producto
       * y subir los archivos.
       */
    } catch (err) {
      console.error(
        'Error del backend:',
        err.response?.data || err.message
      );

      const data = err.response?.data;

      let mensaje =
        data?.detail ||
        data?.message ||
        'Ocurrió un error al guardar. Revisa la consola.';

      // Si Django REST Framework devuelve errores por campo
      if (
        typeof data === 'object' &&
        !data?.detail &&
        !data?.message
      ) {
        try {
          mensaje = Object.entries(data)
            .map(([campo, errores]) => {
              const texto = Array.isArray(errores)
                ? errores.join(', ')
                : String(errores);

              return `${campo}: ${texto}`;
            })
            .join(' | ');
        } catch {
          // Dejamos el mensaje genérico
        }
      }

      setError(mensaje);
    } finally {
      setCargando(false);
    }
  };

  // ============================================================
  // FINALIZAR
  // ============================================================

  const finalizarFormulario = () => {
    alGuardar();
  };

  // ============================================================
  // ESTILOS
  // ============================================================

  const inputStyle = {
    width: '100%',
    padding: '10px',
    border: '1px solid var(--color-control-border)',
    borderRadius: '4px',
    marginTop: '5px',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    boxSizing: 'border-box'
  };

  const cardStyle = {
    backgroundColor: 'var(--color-surface)',
    padding: '15px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    marginBottom: '15px'
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <form className="formulario-producto"
      onSubmit={handleSubmit}
      style={{
        maxWidth: '900px',
        backgroundColor: 'var(--color-secondary)',
        padding: 'clamp(12px, 3vw, 25px)',
        borderRadius: '8px'
      }}
    >
      {/* ======================================================
          ENCABEZADO
      ======================================================= */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <h3
          style={{
            color: 'var(--color-primary)',
            margin: 0,
            fontSize: '1.5rem'
          }}
        >
          {productoAEditar
            ? 'Editar Producto'
            : 'Crear Nuevo Producto'}
        </h3>

        <button
          type="button"
          aria-label="Cerrar formulario de producto"
          onClick={alCancelar}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontSize: '1.2rem'
          }}
        >
          ✕
        </button>
      </div>

      {/* ======================================================
          ERROR
      ======================================================= */}

      {error && (
        <p
          role="alert"
          style={{
            color: '#b91c1c',
            backgroundColor: '#fee2e2',
            padding: '10px',
            borderRadius: '4px'
          }}
        >
          {error}
        </p>
      )}

      {/* ======================================================
          DATOS GENERALES
      ======================================================= */}

      <h4
        style={{
          borderBottom:
            '2px solid var(--color-primary)',
          paddingBottom: '5px',
          color: 'var(--color-text)'
        }}
      >
        Datos Generales
      </h4>

      <div className="producto-campos"
        style={{
          display: 'grid',
          gap: '20px',
          marginBottom: '20px'
        }}
      >
        {/* NOMBRE */}

        <div>
          <label htmlFor={`${idFormulario}-nombre`}
            style={{
              fontWeight: 'bold'
            }}
          >
            Nombre del Producto
          </label>

          <input
            type="text"
            id={`${idFormulario}-nombre`}
            maxLength={255}
            name="nombre"
            value={producto.nombre}
            onChange={handleChangeProducto}
            style={inputStyle}
            required
          />
        </div>

        {/* CATEGORÍA */}

        <div>
          <label htmlFor={`${idFormulario}-categoria`}
            style={{
              fontWeight: 'bold'
            }}
          >
            Categoría
          </label>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginTop: '5px'
            }}
          >
            {!modoNuevaCategoria &&
            categoriasExistentes.length > 0 ? (
              <>
                <select
                  id={`${idFormulario}-categoria`}
                  name="categoria"
                  value={producto.categoria}
                  onChange={handleChangeProducto}
                  style={{
                    ...inputStyle,
                    marginTop: 0,
                    flex: 1
                  }}
                  required
                >
                  <option value="">
                    Seleccione...
                  </option>

                  {categoriasExistentes.map(
                    (cat) => (
                      <option
                        key={cat}
                        value={cat}
                      >
                        {cat}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setModoNuevaCategoria(true);

                    setProducto((prev) => ({
                      ...prev,
                      categoria: ''
                    }));
                  }}
                  style={{
                    padding: '0 15px',
                    backgroundColor:
                      'var(--color-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  + Nueva
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  id={`${idFormulario}-categoria`}
                  maxLength={100}
                  name="categoria"
                  value={producto.categoria}
                  onChange={handleChangeProducto}
                  style={{
                    ...inputStyle,
                    marginTop: 0,
                    flex: 1
                  }}
                  placeholder="Ej: Zapatillas"
                  required
                />

                {categoriasExistentes.length >
                  0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setModoNuevaCategoria(false);

                      setProducto((prev) => ({
                        ...prev,
                        categoria: ''
                      }));
                    }}
                    style={{
                      padding: '0 15px',
                      backgroundColor: 'var(--color-muted)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* DESCRIPCIÓN */}

        <div
          style={{
            gridColumn: '1 / -1'
          }}
        >
          <label htmlFor={`${idFormulario}-descripcion`}
            style={{
              fontWeight: 'bold'
            }}
          >
            Descripción
          </label>

          <textarea
            id={`${idFormulario}-descripcion`}
            name="descripcion"
            value={producto.descripcion}
            onChange={handleChangeProducto}
            style={{
              ...inputStyle,
              minHeight: '80px'
            }}
          />
        </div>

        {/* ====================================================
           METADATOS SEO
        ===================================================== */}

        <div style={{ gridColumn: '1 / -1' }}>
          <h4
            style={{
              borderBottom: '2px solid var(--color-border)',
              paddingBottom: '5px',
              color: 'var(--color-text)'
            }}
          >
            Configuración SEO
          </h4>

          <p style={{ color: 'var(--color-muted)', fontSize: '0.9em' }}>
            Estos datos ayudan a los buscadores a comprender y mostrar
            tu producto en los resultados de búsqueda.
          </p>

          <div style={{ marginBottom: '15px' }}>
            <label htmlFor={`${idFormulario}-meta_titulo`} style={{ fontWeight: 'bold' }}>
              Título SEO
            </label>

            <input
              type="text"
              id={`${idFormulario}-meta_titulo`}
              name="meta_titulo"
              value={producto.meta_titulo}
              onChange={handleChangeProducto}
              maxLength={60}
              placeholder="Ej: Zapatillas deportivas para mujer"
              style={inputStyle}
            />

            <small style={{ color: 'var(--color-muted)' }}>
              {producto.meta_titulo.length}/60 caracteres
            </small>
          </div>

          <div>
            <label htmlFor={`${idFormulario}-meta_descripcion`} style={{ fontWeight: 'bold' }}>
              Descripción SEO
            </label>

            <textarea
              id={`${idFormulario}-meta_descripcion`}
              name="meta_descripcion"
              value={producto.meta_descripcion}
              onChange={handleChangeProducto}
              maxLength={160}
              placeholder="Describe brevemente el producto para los resultados de búsqueda."
              style={{
                ...inputStyle,
                minHeight: '80px'
              }}
            />

            <small style={{ color: 'var(--color-muted)' }}>
              {producto.meta_descripcion.length}/160 caracteres
            </small>
          </div>
        </div>

        {/* ====================================================
            GALERÍA
        ===================================================== */}

        <GaleriaImagenes
          productoId={productoGuardadoId}
          imagenes={imagenes}
          archivosGestionados={
            archivosGestionados
          }
          onImagenesChange={setImagenes}
          onArchivosChange={
            setArchivosGestionados
          }
        />
      </div>

      {/* ======================================================
          ATRIBUTOS GLOBALES
      ======================================================= */}

      <div
        style={{
          ...cardStyle,
          borderStyle: 'dashed',
          borderColor: 'var(--color-primary)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '15px'
          }}
        >
          <h4 style={{ margin: 0 }}>
            Atributos Globales
          </h4>

          <button
            type="button"
            aria-label="Agregar atributo global"
            onClick={agregarAtributoGlobal}
            style={{
              padding: '5px 10px',
              backgroundColor:
                'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            + Agregar
          </button>
        </div>

        {atributosGlobales.map(
          (attr, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '10px'
              }}
            >
              <input
                type="text"
                // Sin etiqueta visible: el nombre accesible indica qué atributo es
                aria-label={`Nombre del atributo ${index + 1}`}
                placeholder="Clave (Ej: Marca)"
                value={attr.clave}
                onChange={(e) =>
                  actualizarAtributoGlobal(
                    index,
                    'clave',
                    e.target.value
                  )
                }
                style={inputStyle}
              />

              <input
                type="text"
                aria-label={`Valor del atributo ${index + 1}`}
                placeholder="Valor (Ej: Nike)"
                value={attr.valor}
                onChange={(e) =>
                  actualizarAtributoGlobal(
                    index,
                    'valor',
                    e.target.value
                  )
                }
                style={inputStyle}
              />

              <button
                type="button"
                aria-label={`Borrar atributo ${index + 1}`}
                onClick={() =>
                  eliminarAtributoGlobal(index)
                }
                style={{
                  marginTop: '5px',
                  padding: '10px',
                  backgroundColor: '#b91c1c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Borrar
              </button>
            </div>
          )
        )}
      </div>

      {/* ======================================================
          VARIANTES
      ======================================================= */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom:
            '2px solid var(--color-border)',
          paddingBottom: '5px',
          marginTop: '30px',
          marginBottom: '15px'
        }}
      >
        <h4
          style={{
            margin: 0,
            color: 'var(--color-text)'
          }}
        >
          Variantes del Producto
        </h4>

        <button
          type="button"
          onClick={agregarVariante}
          style={{
            padding: '6px 12px',
            backgroundColor:
              'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          + Nueva Variante
        </button>
      </div>

      {variantes.map(
        (variante, varIndex) => (
          <div
            key={varIndex}
            style={cardStyle}
          >
            {/* CABECERA VARIANTE */}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '10px'
              }}
            >
              <strong
                style={{
                  color:
                    'var(--color-primary)'
                }}
              >
                Variante #{varIndex + 1}
              </strong>

              <button
                type="button"
                aria-label={`Eliminar Variante ${varIndex + 1}`}
                onClick={() =>
                  eliminarVariante(
                    varIndex
                  )
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Eliminar Variante
              </button>
            </div>

            {/* SKU / PRECIO / STOCK */}

            <div className="producto-campos"
              style={{
                display: 'grid',
                gap: '15px',
                marginBottom: '15px'
              }}
            >
              {/* SKU */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-sku`}
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 'bold'
                  }}
                >
                  SKU
                </label>

                <input
                  type="text"
                  id={`${idFormulario}-variante-${varIndex}-sku`}
                  maxLength={64}
                  value={variante.sku}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'sku',
                      e.target.value
                    )
                  }
                  style={inputStyle}
                  required
                />
              </div>

              {/* PRECIO */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-precio`}
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 'bold'
                  }}
                >
                  Precio
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-precio`}
                  min={1} step={1}
                  value={variante.precio}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'precio',
                      e.target.value
                    )
                  }
                  style={inputStyle}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              {/* PRECIO OFERTA */}
              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-precio_oferta`}
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 'bold',
                    color: '#e60000'
                  }}
                >
                  Precio Oferta
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-precio_oferta`}
                  min={1} step={1}
                  value={variante.precio_oferta || ''}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'precio_oferta',
                      e.target.value
                    )
                  }
                  style={inputStyle}
                  min="0"
                  step="0.01"
                />
              </div>

              {/* STOCK */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-stock`}
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 'bold'
                  }}
                >
                  Stock
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-stock`}
                  min={0} step={1}
                  value={variante.stock}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'stock',
                      e.target.value
                    )
                  }
                  style={inputStyle}
                  min="0"
                  required
                />
              </div>
            </div>

            {/* ==================================================
                DIMENSIONES LOGÍSTICAS
            =================================================== */}

            <div className="producto-campos"
              style={{
                display: 'grid',
                gap: '15px',
                marginBottom: '15px',
                padding: '10px',
                backgroundColor: '#e0f2fe',
                borderRadius: '4px',
                border: '1px solid #bae6fd'
              }}
            >
              <div
                style={{
                  gridColumn: '1 / -1'
                }}
              >
                <span
                  style={{
                    fontSize: '0.85em',
                    fontWeight: 'bold',
                    color: 'var(--color-primary)'
                  }}
                >
                  Dimensiones Logísticas
                </span>
              </div>

              {/* PESO */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-peso_kg`}
                  style={{
                    fontSize: '0.8em',
                    fontWeight: 'bold',
                    color: '#0c4a6e'
                  }}
                >
                  Peso (Kg)
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-peso_kg`}
                  min={0.01} step={0.01}
                  value={variante.peso_kg}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'peso_kg',
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop: '2px',
                    padding: '6px'
                  }}
                  min="0.1"
                  step="0.1"
                  required
                />
              </div>

              {/* ALTO */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-alto_cm`}
                  style={{
                    fontSize: '0.8em',
                    fontWeight: 'bold',
                    color: '#0c4a6e'
                  }}
                >
                  Alto (cm)
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-alto_cm`}
                  min={1} step={1}
                  value={variante.alto_cm}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'alto_cm',
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop: '2px',
                    padding: '6px'
                  }}
                  min="1"
                  step="1"
                  required
                />
              </div>

              {/* ANCHO */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-ancho_cm`}
                  style={{
                    fontSize: '0.8em',
                    fontWeight: 'bold',
                    color: '#0c4a6e'
                  }}
                >
                  Ancho (cm)
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-ancho_cm`}
                  min={1} step={1}
                  value={variante.ancho_cm}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'ancho_cm',
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop: '2px',
                    padding: '6px'
                  }}
                  min="1"
                  step="1"
                  required
                />
              </div>

              {/* LARGO */}

              <div>
                <label htmlFor={`${idFormulario}-variante-${varIndex}-largo_cm`}
                  style={{
                    fontSize: '0.8em',
                    fontWeight: 'bold',
                    color: '#0c4a6e'
                  }}
                >
                  Largo (cm)
                </label>

                <input
                  type="number"
                  id={`${idFormulario}-variante-${varIndex}-largo_cm`}
                  min={1} step={1}
                  value={variante.largo_cm}
                  onChange={(e) =>
                    actualizarVariante(
                      varIndex,
                      'largo_cm',
                      e.target.value
                    )
                  }
                  style={{
                    ...inputStyle,
                    marginTop: '2px',
                    padding: '6px'
                  }}
                  min="1"
                  step="1"
                  required
                />
              </div>
            </div>

            {/* ==================================================
                ATRIBUTOS DE VARIANTE
            =================================================== */}

            <div
              style={{
                backgroundColor: 'var(--color-secondary)',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  marginBottom: '10px'
                }}
              >
                <span
                  style={{
                    fontSize: '0.9em',
                    fontWeight: 'bold'
                  }}
                >
                  Atributos específicos
                  (Ej: Talla: M)
                </span>

                <button
                  type="button"
                  onClick={() =>
                    agregarAtributoVariante(
                      varIndex
                    )
                  }
                  style={{
                    fontSize: '0.8em',
                    padding: '4px 8px',
                    backgroundColor:
                      'var(--color-muted)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  + Añadir Atributo
                </button>
              </div>

              {variante.atributosVariables.map(
                (attr, attrIndex) => (
                  <div
                    key={attrIndex}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      marginBottom: '5px'
                    }}
                  >
                    <input
                      type="text"
                      aria-label={`Variante ${varIndex + 1}: nombre del atributo ${attrIndex + 1}`}
                      placeholder="Ej: Talla"
                      value={attr.clave}
                      onChange={(e) =>
                        actualizarAtributoVariante(
                          varIndex,
                          attrIndex,
                          'clave',
                          e.target.value
                        )
                      }
                      style={{
                        ...inputStyle,
                        marginTop: 0,
                        padding: '6px'
                      }}
                    />

                    <input
                      type="text"
                      aria-label={`Variante ${varIndex + 1}: valor del atributo ${attrIndex + 1}`}
                      placeholder="Ej: M"
                      value={attr.valor}
                      onChange={(e) =>
                        actualizarAtributoVariante(
                          varIndex,
                          attrIndex,
                          'valor',
                          e.target.value
                        )
                      }
                      style={{
                        ...inputStyle,
                        marginTop: 0,
                        padding: '6px'
                      }}
                    />

                    <button
                      type="button"
                      aria-label={`Eliminar atributo ${attrIndex + 1} de la variante ${varIndex + 1}`}
                      onClick={() =>
                        eliminarAtributoVariante(
                          varIndex,
                          attrIndex
                        )
                      }
                      style={{
                        backgroundColor:
                          'transparent',
                        color: '#b91c1c',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )
      )}

      {/* ======================================================
          ESTADO PUBLICACIÓN
      ======================================================= */}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '15px',
          backgroundColor:
            producto.publicado
              ? '#ecfdf5'
              : 'var(--color-secondary)',
          borderRadius: '8px',
          border: `1px solid ${
            producto.publicado
              ? '#10b981'
              : 'var(--color-border)'
          }`,
          marginTop: '20px'
        }}
      >
        <div>
          <strong
            style={{
              color: producto.publicado
                ? '#065f46'
                : 'var(--color-text)',
              display: 'block',
              fontSize: '1.1em'
            }}
          >
            {producto.publicado
              ? 'Ojo: Este producto será visible en la tienda.'
              : 'Producto en modo Borrador.'}
          </strong>

          <span
            style={{
              fontSize: '0.85em',
              color: 'var(--color-muted)'
            }}
          >
            {producto.publicado
              ? 'Los clientes podrán verlo y comprarlo inmediatamente.'
              : 'Solo tú puedes verlo. Actívalo cuando esté listo para la venta.'}
          </span>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            gap: '10px'
          }}
        >
          <span
            style={{
              fontWeight: 'bold',
              // Contraste AA: el verde #10b981 y el gris #9ca3af no llegaban a 4,5:1
              color: producto.publicado
                ? '#166534'
                : 'var(--color-muted)'
            }}
          >
            {producto.publicado
              ? 'PUBLICADO'
              : 'OCULTO'}
          </span>

          <input
            type="checkbox"
            checked={producto.publicado}
            onChange={(e) =>
              setProducto((prev) => ({
                ...prev,
                publicado:
                  e.target.checked
              }))
            }
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer'
            }}
          />
        </label>
      </div>

      {/* ======================================================
          COLECCIÓN PRIVADA (SCRUM-197)
      ======================================================= */}
      <div
        className="bloque-coleccion-privada"
        style={{
          padding: '15px',
          backgroundColor: producto.coleccion_privada
            ? '#f8fafc'
            : 'var(--color-secondary)',
          borderRadius: '8px',
          border: `1px solid ${
            producto.coleccion_privada
              ? '#64748b'
              : 'var(--color-border)'
          }`,
          marginTop: '20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ flex: 1 }}>
            <label
              htmlFor={`${idFormulario}-coleccion-privada`}
              style={{
                display: 'block',
                cursor: 'pointer'
              }}
            >
              <strong
                id={`${idFormulario}-coleccion-privada-titulo`}
                style={{
                  display: 'block',
                  fontSize: '1.1em',
                  color: 'var(--color-text)'
                }}
              >
                No está a la venta (colección privada)
              </strong>
              <span
                style={{
                  fontSize: '0.85em',
                  color: 'var(--color-muted)'
                }}
              >
                Esta obra no se puede comprar ni agregar al carrito. Se exhibe como pieza única o de colección.
              </span>
            </label>
          </div>

          <label
            htmlFor={`${idFormulario}-coleccion-privada`}
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              gap: '10px'
            }}
          >
            <span
              style={{
                fontWeight: 'bold',
                color: producto.coleccion_privada
                  ? '#0f172a'
                  : 'var(--color-muted)'
              }}
            >
              {producto.coleccion_privada ? 'COLECCIÓN PRIVADA' : 'A LA VENTA'}
            </span>
            <input
              id={`${idFormulario}-coleccion-privada`}
              name="coleccion_privada"
              type="checkbox"
              aria-labelledby={`${idFormulario}-coleccion-privada-titulo`}
              checked={Boolean(producto.coleccion_privada)}
              onChange={(e) =>
                setProducto((prev) => ({
                  ...prev,
                  coleccion_privada: e.target.checked
                }))
              }
              style={{
                width: '20px',
                height: '20px',
                cursor: 'pointer'
              }}
            />
          </label>
        </div>

        {producto.coleccion_privada && (
          <div
            style={{
              marginTop: '15px',
              paddingTop: '15px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div>
              <label
                htmlFor={`${idFormulario}-version-venta`}
                style={{
                  display: 'block',
                  fontWeight: '600',
                  marginBottom: '5px'
                }}
              >
                Versión a la venta (opcional)
              </label>
              <select
                id={`${idFormulario}-version-venta`}
                name="version_a_la_venta"
                value={producto.version_a_la_venta || ''}
                onChange={(e) =>
                  setProducto((prev) => ({
                    ...prev,
                    version_a_la_venta: e.target.value
                  }))
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-input-bg, #fff)'
                }}
              >
                <option value="">-- Ninguna --</option>
                {productosCatalogo
                  .filter((p) => (p.id || p._id) !== productoGuardadoId && !p.coleccion_privada)
                  .map((p) => (
                    <option key={p.id || p._id} value={p.id || p._id}>
                      {p.nombre} {p.publicado ? '' : '(Borrador)'}
                    </option>
                  ))}
              </select>
              <span
                style={{
                  fontSize: '0.8em',
                  color: 'var(--color-muted)',
                  marginTop: '4px',
                  display: 'block'
                }}
              >
                Enlaza a otra obra disponible para comprar (por ejemplo una lámina o print).
              </span>
            </div>

            {producto.version_a_la_venta && (
              <div>
                <label
                  htmlFor={`${idFormulario}-texto-boton-version`}
                  style={{
                    display: 'block',
                    fontWeight: '600',
                    marginBottom: '5px'
                  }}
                >
                  Texto del botón
                </label>
                <input
                  id={`${idFormulario}-texto-boton-version`}
                  name="texto_boton_version"
                  type="text"
                  value={producto.texto_boton_version ?? 'Disponible en print'}
                  onChange={(e) =>
                    setProducto((prev) => ({
                      ...prev,
                      texto_boton_version: e.target.value
                    }))
                  }
                  placeholder="Disponible en print"
                  maxLength={100}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)'
                  }}
                />
                <span
                  style={{
                    fontSize: '0.8em',
                    color: 'var(--color-muted)',
                    marginTop: '4px',
                    display: 'block'
                  }}
                >
                  Texto que verán los clientes en la ficha y en la tarjeta (por defecto: &quot;Disponible en print&quot;).
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================
          BOTONES
      ======================================================= */}

      {!productoGuardadoId ? (
        <button
          type="submit"
          disabled={cargando}
          style={{
            width: '100%',
            padding: '15px',
            backgroundColor:
              'var(--color-primary)',
            color: 'var(--color-on-primary)',
            fontSize: '1.1em',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '4px',
            cursor: cargando
              ? 'not-allowed'
              : 'pointer',
            marginTop: '20px'
          }}
        >
          {cargando && <Spinner />}
          {cargando
            ? 'Guardando producto...'
            : 'Crear Producto'}
        </button>
      ) : (
        <>
          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor:
                'var(--color-primary)',
              color: 'var(--color-on-primary)',
              fontSize: '1.1em',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '4px',
              cursor: cargando
                ? 'not-allowed'
                : 'pointer',
              marginTop: '20px'
            }}
          >
            {cargando && <Spinner />}
            {cargando
              ? 'Guardando cambios...'
              : 'Guardar cambios del producto'}
          </button>

          <button
            type="button"
            onClick={finalizarFormulario}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor:
                'var(--color-primary)',
              color: 'var(--color-on-primary)',
              fontSize: '1.1em',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            ✓ Finalizar
          </button>
        </>
      )}
    </form>
  );
}
