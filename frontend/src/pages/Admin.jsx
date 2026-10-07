import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PaletteSelector from '../components/PaletteSelector';
import clienteAxios from '../components/auth/axiosConfig'; 
import { PALETTES } from '../constants/palettes';
import FormularioProducto from '../components/FormularioProducto';
import TablaInventario from '../components/TablaInventario';
import GestorPedidos from '../components/GestorPedidos';

export default function Admin() {
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  
  // NUEVO ESTADO: Almacena el producto seleccionado para edición
  const [productoAEditar, setProductoAEditar] = useState(null); 

  // --- NUEVOS ESTADOS PARA LA DIRECCIÓN DEL LOCAL Y RETIRO ---
  const [configLocal, setConfigLocal] = useState({
    calle_origen: '',
    numero_origen: '',
    dpto_casa_origen: '',
    comuna_origen: '',
    region_origen: '',
    retiro_en_local_activo: true
  });
  const [guardandoLocal, setGuardandoLocal] = useState(false);
  const [mensajeLocal, setMensajeLocal] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const savedPaletteId = Number(localStorage.getItem('ecommerce_palette')) || 1;
    const activePalette = PALETTES.find((p) => p.id === savedPaletteId) || PALETTES[0];

    const applyColors = (colors) => {
      if (!colors) return;
      const root = document.documentElement;
      root.style.setProperty('--color-primary', colors.primary);
      root.style.setProperty('--color-secondary', colors.secondary);
      root.style.setProperty('--color-accent', colors.accent);
      root.style.setProperty('--color-background', colors.background);
      root.style.setProperty('--color-text', colors.text);
    };

    applyColors(activePalette.colors);

    const fetchTema = async () => {
      try {
        const response = await clienteAxios.get('configuracion/negocio/');
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        if (config) {
          if (config.tema_seleccionado !== undefined) {
            const temaId = Number(config.tema_seleccionado);
            localStorage.setItem('ecommerce_palette', temaId.toString());
            const palette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
            applyColors(palette.colors);
          }
          // Cargar datos de la tienda para el formulario de retiro local
          setConfigLocal({
            calle_origen: config.calle_origen || '',
            numero_origen: config.numero_origen || '',
            comuna_origen: config.comuna_origen || '',
            region_origen: config.region_origen || '',
            dpto_casa_origen: config.dpto_casa_origen || '',
            retiro_en_local_activo: config.retiro_en_local_activo ?? true
          });
        }
      } catch (error) {
        console.error('Error al sincronizar configuración en el panel Admin:', error);
      }
    };

    fetchTema();

    const handleThemeChanged = (e) => {
      const temaId = e.detail.temaId;
      const newPalette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
      applyColors(newPalette.colors);
    };

    window.addEventListener('themeChanged', handleThemeChanged);
    return () => window.removeEventListener('themeChanged', handleThemeChanged);
  }, []);

  const handleGuardarConfigLocal = async (e) => {
    e.preventDefault();
    setGuardandoLocal(true);
    setMensajeLocal('');
    try {
      await clienteAxios.patch('configuracion/negocio/', configLocal);
      setMensajeLocal('¡Dirección de la tienda y retiro en local actualizados con éxito!');
    } catch (error) {
      console.error('Error guardando configuración de tienda:', error);
      setMensajeLocal('Error al guardar los cambios. Inténtalo de nuevo.');
    } finally {
      setGuardandoLocal(false);
    }
  };

  const renderizarContenido = () => {
    switch (vistaActiva) {
      case 'dashboard':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Dashboard</h2>
            <p style={{ color: 'var(--color-text)' }}>Aquí irán los gráficos y métricas principales de tu e-commerce.</p>
          </div>
        );
      case 'inventario':
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.5rem', color: 'var(--color-primary)', margin: 0 }}>Inventario</h2>
              {!mostrandoFormulario && !productoAEditar && (
                <button 
                  onClick={() => setMostrandoFormulario(true)}
                  style={{ 
                    padding: '10px 20px', 
                    backgroundColor: 'var(--color-accent)', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer', 
                    fontWeight: 'bold',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseOver={(e) => e.target.style.opacity = '0.9'}
                  onMouseOut={(e) => e.target.style.opacity = '1'}
                >
                  + Agregar Producto
                </button>
              )}
            </div>

            {mostrandoFormulario || productoAEditar ? (
              <FormularioProducto 
                productoAEditar={productoAEditar}
                alCancelar={() => {
                  setMostrandoFormulario(false);
                  setProductoAEditar(null);
                }} 
                alGuardar={() => {
                  setMostrandoFormulario(false);
                  setProductoAEditar(null);
                }} 
              />
            ) : (
              <TablaInventario 
                onEditarProducto={(producto) => setProductoAEditar(producto)}
              /> 
            )}
          </div>
        );
      case 'ventas':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Ventas</h2>
            <GestorPedidos/>
          </div>
        );
      case 'configuracion':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Configuración</h2>
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--color-text)' }}>Paleta de Colores de la Tienda</h3>
              <PaletteSelector />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '30px 0' }} />

            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--color-text)' }}>Dirección del Local y Retiro en Tienda</h3>
              {mensajeLocal && (
                <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensajeLocal.includes('éxito') ? '#d4edda' : '#f8d7da', color: mensajeLocal.includes('éxito') ? '#155724' : '#721c24', borderRadius: '4px', fontSize: '0.9rem' }}>
                  {mensajeLocal}
                </div>
              )}
              <form onSubmit={handleGuardarConfigLocal} style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 3 }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>Calle del Local</label>
                    <input 
                      type="text" 
                      value={configLocal.calle_origen} 
                      onChange={(e) => setConfigLocal({...configLocal, calle_origen: e.target.value})} 
                      required 
                      style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      placeholder="Ej: Av. Principal"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>Número</label>
                    <input 
                      type="text" 
                      value={configLocal.numero_origen} 
                      onChange={(e) => setConfigLocal({...configLocal, numero_origen: e.target.value})} 
                      required 
                      style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      placeholder="Ej: 123"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>Piso, Oficina, Bodega o Detalle (Opcional)</label>
                  <input 
                    type="text" 
                    value={configLocal.dpto_casa_origen} 
                    onChange={(e) => setConfigLocal({...configLocal, dpto_casa_origen: e.target.value})} 
                    style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    placeholder="Ej: Piso 4, Oficina 405"
                  />
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>Comuna</label>
                    <input 
                      type="text" 
                      value={configLocal.comuna_origen} 
                      onChange={(e) => setConfigLocal({...configLocal, comuna_origen: e.target.value})} 
                      required 
                      style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      placeholder="Ej: Santiago"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: '#374151' }}>Región</label>
                    <input 
                      type="text" 
                      value={configLocal.region_origen} 
                      onChange={(e) => setConfigLocal({...configLocal, region_origen: e.target.value})} 
                      style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      placeholder="Ej: Metropolitana"
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.95rem', color: '#374151', cursor: 'pointer', marginTop: '5px' }}>
                    <input 
                      type="checkbox" 
                      checked={configLocal.retiro_en_local_activo} 
                      onChange={(e) => setConfigLocal({...configLocal, retiro_en_local_activo: e.target.checked})} 
                      style={{ marginRight: '10px', width: '18px', height: '18px' }}
                    />
                    Permitir a los clientes seleccionar "Retiro en Local" gratuito en el Checkout
                  </label>
                </div>

                <button 
                  type="submit" 
                  disabled={guardandoLocal}
                  style={{ padding: '12px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: guardandoLocal ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1rem', marginTop: '10px' }}
                >
                  {guardandoLocal ? 'Guardando...' : 'Guardar Dirección y Opciones de Retiro'}
                </button>
              </form>
            </div>
          </div>
        );
      default:
        return <h2 style={{ color: 'var(--color-text)' }}>Bienvenido al Panel</h2>;
    }
  };

  const getEstiloBoton = (activo) => ({
    width: '100%',
    padding: '15px 20px',
    background: activo ? 'var(--color-secondary)' : 'transparent',
    color: activo ? '#ffffff' : 'rgba(255,255,255,0.7)',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    fontWeight: activo ? 'bold' : 'normal',
    borderLeft: activo ? '4px solid var(--color-accent)' : '4px solid transparent',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-background)', fontFamily: 'sans-serif' }}>
      
      <aside style={{ width: '250px', backgroundColor: 'var(--color-primary)', display: 'flex', flexDirection: 'column', paddingTop: '20px', transition: 'background-color 0.3s' }}>
        <h1 style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '40px', padding: '0 20px', color: '#ffffff' }}>
          Panel de administración
        </h1>
        
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => setVistaActiva('dashboard')} style={getEstiloBoton(vistaActiva === 'dashboard')}>
            Dashboard
          </button>
          
          <button onClick={() => { setVistaActiva('inventario'); setMostrandoFormulario(false); setProductoAEditar(null); }} style={getEstiloBoton(vistaActiva === 'inventario')}>
            Inventario
          </button>
          
          <button onClick={() => setVistaActiva('ventas')} style={getEstiloBoton(vistaActiva === 'ventas')}>
            Ventas
          </button>
          <button onClick={() => setVistaActiva('configuracion')} style={getEstiloBoton(vistaActiva === 'configuracion')}>
            Configuración
          </button>

          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '15px 20px' }}></div>

          <button 
            onClick={() => navigate('/catalogo')} 
            style={{...getEstiloBoton(false), display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
          >
            <span>Ver Catálogo</span>
            <span style={{ fontSize: '1.2rem' }}>↗</span>
          </button>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '40px', transition: 'background-color 0.3s' }}>
        <div style={{ 
          background: '#ffffff', 
          padding: '30px', 
          borderRadius: '8px', 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
          minHeight: '80vh',
          borderTop: '6px solid var(--color-primary)',
          transition: 'border-color 0.3s'
        }}>
          {renderizarContenido()}
        </div>
      </main>
    </div>
  );
}