import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PaletteSelector from '../components/PaletteSelector';
import TipografiaSelector from '../components/TipografiaSelector';
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
import GestorCouriers from '../components/GestorCouriers';
import GestorPromociones from '../components/GestorPromociones';
import GestorContacto from '../components/GestorContacto';
import GestorEntregaCoordinada from '../components/GestorEntregaCoordinada';
import GestorCotizaciones from '../components/GestorCotizaciones';
import GestorFormularioCotizacion from '../components/GestorFormularioCotizacion';
import GestorOrdenCatalogo from '../components/GestorOrdenCatalogo';
import GestorBlog from '../components/GestorBlog';
import GestorSobreMi from '../components/GestorSobreMi';
import GestorPublicaciones from '../components/GestorPublicaciones';
import GestorAnalitica from '../components/GestorAnalitica';
import GestorResenas from '../components/GestorResenas';
import GestorActivarResenas from '../components/GestorActivarResenas';
import GestorDocumentosTributarios from '../components/GestorDocumentosTributarios';
import './Admin.css';
import Spinner from '../components/carga/Spinner';

// Secciones de la vista Configuración: alimentan los títulos y el índice lateral.
// Para agregar una sección, súmala aquí y usa <TituloSeccion id="..." /> en su bloque.
const SECCIONES_CONFIGURACION = [
  { id: 'config-landing', titulo: 'Página de Inicio e Identidad' },
  { id: 'config-paleta', titulo: 'Paleta de Colores de la Tienda' },
  { id: 'config-tipografia', titulo: 'Tipografía de la Tienda' },
  { id: 'config-orden-catalogo', titulo: 'Orden del catálogo y categorías' },
  { id: 'config-local', titulo: 'Dirección del Local y Retiro en Tienda' },
  { id: 'config-entrega-coordinada', titulo: 'Entrega Coordinada' },
  { id: 'config-contacto', titulo: 'Contacto y Redes' },
  { id: 'config-couriers', titulo: 'Envíos por courier' },
  { id: 'config-medios-pago', titulo: 'Medios de Pago' },
  { id: 'config-documentos', titulo: 'Boletas y Facturas (SII)' },
  { id: 'config-cotizaciones', titulo: 'Cotizaciones y Encargos' },
  { id: 'config-blog', titulo: 'Blog o Portafolio' },
  { id: 'config-sobre-mi', titulo: 'Página Sobre mí' },
  { id: 'config-resenas', titulo: 'Reseñas de Clientes' },
  { id: 'config-promociones', titulo: 'Promociones y Descuentos' },
  { id: 'config-analitica', titulo: 'Analítica y marketing' }
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
  // Con qué filtro se abre Ventas desde un "Ver" del dashboard (desde el menú se abre sin filtro)
  const [filtroVentas, setFiltroVentas] = useState(null);
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
  // Con un courier activo, la comuna del local se elige de su lista: escrita a mano ('Maipú') no coincidía con la
  // del courier ('MAIPU') y no se podía cotizar. Sin courier, se escribe libre
  const [comunasCourier, setComunasCourier] = useState([]);

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
    // Sin couriers activos responde 503: la comuna queda como texto libre
    clienteAxios.get('ventas/logistica/comunas/')
      .then(({ data }) => setComunasCourier(data.comunas || []))
      .catch(() => setComunasCourier([]));

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

  const abrirVista = (vista) => {
    setFiltroVentas(null);
    setVistaActiva(vista);
  };

  // "Ver" del dashboard: abre la vista con su filtro y lleva el foco al contenido, como el menú lateral
  const irA = (vista, filtro = null) => {
    setFiltroVentas(filtro);
    setVistaActiva(vista);
    if (vista === 'inventario') {
      setMostrandoFormulario(false);
      setProductoAEditar(null);
    }
    requestAnimationFrame(() => document.getElementById('contenido')?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0 });
  };

  const renderizarContenido = () => {
    switch (vistaActiva) {
      case 'dashboard':
       return <Dashboard onIrA={irA} />;
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
            {/* El key remonta la lista con el filtro nuevo: GestorPedidos lo lee al montarse */}
            <GestorPedidos key={JSON.stringify(filtroVentas)} filtroInicial={filtroVentas || undefined} />
          </div>
        );

      case 'cotizaciones':
        return (
          <div>
            <h2 className="admin-titulo">Cotizaciones</h2>
            <GestorCotizaciones />
          </div>
        );
      case 'resenas':
        return (
          <div>
            <h2 className="admin-titulo">Reseñas</h2>
            <GestorResenas />
          </div>
        );
      case 'blog':
        return <GestorPublicaciones />;
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
                  <TituloSeccion id="config-tipografia" />
                  <TipografiaSelector />
                </div>

                <hr className="admin-separador" />

                <div><TituloSeccion id="config-orden-catalogo" /><GestorOrdenCatalogo /></div>
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
                        <input id="local-calle" maxLength={255} type="text" value={configLocal.calle_origen}
                          onChange={(e) => setConfigLocal({...configLocal, calle_origen: e.target.value})}
                          required placeholder="Ej: Av. Principal" />
                      </div>
                      <div className="admin-campo">
                        <label htmlFor="local-numero">Número</label>
                        <input id="local-numero" maxLength={50} type="text" value={configLocal.numero_origen}
                          onChange={(e) => setConfigLocal({...configLocal, numero_origen: e.target.value})}
                          required placeholder="Ej: 123" />
                      </div>
                    </div>

                    <div className="admin-campo">
                      <label htmlFor="local-detalle">Piso, oficina, bodega o detalle (opcional)</label>
                      <input id="local-detalle" maxLength={100} type="text" value={configLocal.dpto_casa_origen}
                        onChange={(e) => setConfigLocal({...configLocal, dpto_casa_origen: e.target.value})}
                        placeholder="Ej: Piso 4, Oficina 405" />
                    </div>

                    <div className="admin-fila">
                      <div className="admin-campo">
                        <label htmlFor="local-comuna">Comuna</label>
                        {comunasCourier.length > 0 ? (
                          <select id="local-comuna" value={configLocal.comuna_origen}
                            onChange={(e) => setConfigLocal({...configLocal, comuna_origen: e.target.value})} required>
                            <option value="">-- Selecciona --</option>
                            {/* La guardada antes a mano, aunque no esté en la lista, para que se vea y se pueda cambiar */}
                            {configLocal.comuna_origen && !comunasCourier.includes(configLocal.comuna_origen) && (
                              <option value={configLocal.comuna_origen}>{configLocal.comuna_origen}</option>
                            )}
                            {comunasCourier.map(comuna => <option key={comuna} value={comuna}>{comuna}</option>)}
                          </select>
                        ) : (
                          <input id="local-comuna" maxLength={100} type="text" value={configLocal.comuna_origen}
                            onChange={(e) => setConfigLocal({...configLocal, comuna_origen: e.target.value})}
                            required placeholder="Ej: Santiago" />
                        )}
                      </div>
                      <div className="admin-campo">
                        <label htmlFor="local-region">Región</label>
                        <input id="local-region" maxLength={100} type="text" value={configLocal.region_origen}
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
                        {guardandoLocal && <Spinner />}{guardandoLocal ? 'Guardando...' : 'Guardar dirección y opciones de retiro'}
                      </button>
                    </div>
                  </form>
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-entrega-coordinada" />
                  <GestorEntregaCoordinada />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-contacto" />
                  <GestorContacto />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-couriers" />
                  <GestorCouriers />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-medios-pago" />
                  <GestorMediosPago />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-documentos" />
                  <GestorDocumentosTributarios />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-cotizaciones" />
                  <GestorFormularioCotizacion />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-blog" />
                  <GestorBlog />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-sobre-mi" />
                  <GestorSobreMi />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-resenas" />
                  <GestorActivarResenas />
                </div>

                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-promociones" />
                  <GestorPromociones />
                </div>
                <hr className="admin-separador" />

                <div>
                  <TituloSeccion id="config-analitica" />
                  <GestorAnalitica />
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
        setVistaActiva={abrirVista}
        setMostrandoFormulario={setMostrandoFormulario}
        setProductoAEditar={setProductoAEditar}
        navigate={navigate}
      />

      <main tabIndex={-1} id="contenido" className="admin-principal">
        <AdminTopbar />
        <div className="admin-contenido">
          {renderizarContenido()}
        </div>
      </main>
    </div>
  );
}
