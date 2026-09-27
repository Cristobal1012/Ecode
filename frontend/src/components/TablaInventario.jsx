import React, { useState, useEffect, useMemo } from 'react';
import clienteAxios from './auth/axiosConfig';

const obtenerStockTotal = (variantes) => {
  if (!variantes || variantes.length === 0) return 0;
  return variantes.reduce((total, v) => total + (v.stock || 0), 0);
};

const obtenerPrecioMinimo = (variantes) => {
  if (!variantes || variantes.length === 0) return 0;
  return Math.min(...variantes.map(v => parseFloat(v.precio) || 0));
};

const obtenerRangoPrecios = (variantes) => {
  if (!variantes || variantes.length === 0) return '$0.00';
  const precios = variantes.map(v => parseFloat(v.precio) || 0);
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)} - $${max.toFixed(2)}`;
};

const formatearAtributos = (atributos) => {
  if (!atributos || Object.keys(atributos).length === 0) return 'Base';
  return Object.entries(atributos)
    .map(([clave, valor]) => `${clave.replace('_', ' ')}: ${valor}`)
    .join(' | ');
};

export default function TablaInventario({ onEditarProducto }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filasExpandidas, setFilasExpandidas] = useState({});

  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [ordenFiltro, setOrdenFiltro] = useState('');

  const cargarProductos = async () => {
    try {
      setCargando(true);
      const { data } = await clienteAxios.get('catalogo/productos/');
      setProductos(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error('Error al cargar inventario:', err);
      setError('No se pudo cargar la lista de productos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const eliminarProducto = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este producto por completo (incluyendo todas sus variantes)?')) return;
    try {
      await clienteAxios.delete(`catalogo/productos/${id}/`);
      setProductos(productos.filter((p) => (p.id || p._id) !== id));
    } catch (err) {
      console.error('Error al eliminar:', err);
      alert('Hubo un error al eliminar el producto.');
    }
  };

  const toggleFila = (id) => {
    setFilasExpandidas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const categoriasUnicas = useMemo(() => {
    return [...new Set(productos.map(p => p.categoria).filter(Boolean))];
  }, [productos]);

  const productosFiltradosYOrdenados = useMemo(() => {
    let resultado = [...productos];

    if (categoriaFiltro) {
      resultado = resultado.filter(p => p.categoria === categoriaFiltro);
    }

    if (ordenFiltro === 'PRECIO_ASC') {
      resultado.sort((a, b) => obtenerPrecioMinimo(a.variantes) - obtenerPrecioMinimo(b.variantes));
    } else if (ordenFiltro === 'PRECIO_DESC') {
      resultado.sort((a, b) => obtenerPrecioMinimo(b.variantes) - obtenerPrecioMinimo(a.variantes));
    } else if (ordenFiltro === 'STOCK_ASC') {
      resultado.sort((a, b) => obtenerStockTotal(a.variantes) - obtenerStockTotal(b.variantes));
    } else if (ordenFiltro === 'STOCK_DESC') {
      resultado.sort((a, b) => obtenerStockTotal(b.variantes) - obtenerStockTotal(a.variantes));
    }

    return resultado;
  }, [productos, categoriaFiltro, ordenFiltro]);

  if (cargando) return <p style={{ color: 'var(--color-text)' }}>Cargando inventario...</p>;
  if (error) return <p style={{ color: '#ef4444' }}>{error}</p>;

  const selectStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #d1d5db',
    backgroundColor: '#ffffff',
    color: '#374151',
    minWidth: '200px',
    outline: 'none'
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px', backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.9em', fontWeight: 'bold', color: 'var(--color-text)' }}>Filtrar por Categoría</label>
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} style={selectStyle}>
            <option value="">Todas las categorías</option>
            {categoriasUnicas.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.9em', fontWeight: 'bold', color: 'var(--color-text)' }}>Ordenar por</label>
          <select value={ordenFiltro} onChange={(e) => setOrdenFiltro(e.target.value)} style={selectStyle}>
            <option value="">Sin orden (Agregados recientemente)</option>
            <option value="PRECIO_ASC">Precio: Menor a Mayor</option>
            <option value="PRECIO_DESC">Precio: Mayor a Menor</option>
            <option value="STOCK_ASC">Stock Total: Menor a Mayor</option>
            <option value="STOCK_DESC">Stock Total: Mayor a Menor</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.9em', color: '#6b7280' }}>
            Mostrando {productosFiltradosYOrdenados.length} de {productos.length} producto(s)
          </span>
        </div>
      </div>

      {productosFiltradosYOrdenados.length === 0 ? (
        <p style={{ color: 'var(--color-text)', textAlign: 'center', padding: '40px 0' }}>No hay productos que coincidan con estos filtros.</p>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--color-background)', borderBottom: '2px solid var(--color-primary)' }}>
              <tr>
                <th style={{ width: '50px', padding: '15px' }}></th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>Imagen</th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>Producto</th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>Categoría</th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>Precio Base</th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>Stock Total</th>
                <th style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltradosYOrdenados.map((producto) => {
                const id = producto.id || producto._id;
                const estaExpandida = filasExpandidas[id];
                const stockTotal = obtenerStockTotal(producto.variantes);
                
                return (
                  <React.Fragment key={id}>
                    {/* FILA PADRE (PRODUCTO GENERAL) */}
                    <tr 
                      style={{ 
                        borderBottom: estaExpandida ? 'none' : '1px solid #e5e7eb', 
                        backgroundColor: estaExpandida ? '#f8fafc' : '#ffffff',
                        transition: 'background-color 0.2s',
                        cursor: 'pointer' 
                      }}
                      onClick={() => toggleFila(id)}
                    >
                      <td style={{ padding: '15px', textAlign: 'center', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                        {estaExpandida ? '▼' : '▶'}
                      </td>
                      <td style={{ padding: '15px' }}>
                        {producto.imagenes && producto.imagenes.length > 0 ? (
                          <img src={producto.imagenes[0]} alt={producto.nombre} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ccc' }} />
                        ) : (
                          <div style={{ width: '50px', height: '50px', backgroundColor: '#f3f4f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#9ca3af' }}>Sin img</div>
                        )}
                      </td>
                      <td style={{ padding: '15px', color: 'var(--color-text)', fontWeight: 'bold' }}>
                        {producto.nombre}
                        <div style={{ fontSize: '0.8em', color: '#6b7280', fontWeight: 'normal', marginTop: '4px' }}>
                          {producto.variantes?.length || 0} variante(s)
                        </div>
                      </td>
                      <td style={{ padding: '15px', color: 'var(--color-text)' }}>
                        <span style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85em' }}>{producto.categoria}</span>
                      </td>
                      <td style={{ padding: '15px', color: 'var(--color-text)', fontWeight: '500' }}>
                        {obtenerRangoPrecios(producto.variantes)}
                      </td>
                      <td style={{ padding: '15px' }}>
                        <span style={{ color: stockTotal > 10 ? 'green' : (stockTotal > 0 ? 'orange' : 'red'), fontWeight: 'bold', fontSize: '1.1em' }}>
                          {stockTotal}
                        </span>
                      </td>
                      <td style={{ padding: '15px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', marginRight: '10px', fontWeight: 'bold' }} onClick={() => onEditarProducto(producto)}>Editar</button>
                        <button style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => eliminarProducto(id)}>Borrar</button>
                      </td>
                    </tr>

                    {/* FILAS HIJAS (VARIANTES) */}
                    {estaExpandida && producto.variantes && producto.variantes.map((variante, index) => (
                      <tr key={index} style={{ backgroundColor: '#f8fafc', borderBottom: index === producto.variantes.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                        <td></td>
                        <td colSpan="2" style={{ padding: '10px 15px', borderLeft: '3px solid var(--color-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#9ca3af' }}>↳</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 'bold' }}>{variante.sku}</span>
                            <span style={{ fontSize: '0.9em', color: 'var(--color-text)', textTransform: 'capitalize' }}>
                              ({formatearAtributos(variante.atributos_variables)})
                            </span>
                          </div>
                        </td>
                        <td></td>
                        <td style={{ padding: '10px 15px', color: 'var(--color-text)' }}>
                          ${parseFloat(variante.precio).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 15px' }}>
                          <span style={{ color: variante.stock > 10 ? 'green' : (variante.stock > 0 ? 'orange' : 'red') }}>
                            {variante.stock} en stock
                          </span>
                        </td>
                        {/* CELDA DE ACCIONES VACÍA PARA NO ROMPER LA TABLA */}
                        <td style={{ padding: '10px 15px', textAlign: 'center' }}>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}