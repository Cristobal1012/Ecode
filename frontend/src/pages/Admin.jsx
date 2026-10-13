import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PaletteSelector from '../components/PaletteSelector';
import clienteAxios from '../components/auth/axiosConfig'; 
import { PALETTES } from '../constants/palettes';
import FormularioProducto from '../components/FormularioProducto';
import TablaInventario from '../components/TablaInventario';
import Dashboard from '../components/Dashboard';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import GestorPedidos from '../components/GestorPedidos';
import GestorPoliticas from '../components/GestorPoliticas';
import './Admin.css';

// Secciones de la vista Configuración: alimentan los títulos y el índice lateral.
// Para agregar una sección, súmala aquí y usa <TituloSeccion id="..." /> en su bloque.
const SECCIONES_CONFIGURACION = [
  { id: 'config-paleta', titulo: 'Paleta de Colores de la Tienda' },
  { id: 'config-local', titulo: 'Dirección del Local y Retiro en Tienda' }
];

const TituloSeccion = ({ id }) => (
  <h3 id={id} tabIndex={-1} className="config-titulo" style={{ fontSize: '1.2rem', marginBottom: '15px', color: 'var(--color-text)' }}>
    {SECCIONES_CONFIGURACION.find(seccion => seccion.id === id).titulo}
  </h3>
);

const irASeccion = (id) => {
  const titulo = document.getElementById(id);
  if (!titulo) return;
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  titulo.scrollIntoView({ behavior: reducirMovimiento ? 'auto' : 'smooth', block: 'start' });
  // El foco acompaña al scroll: teclado y lectores de pantalla llegan a la sección
  titulo.focus({ preventScroll: true });
};

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
       return <Dashboard />;
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
            <div className="config-layout">
              <nav aria-label="Secciones de configuración" className="config-indice">
                <ul>
                  {SECCIONES_CONFIGURACION.map(seccion => (
                    <li key={seccion.id}>
                      <button type="button" onClick={() => irASeccion(seccion.id)}>{seccion.titulo}</button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="config-secciones">
                <div style={{ marginBottom: '30px' }}>
                  <TituloSeccion id="config-paleta" />
                  <PaletteSelector />
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '30px 0' }} />

                <div>
                  <TituloSeccion id="config-local" />
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
            </div>
          </div>
        );
        case 'paginas':
          return (
            <div>
              <GestorPoliticas />
            </div>
          );
      default:
        return <h2 style={{ color: 'var(--color-text)' }}>Bienvenido al Panel</h2>;
    }
  };

  return (
  <div
    style={{
      display: 'flex',
      minHeight: '100vh',
      width: '100%',
      backgroundColor: '#f3f4f6',
      fontFamily: "'Inter', sans-serif"
    }}
  >
    
    {/* SIDEBAR */}
    <AdminSidebar
      vistaActiva={vistaActiva}
      setVistaActiva={setVistaActiva}
      setMostrandoFormulario={setMostrandoFormulario}
      setProductoAEditar={setProductoAEditar}
      navigate={navigate}
    />

    {/* CONTENIDO PRINCIPAL */}
    <main
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background-color 0.3s'
      }}
    >
      
      {/* TOP NAVBAR */}
      <AdminTopbar />

      {/* CONTENEDOR VISTAS */}
      <div
        style={{
          flex: 1,
          padding: '0 40px 40px 40px'
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '30px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            minHeight: '100%',
            boxSizing: 'border-box'
          }}
        >
          {renderizarContenido()}
        </div>
      </div>
    </main>
  </div>
);
}