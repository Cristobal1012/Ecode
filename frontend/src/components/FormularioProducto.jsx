import React, { useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';

export default function FormularioProducto({ alCancelar, alGuardar, productoAEditar }) {
  const [producto, setProducto] = useState({
    nombre: '', descripcion: '', categoria: '', imagen: '' , publicado: false
  });
  const [atributosGlobales, setAtributosGlobales] = useState([]);
  const [variantes, setVariantes] = useState([
    { sku: '', precio: '', stock: '', atributosVariables: [] }
  ]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  
  const [categoriasExistentes, setCategoriasExistentes] = useState([]);
  const [modoNuevaCategoria, setModoNuevaCategoria] = useState(false);

  // NUEVO: Efecto para PRE-CARGAR los datos si estamos editando
  useEffect(() => {
    if (productoAEditar) {
      setProducto({
        nombre: productoAEditar.nombre || '',
        descripcion: productoAEditar.descripcion || '',
        categoria: productoAEditar.categoria || '',
        imagen: productoAEditar.imagenes && productoAEditar.imagenes.length > 0 ? productoAEditar.imagenes[0] : '',
        publicado: productoAEditar.publicado !== undefined ? productoAEditar.publicado : false
      });

      // Desarmar diccionario de atributos globales a array
      if (productoAEditar.atributos_globales) {
        const arrGlobales = Object.entries(productoAEditar.atributos_globales).map(([k, v]) => ({
          clave: k.replace(/_/g, ' '), // Quitar guiones bajos
          valor: String(v)
        }));
        setAtributosGlobales(arrGlobales);
      }

      // Desarmar arreglo de variantes y sus diccionarios internos
      if (productoAEditar.variantes && productoAEditar.variantes.length > 0) {
        const arrVariantes = productoAEditar.variantes.map(v => {
          const arrAttrVar = v.atributos_variables ? Object.entries(v.atributos_variables).map(([k, val]) => ({
            clave: k.replace(/_/g, ' '),
            valor: String(val)
          })) : [];

          return {
            sku: v.sku || '',
            precio: v.precio || '',
            stock: v.stock || 0,
            atributosVariables: arrAttrVar
          };
        });
        setVariantes(arrVariantes);
      }
    }
  }, [productoAEditar]);

  // Efecto para cargar categorías
  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const { data } = await clienteAxios.get('catalogo/productos/');
        if (Array.isArray(data)) {
          const categoriasUnicas = [...new Set(data.map(p => p.categoria).filter(Boolean))];
          setCategoriasExistentes(categoriasUnicas);
          if (categoriasUnicas.length === 0 && !productoAEditar) setModoNuevaCategoria(true);
        }
      } catch (err) {
        if(!productoAEditar) setModoNuevaCategoria(true);
      }
    };
    cargarCategorias();
  }, [productoAEditar]);

  const handleChangeProducto = (e) => setProducto({ ...producto, [e.target.name]: e.target.value });

  // Lógica Atributos Globales
  const agregarAtributoGlobal = () => setAtributosGlobales([...atributosGlobales, { clave: '', valor: '' }]);
  const actualizarAtributoGlobal = (index, campo, valor) => {
    const nuevos = [...atributosGlobales]; nuevos[index][campo] = valor; setAtributosGlobales(nuevos);
  };
  const eliminarAtributoGlobal = (index) => setAtributosGlobales(atributosGlobales.filter((_, i) => i !== index));

  // Lógica Variantes
  const agregarVariante = () => setVariantes([...variantes, { sku: '', precio: '', stock: '', atributosVariables: [] }]);
  const actualizarVariante = (index, campo, valor) => {
    const nuevas = [...variantes]; nuevas[index][campo] = valor; setVariantes(nuevas);
  };
  const eliminarVariante = (index) => {
    if (variantes.length === 1) return alert("El producto debe tener al menos una variante.");
    setVariantes(variantes.filter((_, i) => i !== index));
  };
  const agregarAtributoVariante = (varIndex) => {
    const nuevas = [...variantes]; nuevas[varIndex].atributosVariables.push({ clave: '', valor: '' }); setVariantes(nuevas);
  };
  const actualizarAtributoVariante = (varIndex, attrIndex, campo, valor) => {
    const nuevas = [...variantes]; nuevas[varIndex].atributosVariables[attrIndex][campo] = valor; setVariantes(nuevas);
  };
  const eliminarAtributoVariante = (varIndex, attrIndex) => {
    const nuevas = [...variantes]; nuevas[varIndex].atributosVariables.splice(attrIndex, 1); setVariantes(nuevas);
  };

  // Envío del Formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError('');

    const objAtributosGlobales = atributosGlobales.reduce((acc, attr) => {
      if (attr.clave && attr.valor) acc[attr.clave.toLowerCase().trim().replace(/ /g, '_')] = attr.valor.trim();
      return acc;
    }, {});

    const payloadVariantes = variantes.map(v => {
      const objAtributosVariables = v.atributosVariables.reduce((acc, attr) => {
        if (attr.clave && attr.valor) acc[attr.clave.toLowerCase().trim().replace(/ /g, '_')] = attr.valor.trim();
        return acc;
      }, {});
      return { sku: v.sku, precio: parseFloat(v.precio), stock: parseInt(v.stock, 10), atributos_variables: objAtributosVariables };
    });

    const payload = {
      nombre: producto.nombre, 
      descripcion: producto.descripcion, 
      categoria: producto.categoria.trim(),
      imagenes: producto.imagen ? [producto.imagen] : [], 
      activo: true,
      publicado: producto.publicado,
      atributos_globales: objAtributosGlobales, 
      variantes: payloadVariantes 
    };

    try {
      // NUEVO: Decidimos si hacemos POST o PUT basándonos en si hay productoAEditar
      if (productoAEditar) {
        const id = productoAEditar.id || productoAEditar._id;
        await clienteAxios.put(`catalogo/productos/${id}/`, payload);
        alert('¡Producto actualizado con éxito!');
      } else {
        await clienteAxios.post('catalogo/productos/', payload);
        alert('¡Producto creado con éxito!');
      }
      alGuardar();
    } catch (err) {
      console.error('Error del backend:', err.response?.data || err.message);
      setError('Ocurrió un error al guardar. Revisa la consola.');
    } finally {
      setCargando(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', marginTop: '5px', backgroundColor: '#fff', color: '#000' };
  const cardStyle = { backgroundColor: '#ffffff', padding: '15px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '15px' };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '900px', backgroundColor: '#f9fafb', padding: '25px', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ color: 'var(--color-primary)', margin: 0, fontSize: '1.5rem' }}>
          {productoAEditar ? 'Editar Producto' : 'Crear Nuevo Producto'} {/* Cambio de Título */}
        </h3>
        <button type="button" onClick={alCancelar} style={{ background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
      </div>

      {error && <p style={{ color: '#ef4444', backgroundColor: '#fee2e2', padding: '10px', borderRadius: '4px' }}>{error}</p>}

      {/* SECCIÓN 1: DATOS GENERALES */}
      <h4 style={{ borderBottom: '2px solid var(--color-primary)', paddingBottom: '5px', color: 'var(--color-text)' }}>Datos Generales</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div>
          <label style={{ fontWeight: 'bold' }}>Nombre del Producto</label>
          <input type="text" name="nombre" value={producto.nombre} onChange={handleChangeProducto} style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontWeight: 'bold' }}>Categoría</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
            {!modoNuevaCategoria && categoriasExistentes.length > 0 ? (
              <>
                <select name="categoria" value={producto.categoria} onChange={handleChangeProducto} style={{...inputStyle, marginTop: 0, flex: 1}} required>
                  <option value="">Seleccione...</option>
                  {categoriasExistentes.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <button type="button" onClick={() => { setModoNuevaCategoria(true); setProducto({...producto, categoria: ''}); }} style={{ padding: '0 15px', backgroundColor: 'var(--color-secondary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Nueva</button>
              </>
            ) : (
              <>
                <input type="text" name="categoria" value={producto.categoria} onChange={handleChangeProducto} style={{...inputStyle, marginTop: 0, flex: 1}} placeholder="Ej: Zapatillas" required />
                {categoriasExistentes.length > 0 && <button type="button" onClick={() => { setModoNuevaCategoria(false); setProducto({...producto, categoria: ''}); }} style={{ padding: '0 15px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancelar</button>}
              </>
            )}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontWeight: 'bold' }}>Descripción</label>
          <textarea name="descripcion" value={producto.descripcion} onChange={handleChangeProducto} style={{ ...inputStyle, minHeight: '80px' }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontWeight: 'bold' }}>URL de la Imagen</label>
          <input type="url" name="imagen" value={producto.imagen} onChange={handleChangeProducto} style={inputStyle} />
        </div>
      </div>

      {/* SECCIÓN 2: ATRIBUTOS GLOBALES */}
      <div style={{ ...cardStyle, borderStyle: 'dashed', borderColor: 'var(--color-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h4 style={{ margin: 0 }}>Atributos Globales</h4>
          <button type="button" onClick={agregarAtributoGlobal} style={{ padding: '5px 10px', backgroundColor: 'var(--color-secondary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Agregar</button>
        </div>
        {atributosGlobales.map((attr, index) => (
          <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input type="text" placeholder="Clave (Ej: Marca)" value={attr.clave} onChange={(e) => actualizarAtributoGlobal(index, 'clave', e.target.value)} style={inputStyle} />
            <input type="text" placeholder="Valor (Ej: Nike)" value={attr.valor} onChange={(e) => actualizarAtributoGlobal(index, 'valor', e.target.value)} style={inputStyle} />
            <button type="button" onClick={() => eliminarAtributoGlobal(index)} style={{ marginTop: '5px', padding: '10px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Borrar</button>
          </div>
        ))}
      </div>

      {/* SECCIÓN 3: VARIANTES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-secondary)', paddingBottom: '5px', marginTop: '30px', marginBottom: '15px' }}>
        <h4 style={{ margin: 0, color: 'var(--color-text)' }}>Variantes del Producto</h4>
        <button type="button" onClick={agregarVariante} style={{ padding: '6px 12px', backgroundColor: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+ Nueva Variante</button>
      </div>

      {variantes.map((variante, varIndex) => (
        <div key={varIndex} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <strong style={{ color: 'var(--color-primary)' }}>Variante #{varIndex + 1}</strong>
            <button type="button" onClick={() => eliminarVariante(varIndex)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>Eliminar Variante</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>SKU</label>
              <input type="text" value={variante.sku} onChange={(e) => actualizarVariante(varIndex, 'sku', e.target.value)} style={inputStyle} required />
            </div>
            <div>
              <label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Precio</label>
              <input type="number" value={variante.precio} onChange={(e) => actualizarVariante(varIndex, 'precio', e.target.value)} style={inputStyle} min="0" step="0.01" required />
            </div>
            <div>
              <label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Stock</label>
              <input type="number" value={variante.stock} onChange={(e) => actualizarVariante(varIndex, 'stock', e.target.value)} style={inputStyle} min="0" required />
            </div>
          </div>

          <div style={{ backgroundColor: '#f3f4f6', padding: '10px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.9em', fontWeight: 'bold' }}>Atributos específicos (Ej: Talla: M)</span>
              <button type="button" onClick={() => agregarAtributoVariante(varIndex)} style={{ fontSize: '0.8em', padding: '4px 8px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ Añadir Atributo</button>
            </div>
            {variante.atributosVariables.map((attr, attrIndex) => (
              <div key={attrIndex} style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
                <input type="text" placeholder="Ej: Talla" value={attr.clave} onChange={(e) => actualizarAtributoVariante(varIndex, attrIndex, 'clave', e.target.value)} style={{...inputStyle, marginTop: 0, padding: '6px'}} />
                <input type="text" placeholder="Ej: M" value={attr.valor} onChange={(e) => actualizarAtributoVariante(varIndex, attrIndex, 'valor', e.target.value)} style={{...inputStyle, marginTop: 0, padding: '6px'}} />
                <button type="button" onClick={() => eliminarAtributoVariante(varIndex, attrIndex)} style={{ backgroundColor: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
{/* NUEVO: INTERRUPTOR DE PUBLICACIÓN */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', backgroundColor: producto.publicado ? '#ecfdf5' : '#f3f4f6', borderRadius: '8px', border: `1px solid ${producto.publicado ? '#10b981' : '#d1d5db'}`, marginTop: '20px' }}>
        <div>
          <strong style={{ color: producto.publicado ? '#065f46' : 'var(--color-text)', display: 'block', fontSize: '1.1em' }}>
            {producto.publicado ? 'Ojo: Este producto será visible en la tienda.' : 'Producto en modo Borrador.'}
          </strong>
          <span style={{ fontSize: '0.85em', color: '#6b7280' }}>
            {producto.publicado ? 'Los clientes podrán verlo y comprarlo inmediatamente.' : 'Solo tú puedes verlo. Actívalo cuando esté listo para la venta.'}
          </span>
        </div>
        
        {/* Toggle / Checkbox estilizado */}
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
          <span style={{ fontWeight: 'bold', color: producto.publicado ? '#10b981' : '#9ca3af' }}>
            {producto.publicado ? 'PUBLICADO' : 'OCULTO'}
          </span>
          <input 
            type="checkbox" 
            checked={producto.publicado} 
            onChange={(e) => setProducto({...producto, publicado: e.target.checked})}
            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
          />
        </label>
      </div>
      
      <button type="submit" disabled={cargando} style={{ width: '100%', padding: '15px', backgroundColor: 'var(--color-primary)', color: '#ffffff', fontSize: '1.1em', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: cargando ? 'not-allowed' : 'pointer', marginTop: '20px' }}>
        {cargando ? 'Procesando...' : (productoAEditar ? 'Guardar Cambios' : 'Crear Producto')}
      </button>
    </form>
  );
}