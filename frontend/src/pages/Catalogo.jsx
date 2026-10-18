import { useEffect, useMemo, useState } from 'react';
import clienteAxios from '../components/auth/axiosConfig';
import { aplicarPaleta } from '../constants/palettes';
import Header from '../components/header/header';
import ProductCardGrid from '../components/ProductCardGrid';
import ProductCardList from '../components/ProductCardList';
import { precioMinimoVigente } from '../utils/precios';
import '../components/TarjetaProducto.css';
import './Catalogo.css';

const TEMA_PREDETERMINADO = 1;

// Órdenes del catálogo; "Destacados" respeta el orden en que llegan del servidor
const ORDENES = {
  destacados: { etiqueta: 'Destacados', comparar: null },
  recientes: {
    etiqueta: 'Más nuevos',
    comparar: (a, b) => new Date(b.fecha_creacion || 0) - new Date(a.fecha_creacion || 0)
  },
  'precio-asc': {
    etiqueta: 'Precio: menor a mayor',
    comparar: (a, b) => precioMinimoVigente(a.variantes) - precioMinimoVigente(b.variantes)
  },
  'precio-desc': {
    etiqueta: 'Precio: mayor a menor',
    comparar: (a, b) => precioMinimoVigente(b.variantes) - precioMinimoVigente(a.variantes)
  },
  nombre: { etiqueta: 'Nombre (A-Z)', comparar: (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es') }
};

// RF-01.4: grilla de 3, grilla de 4 o lista con la descripción al costado
const CLASES_LAYOUT = { GRID_3: 'catalogo-grilla catalogo-grilla--3', GRID_4: 'catalogo-grilla', LISTA: 'catalogo-lista' };

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
  const [orden, setOrden] = useState('destacados');
  const [layoutCatalogo, setLayoutCatalogo] = useState('GRID_3');

  // APLICAR COLORES: Paleta del Administrador
  useEffect(() => {
    aplicarPaleta(temaConfigurado);
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
  };

  const productosOrdenados = useMemo(() => {
    const { comparar } = ORDENES[orden];
    return comparar ? [...productosFiltrados].sort(comparar) : productosFiltrados;
  }, [productosFiltrados, orden]);

  const esLista = layoutCatalogo === 'LISTA';

  return (
    <div className="catalogo-page">
      <Header />
      <main className="catalogo" id="contenido">
        <section className="catalogo-encabezado" aria-labelledby="catalogo-titulo">
          <div className="contenedor">
            <span className="antetitulo">Tienda</span>
            <h1 id="catalogo-titulo">Catálogo</h1>
          </div>
        </section>

        {/* RF-01.3: los filtros de atributos salen de los productos de la categoría elegida */}
        <div className="catalogo-filtros">
          <div className="contenedor catalogo-filtros-contenido">
            <div className="catalogo__campo">
              <label htmlFor="categoria">Categoría</label>
              <select id="categoria" value={categoriaSeleccionada} onChange={cambiarCategoria}>
                <option value="">Todas</option>
                {categoriasUnicas.map((categoria) => (
                  <option key={categoria} value={categoria}>{categoria}</option>
                ))}
              </select>
            </div>

            {categoriaSeleccionada && atributosDinamicos.map((atributo) => (
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

            <div className="catalogo__campo catalogo__campo--orden">
              <label htmlFor="orden">Ordenar por</label>
              <select id="orden" value={orden} onChange={(event) => setOrden(event.target.value)}>
                {Object.entries(ORDENES).map(([valor, { etiqueta }]) => (
                  <option key={valor} value={valor}>{etiqueta}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="contenedor catalogo__contenido">
          <p className="catalogo-cantidad texto-secundario" role="status">
            {productosOrdenados.length === 1 ? '1 producto' : `${productosOrdenados.length} productos`}
          </p>

          {productosOrdenados.length === 0 ? (
            <p className="catalogo__vacio">No hay productos para mostrar.</p>
          ) : (
            <ul className={`${CLASES_LAYOUT[layoutCatalogo] || CLASES_LAYOUT.GRID_3} lista-sin-estilo`}>
              {productosOrdenados.map((prod) => (
                <li key={prod.id ?? prod._id}>
                  {esLista ? <ProductCardList producto={prod} /> : <ProductCardGrid producto={prod} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
