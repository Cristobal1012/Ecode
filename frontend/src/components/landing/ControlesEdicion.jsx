import { useId, useRef, useState } from 'react';
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

// Editor de fotos del carrusel de la portada (SCRUM-194): sube varias fotos, las ordena y las borra
export function EditorFotosBanner({ banners = [], edicion, claro = false }) {
  const id = useId();
  const error = edicion?.errores?.banner;
  const total = banners.length;
  const [estado, setEstado] = useState('');
  const botones = useRef({});

  const mover = (idx, cambio) => {
    const destino = idx + cambio;
    if (destino < 0 || destino >= total) return;
    edicion.reordenarFotosBanner(idx, destino);
    setEstado(`Foto: posición ${destino + 1} de ${total}.`);

    // En los extremos, el botón opuesto sigue disponible para conservar el foco.
    const foto = banners[idx];
    const fotoKey = foto.id ?? idx;
    const direccion = destino === 0 ? 1 : destino === total - 1 ? -1 : cambio;
    requestAnimationFrame(() => botones.current[`${fotoKey}:${direccion}`]?.focus());
  };

  return (
    <div className={`selector-imagen${claro ? ' selector-imagen--claro' : ''} portada-editor-fotos-contenedor`}>
      <input
        id={id}
        type="file"
        multiple
        disabled={total >= 10}
        accept="image/jpeg,image/png,image/webp"
        className="visualmente-oculto"
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            edicion.agregarFotosBanner(e.target.files);
          }
          e.target.value = '';
        }}
      />

      <div className="portada-editor-fotos">
        <div className="portada-editor-cabecera">
          <label htmlFor={id} className={`boton-edicion${total >= 10 ? ' boton-edicion--deshabilitado' : ''}`}>
            {total === 0 ? 'Subir imagen de portada' : total >= 10 ? 'Límite de 10 fotos alcanzado' : 'Subir más fotos al banner'}
          </label>
        </div>

        <p role="status" aria-live="polite" className="visualmente-oculto">{estado}</p>

        {total > 0 && (
          <ul className="portada-editor-fotos-lista">
            {banners.map((foto, idx) => {
              const fotoKey = foto.id ?? idx;
              return (
                <li key={fotoKey} className="portada-editor-foto-item">
                  {/* La miniatura elige qué foto se ve y se edita (SCRUM-194) */}
                  <button type="button" className="portada-editor-elegir"
                    aria-label={`Editar textos de la foto ${idx + 1}`} aria-pressed={idx === edicion.fotoEditada}
                    onClick={() => edicion.seleccionarFoto(idx)}>
                    <img src={foto.imagen} alt="" className="portada-editor-miniatura" />
                  </button>
                  <span className="visualmente-oculto">Foto {idx + 1} de {total}</span>
                  <div className="portada-editor-acciones">
                    <button
                      ref={(el) => {
                        botones.current[`${fotoKey}:-1`] = el;
                      }}
                      type="button"
                      className="boton-edicion portada-editor-boton-flecha"
                      aria-label={`Mover foto ${idx + 1} hacia la izquierda`}
                      disabled={idx === 0}
                      onClick={() => mover(idx, -1)}
                    >
                      ←
                    </button>
                    <button
                      ref={(el) => {
                        botones.current[`${fotoKey}:1`] = el;
                      }}
                      type="button"
                      className="boton-edicion portada-editor-boton-flecha"
                      aria-label={`Mover foto ${idx + 1} hacia la derecha`}
                      disabled={idx === total - 1}
                      onClick={() => mover(idx, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="boton-edicion portada-editor-boton-quitar"
                      aria-label={`Quitar foto ${idx + 1} del banner`}
                      onClick={() => {
                        edicion.eliminarFotoBanner(idx);
                        setEstado(`Foto ${idx + 1} eliminada. Quedan ${total - 1} foto(s).`);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <span id={`${id}-error`} className="selector-imagen-error" role="alert">{error}</span>}
    </div>
  );
}
