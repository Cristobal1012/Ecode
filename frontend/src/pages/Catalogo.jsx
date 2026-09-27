import { useEffect, useMemo, useState } from 'react';
import clienteAxios from '../components/auth/axiosConfig';
import { PALETTES } from '../constants/palettes';
import VariantSelector from '../components/VariantSelector';
import Header from '../components/header/header';
import ProductCardGrid from '../components/ProductCardGrid';
import ProductCardList from '../components/ProductCardList';
import './Catalogo.css';

const TEMA_PREDETERMINADO = 1;

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
  const [temaConfigurado, setTemaConfigurado] = useState(() => {
    const savedPaletteId = Number(localStorage.getItem('ecommerce_palette'));
    return savedPaletteId || TEMA_PREDETERMINADO;
  });

  const [productos, setProductos] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const [filtrosActivos, setFiltrosActivos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [layoutCatalogo, setLayoutCatalogo] = useState('GRID_3');

  // APLICAR COLORES: Paleta del Administrador
  useEffect(() => {
    const activePalette = PALETTES.find((p) => p.id === temaConfigurado) || PALETTES[0];
    const root = document.documentElement.style;

    if (activePalette) {
      root.setProperty('--color-primary', activePalette.colors.primary);
      root.setProperty('--color-secondary', activePalette.colors.secondary);
      root.setProperty('--color-accent', activePalette.colors.accent);
      root.setProperty('--color-background', activePalette.colors.background);
      root.setProperty('--color-text', activePalette.colors.text);

      root.setProperty('--catalogo-primary', activePalette.colors.primary);
      root.setProperty('--catalogo-background', activePalette.colors.background);
      root.setProperty('--catalogo-text', activePalette.colors.text);
      
      root.setProperty('--catalogo-on-primary', '#ffffff');
      root.setProperty('--catalogo-surface', '#ffffff');
      root.setProperty('--catalogo-muted-text', '#6b7280');
      root.setProperty('--catalogo-border', '#e5e7eb');
    }
  }, [temaConfigurado]);

  // FETCH DE DATOS
  useEffect(() => {
    const controller = new AbortController();

    // Traer configuración de la BD
    clienteAxios
      .get('configuracion/', { signal: controller.signal })
      .then(({ data }) => {
        const configDb = Array.isArray(data) ? data[0] : data;
        
        if (configDb?.layout_catalogo) {
          setLayoutCatalogo(configDb.layout_catalogo);
        }
        
        if (configDb?.tema_seleccionado !== undefined && configDb?.tema_seleccionado !== null) {
          const idBackend = Number(configDb.tema_seleccionado);
          
          if (!isNaN(idBackend)) {
            setTemaConfigurado(idBackend); 
            localStorage.setItem('ecommerce_palette', idBackend.toString()); 
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Error cargando la DB:', error);
        }
      });

    // Traer productos y filtrar SOLO los que están publicados y activos para la tienda
    clienteAxios
      .get('catalogo/productos/', { signal: controller.signal })
      .then(({ data }) => {
        const listaProductos = Array.isArray(data) ? data : [];
        
        // MODIFICACIÓN: Filtramos para que en la tienda pública solo aparezcan 
        // los productos activos Y que tengan publicado: true
        const productosPublicados = listaProductos.filter(
          (producto) => producto && typeof producto === 'object' && producto.activo !== false && producto.publicado === true
        );

        setProductos(productosPublicados);
      })
      .catch((error) => {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('No se pudo cargar el catálogo:', error);
        }
      });

    return () => controller.abort();
  }, []);

  // LÓGICA DE FILTROS
  const categoriasUnicas = useMemo(() => {
    return [...new Set(productos.map((producto) => producto.categoria).filter(Boolean))];
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      if (categoriaSeleccionada && producto.categoria !== categoriaSeleccionada) return false;

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
      return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' };
    }
    if (layoutCatalogo === 'LISTA') {
      return { display: 'flex', flexDirection: 'column', gap: '15px' };
    }
    return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' };
  };

  return (
    <div className="catalogo-page">
      <Header />
      <div className="catalogo">
        <aside className="catalogo__filtros">
          <h3>Filtros</h3>
          <div className="catalogo__campo">
            <label htmlFor="categoria">Categoría</label>
            <select id="categoria" value={categoriaSeleccionada} onChange={cambiarCategoria}>
              <option value="">Mostrar todo</option>
              {categoriasUnicas.map((categoria) => (
                <option key={categoria} value={categoria}>{categoria}</option>
              ))}
            </select>
          </div>

          {categoriaSeleccionada && atributosDinamicos.length > 0 && (
            <div>
              <h4 className="catalogo__subtitulo">Atributos de {categoriaSeleccionada}</h4>
              {atributosDinamicos.map((atributo) => (
                <div className="catalogo__campo" key={atributo}>
                  <label htmlFor={`atributo-${atributo}`}>{atributo.replaceAll('_', ' ')}</label>
                  <select
                    id={`atributo-${atributo}`}
                    value={filtrosActivos[atributo] ?? ''}
                    onChange={(event) =>
                      setFiltrosActivos((previos) => ({ ...previos, [atributo]: event.target.value }))
                    }
                  >
                    <option value="">Cualquier {atributo.replaceAll('_', ' ')}</option>
                    {obtenerOpcionesPorAtributo(atributo).map((valor) => (
                      <option key={valor} value={valor}>{valor}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="catalogo__contenido" style={{ flex: 1 }}>
          <h2>Catálogo</h2>
          {productosFiltrados.length === 0 ? (
            <p className="catalogo__vacio">No hay productos para mostrar.</p>
          ) : (
            <div style={obtenerEstiloCatalogo()}>
              {productosFiltrados.map((prod) =>
                layoutCatalogo === 'LISTA' ? (
                  <ProductCardList key={prod.id ?? prod._id} producto={prod} onSeleccionarVariante={setProductoSeleccionado} />
                ) : (
                  <ProductCardGrid key={prod.id ?? prod._id} producto={prod} onSeleccionarVariante={setProductoSeleccionado} />
                )
              )}
            </div>
          )}

          {productoSeleccionado && (
            <div style={{ marginTop: '30px', padding: '20px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '8px', backgroundColor: '#ffffff' }}>
              <button
                type="button"
                onClick={() => setProductoSeleccionado(null)}
                style={{ marginBottom: '15px', padding: '6px 12px', cursor: 'pointer', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px' }}
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