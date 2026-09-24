import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import VariantSelector from '../components/VariantSelector';
import { PALETTES } from '../constants/palettes';

export default function Catalogo() {
  // 1. Asegurar que las variables CSS de la paleta estén aplicadas al entrar
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
    <div
      style={{
        display: 'flex',
        gap: '30px',
        padding: '20px',
        fontFamily: 'sans-serif',
        minHeight: '100vh',
        backgroundColor: 'var(--color-background, #F8F9FA)',
        color: 'var(--color-text, #1B4332)',
        transition: 'background-color 0.3s ease, color 0.3s ease'
      }}
    >
      {/* --- BARRA LATERAL DE FILTROS --- */}
      <aside
        style={{
          width: '250px',
          borderRight: '1px solid rgba(0, 0, 0, 0.1)',
          paddingRight: '20px'
        }}
      >
        <h3 style={{ color: 'var(--color-primary, #2E7D32)' }}>Filtros</h3>
        
        {/* Filtro Fijo: Categoría */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Categoría</label>
          <select 
            value={categoriaSeleccionada} 
            onChange={handleCategoriaChange}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              backgroundColor: '#fff'
            }}
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
            <h4 style={{ borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '5px' }}>
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
                  style={{
                    width: '100%',
                    padding: '6px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    border: '1px solid #ccc',
                    backgroundColor: '#fff'
                  }}                  
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
        <h2 style={{ color: 'var(--color-primary, #2E7D32)', marginTop: 0 }}>Catálogo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          
          {productosFiltrados.map(prod => (
            <div
              key={prod.id}
              style={{
                border: '1px solid rgba(0,0,0,0.1)',
                padding: '15px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>{prod.nombre}</h4>
              <button
                onClick={() => setProductoSeleccionado(prod)}
                style={{
                  marginTop: '10px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-primary, #2E7D32)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '500'
                }}
              >
                Seleccionar variante
              </button>

              {prod.atributos_globales &&
                Object.keys(prod.atributos_globales).length > 0 && (
                  <div
                    style={{
                      marginTop: '15px',
                      padding: '10px',
                      backgroundColor: 'rgba(0,0,0,0.03)',
                      borderRadius: '5px',
                    }}
                  >
                    <strong style={{ fontSize: '12px' }}>
                      Ficha Técnica:
                    </strong>

                    <ul
                      style={{
                        margin: '5px 0 0 0',
                        paddingLeft: '20px',
                        fontSize: '13px',
                      }}
                    >
                      {Object.entries(prod.atributos_globales).map(([key, val]) => (
                        <li key={key}>
                          <b>{key.replace('_', ' ')}:</b> {val}
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
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: '8px',
              backgroundColor: '#ffffff'
            }}
          >
            <button
              onClick={() => setProductoSeleccionado(null)}
              style={{
                marginBottom: '15px',
                padding: '6px 12px',
                cursor: 'pointer',
                backgroundColor: '#e5e7eb',
                border: 'none',
                borderRadius: '4px'
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