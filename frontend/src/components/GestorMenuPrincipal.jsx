import { useEffect, useRef, useState } from 'react';
import clienteAxios from './auth/axiosConfig';
import { recargarConfiguracion } from '../hooks/useConfiguracionTienda';
import { ORDEN_MENU, resolverMenu } from '../utils/menuPrincipal';

const ETIQUETAS = { inicio: 'Inicio', catalogo: 'Catálogo', nosotros: 'Blog/Nosotros', sobre_mi: 'Sobre mí', cotizar: 'Cotizar' };

export default function GestorMenuPrincipal() {
  const [config, setConfig] = useState(null);
  const [menu, setMenu] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState('');
  const botones = useRef({});
  useEffect(() => {
    clienteAxios.get('configuracion/negocio/').then(({ data }) => {
      setConfig(data); setMenu(data.menu_principal || {});
    }).catch(() => setError('No se pudo cargar el menú. Vuelve a abrir Configuración.'));
  }, []);
  const enlaces = resolverMenu({ ...config, menu_principal: menu });
  const editar = (id, nombre) => {
    setMenu(actual => ({ ...actual, nombres: { ...actual.nombres, [id]: nombre } }));
    setError(''); setEstado('');
  };
  const mover = (id, cambio) => {
    const orden = enlaces.map(enlace => enlace.id);
    const posicion = orden.indexOf(id);
    [orden[posicion], orden[posicion + cambio]] = [orden[posicion + cambio], orden[posicion]];
    setMenu(actual => ({ ...actual, orden }));
    setEstado(`${ETIQUETAS[id]}: posición ${posicion + cambio + 1} de 5.`);
    // En los extremos, el botón opuesto sigue disponible para conservar el foco.
    const direccion = posicion + cambio === 0 ? 1 : posicion + cambio === 4 ? -1 : cambio;
    requestAnimationFrame(() => botones.current[`${id}:${direccion}`]?.focus());
  };
  const guardar = async event => {
    event.preventDefault(); setGuardando(true); setError(''); setEstado('');
    try {
      const { data } = await clienteAxios.patch('configuracion/negocio/', { menu_principal: menu });
      setConfig(data); setMenu(data.menu_principal || {});
      try {
        await recargarConfiguracion();
        setEstado('Menú guardado.');
      } catch {
        setEstado('Menú guardado. Recarga la tienda para ver los cambios.');
      }
    } catch (fallo) {
      const detalle = fallo.response?.data?.menu_principal;
      setError(detalle ? [].concat(detalle).join(' ') : 'No se pudo guardar el menú. Inténtalo de nuevo.');
    } finally { setGuardando(false); }
  };
  return <>
    <p className="texto-secundario admin-descripcion">Personaliza solo los enlaces del menú principal. Un nombre vacío usa el nombre heredado de la tienda. Los enlaces ocultos conservan su posición al activarse.</p>
    {error && <p role="alert" className="admin-aviso admin-aviso--error">{error}</p>}
    <p role="status" aria-live="polite">{estado}</p>
    {!config ? !error && <p>Cargando menú...</p> : <form onSubmit={guardar} className="admin-formulario">
      <fieldset disabled={guardando} className="menu-editor-campos">
        <legend>Orden y nombres de los enlaces</legend>
        <ol className="menu-editor-lista">
          {enlaces.map((enlace, indice) => <li key={enlace.id} className="menu-editor-fila">
            <div className="admin-campo">
              <label htmlFor={`menu-${enlace.id}`}>{ETIQUETAS[enlace.id]}</label>
              <input id={`menu-${enlace.id}`} value={menu.nombres?.[enlace.id] || ''} maxLength={30}
                placeholder={enlace.base} aria-describedby={`menu-ayuda-${enlace.id}`}
                onChange={event => editar(enlace.id, event.target.value)} />
              <small id={`menu-ayuda-${enlace.id}`}>Nombre visible: {enlace.nombre}. {enlace.visible ? 'Visible.' : enlace.id === 'nosotros' ? 'Oculto: activa el blog o agrega texto a Nosotros.' : `Oculto: activa ${ETIQUETAS[enlace.id]} en su sección.`}</small>
            </div>
            <div className="menu-editor-acciones">
              {[-1, 1].map(cambio => <button key={cambio} type="button" className="boton boton-secundario"
                ref={elemento => { botones.current[`${enlace.id}:${cambio}`] = elemento; }}
                disabled={cambio === -1 ? indice === 0 : indice === ORDEN_MENU.length - 1}
                aria-label={`${cambio === -1 ? 'Subir' : 'Bajar'} ${ETIQUETAS[enlace.id]}`}
                onClick={() => mover(enlace.id, cambio)}>{cambio === -1 ? 'Subir' : 'Bajar'}</button>)}
            </div>
          </li>)}
        </ol>
        <div className="menu-editor-acciones">
          <button type="submit" className="boton boton-primario">{guardando ? 'Guardando...' : 'Guardar menú'}</button>
          <button type="button" className="boton boton-secundario" onClick={() => { setMenu({}); setError(''); setEstado('Valores predeterminados preparados. Guarda para publicarlos.'); }}>Restablecer valores predeterminados</button>
        </div>
      </fieldset>
    </form>}
  </>;
}
