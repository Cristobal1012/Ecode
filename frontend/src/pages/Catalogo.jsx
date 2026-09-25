import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import { obtenerIdTema, PALETAS, TEMA_PREDETERMINADO } from '../theme/paletas';
import { PALETTES } from '../constants/palettes';
import VariantSelector from '../components/VariantSelector';
import Header from '../components/header/header';
import ProductCardGrid from '../components/ProductCardGrid';
import ProductCardList from '../components/ProductCardList';
import './Catalogo.css';

const VARIABLES_TEMA = {
  primary: '--catalogo-primary',
  onPrimary: '--catalogo-on-primary',
  background: '--catalogo-background',
  surface: '--catalogo-surface',
  text: '--catalogo-text',
  mutedText: '--catalogo-muted-text',
  border: '--catalogo-border',
};

function obtenerAtributos(producto) {
  const atributos = producto?.atributos_globales;
  return atributos && typeof atributos === 'object' && !Array.isArray(atributos)
    ? atributos
    : {};
}

function mostrarValor(valor) {
  return valor !== null && typeof valor === 'object'
    ? JSON.stringify(valor)
    : String(valor);
}

export default function Catalogo() {
  const [searchParams] = useSearchParams();

  const temaTemporal = import.meta.env.DEV
    ? obtenerIdTema(searchParams.get('tema'))
    : null;

  const [temaConfigurado, setTemaConfigurado] = useState(TEMA_PREDETERMINADO);
  const [productos, setProductos] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const [filtrosActivos, setFiltrosActivos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [layoutCatalogo, setLayoutCatalogo] = useState('GRID_3');

  const tema = PALETAS[temaTemporal ?? temaConfigurado];

  // 1. Aplicar paleta global desde localStorage
  useEffect(() => {
    const savedPaletteId = Number(localStorage.getItem('ecommerce_palette')) || 1;
    const activePalette = PALETTES.find((p) => p.id === savedPaletteId) || PALETTES[0];

    if (activePalette) {
      const root = document.documentElement;
      root.style.setProperty('--color-primary', activePalette.colors.primary);
      root.style.setProperty('--color-secondary', activePalette.colors.secondary);
      root.style.setProperty('--color-accent', activePalette.colors.accent);
      root.style.setProperty('--color-background', activePalette.colors.background);
      root.style.setProperty('--color-text', activePalette.colors.text);
    }
  }, []);

  // 2. Cargar configuración (tema y layout) y productos del backend
  useEffect(() => {
    const controller = new AbortController();

    clienteAxios
      .get('/api/configuracion/', { signal: controller.signal })
      .then(({ data }) => {
        if (data?.layout_catalogo) {
          setLayoutCatalogo(data.layout_catalogo);
        }
        setTemaConfigurado(
          obtenerIdTema(data?.tema_seleccionado) ?? TEMA_PREDETERMINADO
        );
      })
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('No se pudo cargar la configuración de la tienda:', error);
        }
      });

    clienteAxios
      .get('/catalogo/productos/', { signal: controller.signal })
      .then(({ data }) => {
        setProductos(
          Array.isArray(data)
            ? data.filter(
                (producto) => producto && typeof producto === 'object'
              )
            : []
        );
      })
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('No se pudo cargar el catálogo:', error);
        }
      });

    return () => controller.abort();
  }, []);

  // 3. Aplicar variables CSS de paleta del catálogo
  useEffect(() => {
    if (!tema) return;
    const raiz = document.documentElement.style;

    Object.entries(VARIABLES_TEMA).forEach(([token, variable]) => {
      raiz.setProperty(variable, tema[token]);
    });

    return () => {
      Object.values(VARIABLES_TEMA).forEach((variable) => {
        raiz.removeProperty(variable);
      });
    };
  }, [tema]);

  // 4. Filtros y productos computados
  const categoriasUnicas = useMemo(() => {
    return [
      ...new Set(
        productos.map((producto) => producto.categoria).filter(Boolean)
      ),
    ];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      if (categoriaSeleccionada && producto.categoria !== categoriaSeleccionada) {
        return false;
      }

      return Object.entries(filtrosActivos).every(([atributo, valor]) => {
        if (!valor) return true;
        const valorAtributo = obtenerAtributos(producto)[atributo];
        return mostrarValor(valorAtributo) === valor;
      });
    });
  }, [productos, categoriaSeleccionada, filtrosActivos]);

  const atributosDinamicos = useMemo(() => {
    if (!categoriaSeleccionada) return [];

    const claves = new Set();
    productosFiltrados.forEach((producto) => {
      Object.keys(obtenerAtributos(producto)).forEach((clave) => claves.add(clave));
    });

    return [...claves];
  }, [productosFiltrados, categoriaSeleccionada]);

  const obtenerOpcionesPorAtributo = (atributo) => [
    ...new Set(
      productos
        .filter((producto) => producto.categoria === categoriaSeleccionada)
        .map((producto) => obtenerAtributos(producto)[atributo])
        .filter((valor) => valor !== null && valor !== undefined && valor !== '')
        .map(mostrarValor)
    ),
  ];

  const cambiarCategoria = (event) => {
    setCategoriaSeleccionada(event.target.value);
    setFiltrosActivos({});
    setProductoSeleccionado(null);
  };

  const obtenerEstiloCatalogo = () => {
    if (layoutCatalogo === 'GRID_4') {
      return {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '20px',
      };
    }

    if (layoutCatalogo === 'LISTA') {
      return {
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
      };
    }

    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '20px',
    };
  };

  return (
    <div className="catalogo-page">
      <Header />

      <div className="catalogo">
        <aside className="catalogo__filtros">
          <h3>Filtros</h3>

          <div className="catalogo__campo">
            <label htmlFor="categoria">Categoría</label>
            <select
              id="categoria"
              value={categoriaSeleccionada}
              onChange={cambiarCategoria}
            >
              <option value="">Mostrar todo</option>
              {categoriasUnicas.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </div>

          {categoriaSeleccionada && atributosDinamicos.length > 0 && (
            <div>
              <h4 className="catalogo__subtitulo">
                Atributos de {categoriaSeleccionada}
              </h4>

              {atributosDinamicos.map((atributo) => (
                <div className="catalogo__campo" key={atributo}>
                  <label htmlFor={`atributo-${atributo}`}>
                    {atributo.replaceAll('_', ' ')}
                  </label>

                  <select
                    id={`atributo-${atributo}`}
                    value={filtrosActivos[atributo] ?? ''}
                    onChange={(event) =>
                      setFiltrosActivos((previos) => ({
                        ...previos,
                        [atributo]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      Cualquier {atributo.replaceAll('_', ' ')}
                    </option>

                    {obtenerOpcionesPorAtributo(atributo).map((valor) => (
                      <option key={valor} value={valor}>
                        {valor}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="catalogo__contenido" style={{ flex: 1 }}>
          {import.meta.env.DEV && (
            <nav className="catalogo__preview" aria-label="Vista previa de paletas">
              <span>Vista previa:</span>
              {Object.entries(PALETAS).map(([id, paleta]) => (
                <Link
                  key={id}
                  to={`?tema=${id}`}
                  className={
                    Number(id) === (temaTemporal ?? temaConfigurado)
                      ? 'catalogo__preview-activa'
                      : ''
                  }
                  aria-current={
                    Number(id) === (temaTemporal ?? temaConfigurado)
                      ? 'page'
                      : undefined
                  }
                >
                  {id}. {paleta.nombre}
                </Link>
              ))}
            </nav>
          )}

          <h2>Catálogo</h2>

          {productosFiltrados.length === 0 ? (
            <p className="catalogo__vacio">No hay productos para mostrar.</p>
          ) : (
            <div style={obtenerEstiloCatalogo()}>
              {productosFiltrados.map((prod) =>
                layoutCatalogo === 'LISTA' ? (
                  <ProductCardList
                    key={prod.id ?? prod._id}
                    producto={prod}
                    onSeleccionarVariante={setProductoSeleccionado}
                  />
                ) : (
                  <ProductCardGrid
                    key={prod.id ?? prod._id}
                    producto={prod}
                    onSeleccionarVariante={setProductoSeleccionado}
                  />
                )
              )}
            </div>
          )}

          {productoSeleccionado && (
            <div
              style={{
                marginTop: '30px',
                padding: '20px',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
              }}
            >
              <button
                type="button"
                onClick={() => setProductoSeleccionado(null)}
                style={{
                  marginBottom: '15px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: '#e5e7eb',
                  border: 'none',
                  borderRadius: '4px',
                }}
              >
                Cerrar selector
              </button>

              <VariantSelector producto={productoSeleccionado} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}