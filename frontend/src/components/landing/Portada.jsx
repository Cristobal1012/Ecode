import { Link } from 'react-router-dom';
import { PORTADA_POR_DEFECTO, TEXTOS_POR_DEFECTO } from './textosPorDefecto';
import { CampoEditable, SelectorImagen } from './ControlesEdicion';

// RF-01.1: portada de la landing con los campos fijos que edita el admin (antetítulo, título, texto,
// imagen y botón). La foto prioriza la subida desde el panel sobre la URL antigua (banner_url).
// Con `edicion` (modo edición del admin) los textos se vuelven campos en su mismo lugar y estilo.
export default function Portada({ configuracion, edicion }) {
  const imagen = configuracion.banner || configuracion.banner_url?.trim() || PORTADA_POR_DEFECTO;
  const editando = Boolean(edicion?.editando);

  return (
    <section className={`portada${editando ? ' portada--editando' : ''}`} aria-labelledby="portada-titulo"
      style={{ backgroundImage: `url("${imagen}")` }}>
      <div className="portada-velo" aria-hidden="true" />

      {editando && (
        <div className="contenedor portada-controles">
          <SelectorImagen campo="banner" nombre="imagen de portada" tieneImagen={Boolean(configuracion.banner)}
            edicion={edicion} claro />
        </div>
      )}

      <div className="contenedor portada-contenido">
        {editando ? (
          <>
            <CampoEditable campo="subtitulo_bienvenida" edicion={edicion} claro ancho="campo-ancho-medio"
              className="antetitulo portada-antetitulo" />
            <h1 id="portada-titulo" className="visualmente-oculto">{configuracion.texto_bienvenida}</h1>
            <CampoEditable campo="texto_bienvenida" edicion={edicion} claro multilinea ancho="campo-ancho-titulo"
              className="portada-titulo portada-titulo--campo" />
            <CampoEditable campo="texto_landing" edicion={edicion} claro multilinea filas={3}
              ancho="campo-ancho-medio" className="portada-texto" />
            <div className="boton boton-primario portada-boton portada-boton--campo">
              <CampoEditable campo="texto_boton_ingreso" edicion={edicion} claro className="portada-boton-campo" />
            </div>
          </>
        ) : (
          <>
            {configuracion.subtitulo_bienvenida && (
              <span className="antetitulo portada-antetitulo">{configuracion.subtitulo_bienvenida}</span>
            )}
            <h1 id="portada-titulo" className="portada-titulo">
              {configuracion.texto_bienvenida || TEXTOS_POR_DEFECTO.texto_bienvenida}
            </h1>
            {configuracion.texto_landing && <p className="portada-texto">{configuracion.texto_landing}</p>}
            <Link to="/catalogo" className="boton boton-primario portada-boton">
              {configuracion.texto_boton_ingreso || TEXTOS_POR_DEFECTO.texto_boton_ingreso}
              <span aria-hidden="true">→</span>
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
