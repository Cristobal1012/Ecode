import { Link } from 'react-router-dom';
import { PORTADA_POR_DEFECTO, TEXTOS_POR_DEFECTO } from './textosPorDefecto';

// RF-01.1: portada de la landing con los campos fijos que edita el admin (antetítulo, título, texto,
// imagen y botón). La foto prioriza la subida desde el panel sobre la URL antigua (banner_url).
export default function Portada({ configuracion }) {
  const imagen = configuracion.banner || configuracion.banner_url?.trim() || PORTADA_POR_DEFECTO;

  return (
    <section className="portada" aria-labelledby="portada-titulo" style={{ backgroundImage: `url("${imagen}")` }}>
      <div className="portada-velo" aria-hidden="true" />
      <div className="contenedor portada-contenido">
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
      </div>
    </section>
  );
}
