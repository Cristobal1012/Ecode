import React, { useState, useMemo } from 'react';

//JSON falso temporal 
const mockProducts = [
  {
    _id: "65f1a2b3c4d5e6f7a8b9c001",
    nombre: "Procesador AMD Ryzen 5 7600X",
    categoria: "Procesadores",
    precio: 245000,
    stock: 15,
    atributos_tecnicos: { socket: "AM5", nucleos: 6 }
  },
  {
    _id: "65f1a2b3c4d5e6f7a8b9c002",
    nombre: "Tarjeta de Video AMD Radeon RX 7800 XT",
    categoria: "Tarjetas Gráficas",
    precio: 560000,
    stock: 8,
    atributos_tecnicos: { vram: "16GB", largo_mm: 320 }
  },

  {
    _id: "65f1a2b3c4d5e6f7a8b9c004",
    nombre: "Tarjeta de Video NVIDIA RTX 4070",
    categoria: "Tarjetas Gráficas",
    precio: 650000,
    stock: 5,
    atributos_tecnicos: { vram: "12GB", largo_mm: 280 }
  },


  {
    _id: "65f1a2b3c4d5e6f7a8b9c003",
    nombre: "Placa Madre Pro Z690",
    categoria: "Placas Madre",
    precio: 185000,
    stock: 22,
    atributos_tecnicos: { socket: "LGA 1700", formato: "ATX" }
  }
];

export default function Catalogo() {
  // 2. Estados de la aplicación
  const [productos] = useState(mockProducts);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [filtrosActivos, setFiltrosActivos] = useState({});

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
          p.atributos_tecnicos && 
          p.atributos_tecnicos[atributo] && 
          p.atributos_tecnicos[atributo].toString() === valorSeleccionado
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
      if (p.atributos_tecnicos) {
        // Lee propiedades como "socket", "vram", "formato"
        Object.keys(p.atributos_tecnicos).forEach(key => claves.add(key)); 
      }
    });
    return [...claves];
  }, [productosFiltrados, categoriaSeleccionada]);

  const obtenerOpcionesPorAtributo = (atributo) => {
    const valores = productos
      .filter(p => p.categoria === categoriaSeleccionada && p.atributos_tecnicos?.[atributo])
      .map(p => p.atributos_tecnicos[atributo]);
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
            <div key={prod._id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', boxShadow: '2px 2px 8px rgba(0,0,0,0.1)' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>{prod.nombre}</h4>
              <p style={{ margin: '5px 0' }}><strong>Precio:</strong> ${prod.precio.toLocaleString('es-CL')}</p>
              
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                <strong style={{ fontSize: '12px' }}>Ficha Técnica:</strong>
                <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                  {Object.entries(prod.atributos_tecnicos).map(([key, val]) => (
                    <li key={key}><b>{key.replace('_', ' ')}:</b> {val}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
          
        </div>
      </main>
      
    </div>
  );
}