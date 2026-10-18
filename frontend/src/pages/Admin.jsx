import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PaletteSelector from '../components/PaletteSelector';
import clienteAxios from '../components/auth/axiosConfig'; 
import { aplicarPaleta } from '../constants/palettes';
import FormularioProducto from '../components/FormularioProducto';
import TablaInventario from '../components/TablaInventario';
import Dashboard from '../components/Dashboard';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import GestorPedidos from '../components/GestorPedidos';
import GestorPoliticas from '../components/GestorPoliticas';
import GestorMediosPago from '../components/GestorMediosPago';
import GestorChilexpress from '../components/GestorChilexpress';
import GestorPromociones from '../components/GestorPromociones';
import GestorContacto from '../components/GestorContacto';
import './Admin.css';

// Secciones de la vista Configuración: alimentan los títulos y el índice lateral.
// Para agregar una sección, súmala aquí y usa <TituloSeccion id="..." /> en su bloque.
const SECCIONES_CONFIGURACION = [
  { id: 'config-landing', titulo: 'Página de Inicio e Identidad' },
  { id: 'config-paleta', titulo: 'Paleta de Colores de la Tienda' },
  { id: 'config-local', titulo: 'Dirección del Local y Retiro en Tienda' },
  { id: 'config-contacto', titulo: 'Contacto y Redes' },
  { id: 'config-chilexpress', titulo: 'Envíos con Chilexpress' },
  { id: 'config-medios-pago', titulo: 'Medios de Pago' },
  { id: 'config-promociones', titulo: 'Promociones y Descuentos' }
];

const TituloSeccion = ({ id }) => (
  <h3 id={id} tabIndex={-1} className="config-titulo">
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
    aplicarPaleta(Number(localStorage.getItem('ecommerce_palette')) || 1);

    const fetchTema = async () => {
      try {
        const response = await clienteAxios.get('configuracion/negocio/');
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        if (config) {
          if (config.tema_seleccionado !== undefined) {
            const temaId = Number(config.tema_seleccionado);
            localStorage.setItem('ecommerce_palette', temaId.toString());
            aplicarPaleta(temaId);
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
      aplicarPaleta(e.detail.temaId);
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
            <div className="admin-encabezado-vista">
              <h2 className="admin-titulo">Inventario</h2>
              {!mostrandoFormulario && !productoAEditar && (
                <button type="button" className="boton boton-primario" onClick={() => setMostrandoFormulario(true)}>
                  + Agregar producto
                </button>
              )}
            </div>

            {mostrandoFormulario || productoAEditar ? (
              <FormularioProducto
                // Un formulario nuevo por producto: lee sus datos una sola vez al montarse
                key={productoAEditar ? (productoAEditar.id || productoAEditar._id) : 'nuevo'}
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
            <h2 className="admin-titulo">Ventas</h2>
            <GestorPedidos/>
          </div>
        );

      case 'configuracion':
        return (
          <div>
            <h2 className="admin-titulo">Configuración</h2>
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
                {/* RF-01.1: la landing, el logo y el favicon se editan en la misma página, viendo cómo quedan */}
                <div>
                  <TituloSeccion id="config-landing" />
                  <p className="texto-secundario admin-descripcion">
                    Cambia el nombre de tu tienda, el logo, el favicon y los textos e imágenes de la página de
                    inicio directamente sobre ella. Nada se publica hasta que guardes.
                  </p>
                  <button type="button" className="boton boton-primario" onClick={() => navigate('/?editar=1')}>
                    Editar página de inicio
                  </button>
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-paleta" />
                  <PaletteSelector />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-local" />
                  {mensajeLocal && (
                    <div role="status" className={`admin-aviso ${mensajeLocal.includes('éxito') ? 'admin-aviso--exito' : 'admin-aviso--error'}`}>
                      {mensajeLocal}
                    </div>
                  )}
                  <form onSubmit={handleGuardarConfigLocal} className="admin-formulario">
                    <div className="admin-fila">
                      <div className="admin-campo admin-campo--ancho">
                        <label htmlFor="local-calle">Calle del local</label>
                        <input id="local-calle" type="text" value={configLocal.calle_origen}
                          onChange={(e) => setConfigLocal({...configLocal, calle_origen: e.target.value})}
                          required placeholder="Ej: Av. Principal" />
                      </div>
                      <div className="admin-campo">
                        <label htmlFor="local-numero">Número</label>
                        <input id="local-numero" type="text" value={configLocal.numero_origen}
                          onChange={(e) => setConfigLocal({...configLocal, numero_origen: e.target.value})}
                          required placeholder="Ej: 123" />
                      </div>
                    </div>

                    <div className="admin-campo">
                      <label htmlFor="local-detalle">Piso, oficina, bodega o detalle (opcional)</label>
                      <input id="local-detalle" type="text" value={configLocal.dpto_casa_origen}
                        onChange={(e) => setConfigLocal({...configLocal, dpto_casa_origen: e.target.value})}
                        placeholder="Ej: Piso 4, Oficina 405" />
                    </div>

                    <div className="admin-fila">
                      <div className="admin-campo">
                        <label htmlFor="local-comuna">Comuna</label>
                        <input id="local-comuna" type="text" value={configLocal.comuna_origen}
                          onChange={(e) => setConfigLocal({...configLocal, comuna_origen: e.target.value})}
                          required placeholder="Ej: Santiago" />
                      </div>
                      <div className="admin-campo">
                        <label htmlFor="local-region">Región</label>
                        <input id="local-region" type="text" value={configLocal.region_origen}
                          onChange={(e) => setConfigLocal({...configLocal, region_origen: e.target.value})}
                          placeholder="Ej: Metropolitana" />
                      </div>
                    </div>

                    <label className="admin-casilla">
                      <input type="checkbox" checked={configLocal.retiro_en_local_activo}
                        onChange={(e) => setConfigLocal({...configLocal, retiro_en_local_activo: e.target.checked})} />
                      Permitir a los clientes seleccionar "Retiro en Local" gratuito en el Checkout
                    </label>

                    <div>
                      <button type="submit" disabled={guardandoLocal} className="boton boton-primario">
                        {guardandoLocal ? 'Guardando...' : 'Guardar dirección y opciones de retiro'}
                      </button>
                    </div>
                  </form>
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-contacto" />
                  <GestorContacto />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-chilexpress" />
                  <GestorChilexpress />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-medios-pago" />
                  <GestorMediosPago />
                </div>

                <hr className="admin-separador" />
        
                <div>
                  <TituloSeccion id="config-promociones" />
                  <GestorPromociones />
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
        return <h2 className="admin-titulo">Bienvenido al Panel</h2>;
    }
  };

  return (
    <div className="admin">
      <AdminSidebar
        vistaActiva={vistaActiva}
        setVistaActiva={setVistaActiva}
        setMostrandoFormulario={setMostrandoFormulario}
        setProductoAEditar={setProductoAEditar}
        navigate={navigate}
      />

      <main className="admin-principal">
        <AdminTopbar />
        <div className="admin-contenido">
          {renderizarContenido()}
        </div>
      </main>
    </div>
  );
}
