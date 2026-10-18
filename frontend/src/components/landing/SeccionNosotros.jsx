import { TEXTOS_POR_DEFECTO } from './textosPorDefecto';

// Sección "Nosotros" de la landing: foto a un lado y el texto del emprendedor al otro. Sin texto no se muestra.
export default function SeccionNosotros({ configuracion }) {
  if (!configuracion.nosotros_texto) return null;
  const imagen = configuracion.nosotros_imagen;

  return (
    <section id="nosotros" className={`seccion-landing nosotros${imagen ? '' : ' nosotros--sin-imagen'}`}
      aria-labelledby="nosotros-titulo">
      <div className="contenedor nosotros-contenido">
        {imagen && (
          <div className="nosotros-imagen">
            <img src={imagen} alt="" loading="lazy" />
          </div>
        )}
        <div className="nosotros-texto">
          <span className="antetitulo">Nosotros</span>
          <h2 id="nosotros-titulo">{configuracion.nosotros_titulo || TEXTOS_POR_DEFECTO.nosotros_titulo}</h2>
          {/* Los saltos de línea que escribe el admin se respetan */}
          <p className="texto-secundario nosotros-parrafo">{configuracion.nosotros_texto}</p>
        </div>
      </div>
    </section>
  );
}
