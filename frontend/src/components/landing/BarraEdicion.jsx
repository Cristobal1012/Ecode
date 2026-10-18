import { CAMPOS_TEXTO } from '../../hooks/useEdicionLanding';
import { SelectorImagen } from './ControlesEdicion';

const nombreCampo = (campo) => CAMPOS_TEXTO[campo]?.etiqueta || campo.replace(/_/g, ' ');

// Barra fija del modo edición: identidad (logo y favicon), estado y botones para guardar o descartar
export default function BarraEdicion({ edicion }) {
  const { vista, hayCambios, guardando, errores, mensaje } = edicion;
  const listaErrores = Object.entries(errores);

  return (
    <div className="barra-edicion" role="region" aria-label="Modo edición de la página de inicio">
      <div className="contenedor barra-edicion-contenido">
        <div className="barra-edicion-estado">
          <strong>Modo edición</strong>
          <span role="status">
            {guardando ? 'Guardando…' : mensaje || (hayCambios ? 'Tienes cambios sin guardar' : 'Sin cambios')}
          </span>
        </div>

        <div className="barra-edicion-identidad">
          <SelectorImagen campo="logo" nombre="logo" tieneImagen={Boolean(vista.logo)} edicion={edicion} claro />
          <SelectorImagen campo="favicon" nombre="favicon" tieneImagen={Boolean(vista.favicon)} edicion={edicion} claro />
        </div>

        <div className="barra-edicion-acciones">
          <button type="button" className="boton-edicion" onClick={edicion.descartar}
            disabled={!hayCambios || guardando}>
            Descartar
          </button>
          <button type="button" className="boton boton-primario" onClick={edicion.guardar}
            disabled={!hayCambios || guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" className="boton-edicion" disabled={guardando}
            onClick={() => {
              if (!hayCambios || window.confirm('Tienes cambios sin guardar. ¿Salir y descartarlos?')) edicion.salir();
            }}>
            Salir
          </button>
        </div>
      </div>

      {listaErrores.length > 0 && (
        <ul className="contenedor barra-edicion-errores" role="alert">
          {listaErrores.map(([campo, texto]) => (
            <li key={campo}>{campo === 'general' ? texto : `${nombreCampo(campo)}: ${texto}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
