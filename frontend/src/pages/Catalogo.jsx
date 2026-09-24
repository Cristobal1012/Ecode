import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import VariantSelector from '../components/VariantSelector';

export default function Catalogo() {
  // 2. Estados de la aplicación
  const [productos, setProductos] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [filtrosActivos, setFiltrosActivos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  
  useEffect(() => {
    
    axios.get('http://localhost:8000/catalogo/productos/') 
      .then(response => {
        console.log("Datos recibidos de la API:", response.data);
        setProductos(response.data); 
      })
      .catch(error => {
        console.error("Hubo un error cargando el catálogo:", error);
      });
  }, []);

  const handleCategoriaChange = (e) => {
    setCategoriaSeleccionada(e.target.value);
    setFiltrosActivos({}); 
  };
  
  // 3. Extraer categorías únicas (Para el filtro principal)
  const categoriasUnicas = useMemo(() => {
    return [...new Set(productos.map(p => p.categoria))];
  }, [productos]);

  // 4. Filtrar productos según la categoría seleccionada
  const productosFiltrados = useMemo(() => {
    let filtrados = productos;

    // 1er Filtro: Por categoría
    if (categoriaSeleccionada) {
      filtrados = filtrados.filter(p => p.categoria === categoriaSeleccionada);
    }

    // 2do Filtro: Por atributos técnicos dinámicos
    Object.entries(filtrosActivos).forEach(([atributo, valorSeleccionado]) => {
      if (valorSeleccionado) {
        filtrados = filtrados.filter(p => 
          p.atributos_globales && 
          p.atributos_globales[atributo] && 
          p.atributos_globales[atributo].toString() === valorSeleccionado
        );
      }
    });

    

    return filtrados;
  }, [productos, categoriaSeleccionada, filtrosActivos]);

  // 5. Mágia del NoSQL: Extraer las llaves de los atributos técnicos dinámicamente
  const atributosDinamicos = useMemo(() => {
    if (!categoriaSeleccionada) return [];
    
    const claves = new Set();
    productosFiltrados.forEach(p => {
      if (p.atributos_globales) {
        // Lee propiedades como "socket", "vram", "formato"
        Object.keys(p.atributos_globales).forEach(key => claves.add(key)); 
      }
    });
    return [...claves];
  }, [productosFiltrados, categoriaSeleccionada]);

  const obtenerOpcionesPorAtributo = (atributo) => {
    const valores = productos
      .filter(p => p.categoria === categoriaSeleccionada && p.atributos_globales?.[atributo])
      .map(p => p.atributos_globales[atributo]);
    return [...new Set(valores)]; 
  };

  return (
    <div style={{ display: 'flex', gap: '30px', padding: '20px', fontFamily: 'sans-serif' }}>
      
      {/* --- BARRA LATERAL DE FILTROS --- */}
      <aside style={{ width: '250px', borderRight: '1px solid #ddd', paddingRight: '20px' }}>
        <h3>Filtros</h3>
        
        {/* Filtro Fijo: Categoría */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Categoría</label>
          <select 
            value={categoriaSeleccionada} 
            onChange={handleCategoriaChange}
            style={{ width: '100%', padding: '8px' }}
          >
            <option value="">Mostrar todo</option>
            {categoriasUnicas.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Filtros Dinámicos (Aparecen según la categoría) */}
        {categoriaSeleccionada && atributosDinamicos.length > 0 && (
          <div>
            <h4 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
              Atributos de {categoriaSeleccionada}
            </h4>
            
            {atributosDinamicos.map(attr => (
              <div key={attr} style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', textTransform: 'capitalize', fontSize: '14px', marginBottom: '5px' }}>
                  {attr.replace('_', ' ')}
                </label>
                <select 
                    value={filtrosActivos[attr] || ""}
                    onChange={(e) => setFiltrosActivos(prev => ({ ...prev, [attr]: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '13px' }}                  
                >
                    <option value="">Cualquier {attr.replace('_', ' ')}</option>
                    {obtenerOpcionesPorAtributo(attr).map(valor => (
                        <option key={valor} value={valor}>{valor}</option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* --- LISTA DE PRODUCTOS --- */}
      <main style={{ flex: 1 }}>
        <h2>Catálogo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          
          {productosFiltrados.map(prod => (
            <div key={prod.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', boxShadow: '2px 2px 8px rgba(0,0,0,0.1)' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>{prod.nombre}</h4>
              <button
                onClick={() => setProductoSeleccionado(prod)}
                style={{ marginTop: '10px', padding: '8px 12px', cursor: 'pointer'}}>
                Seleccionar variante
              </button>

              {prod.atributos_globales &&
                Object.keys(prod.atributos_globales)
                  .length > 0 && (
                  <div
                    style={{
                      marginTop: '15px',
                      padding: '10px',
                      backgroundColor: '#f9f9f9',
                      borderRadius: '5px',
                    }}
                  >
                    <strong
                      style={{ fontSize: '12px' }}
                    >
                      Ficha Técnica:
                    </strong>

                    <ul
                      style={{
                        margin: '5px 0 0 0',
                        paddingLeft: '20px',
                        fontSize: '13px',
                      }}
                    >
                      {Object.entries(
                        prod.atributos_globales
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
            </div>
          ))}
        </div>

        {productoSeleccionado && (
          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              border: '1px solid #ddd',
              borderRadius: '8px',
            }}
          >
            <button
              onClick={() =>
                setProductoSeleccionado(null)
              }
              style={{
                marginBottom: '15px',
                padding: '6px 10px',
                cursor: 'pointer',
              }}
            >
              Cerrar selector
            </button>

            <VariantSelector
              producto={productoSeleccionado}
            />
          </div>
        )}
      </main>
    </div>
  );
}