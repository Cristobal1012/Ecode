import { useId } from 'react';
import { CAMPOS_TEXTO } from '../../hooks/useEdicionLanding';

// Texto de la landing editable en su lugar: hereda el estilo del elemento que reemplaza (clase) y tiene una
// etiqueta visible, para que se sepa qué se está editando
// ancho: clase del contenedor para que la etiqueta y el contador queden alineados con el campo
export function CampoEditable({ campo, edicion, multilinea = false, filas = 2, className = '', claro = false, ancho = '', definicion = CAMPOS_TEXTO[campo], deshabilitado = false }) {
  const id = useId();
  const { etiqueta, maximo } = definicion;
  const valor = edicion.textos[campo];
  const error = edicion.errores[campo];
  const Control = multilinea ? 'textarea' : 'input';

  return (
    <div className={`campo-editable${claro ? ' campo-editable--claro' : ''} ${ancho}`}>
      <label htmlFor={id} className="campo-editable-etiqueta">{etiqueta}</label>
      <Control
        id={id}
        className={`campo-editable-control ${className}`}
        value={valor}
        maxLength={maximo}
        disabled={deshabilitado}
        rows={multilinea ? filas : undefined}
        onChange={(e) => edicion.cambiarTexto(campo, e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-ayuda`}
      />
      <span id={`${id}-ayuda`} className={`campo-editable-ayuda${error ? ' campo-editable-ayuda--error' : ''}`}>
        {error || `${valor.length}/${maximo}`}
      </span>
    </div>
  );
}

// Botones para subir, cambiar o quitar una imagen; la vista previa la dibuja la sección
export function SelectorImagen({ campo, nombre, tieneImagen, edicion, claro = false }) {
  const id = useId();
  const error = edicion.errores[campo];

  return (
    <div className={`selector-imagen${claro ? ' selector-imagen--claro' : ''}`}>
      {/* El input va antes de la etiqueta para que el foco de teclado se vea en el botón */}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visualmente-oculto"
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) edicion.cambiarImagen(campo, archivo);
          // Permite volver a elegir el mismo archivo
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="boton-edicion">
        {tieneImagen ? `Cambiar ${nombre}` : `Subir ${nombre}`}
      </label>
      {tieneImagen && (
        <button type="button" className="boton-edicion" onClick={() => edicion.cambiarImagen(campo, null)}>
          Quitar <span className="visualmente-oculto">{nombre}</span>
        </button>
      )}
      {error && <span id={`${id}-error`} className="selector-imagen-error" role="alert">{error}</span>}
    </div>
  );
}
