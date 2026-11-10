import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { botonDeFoto, textoBotonCatalogo } from '../../utils/menuPrincipal';
import { PORTADA_POR_DEFECTO, TEXTOS_POR_DEFECTO } from './textosPorDefecto';
import { CampoEditable, EditorFotosBanner } from './ControlesEdicion';
import EditorTextosFoto from './EditorTextosFoto';

// RF-01.1, SCRUM-194: portada de la landing con banner en carrusel de fundido suave y campos fijos que
// edita el admin (antetítulo, título, texto, botón y fotos del carrusel).
// Con 2+ fotos cambian solas con fundido y botón de pausa (WCAG 2.2.2). Con 1 foto queda fija.
// El botón toma el nombre del catálogo (Ver <nombre del catálogo>); la foto prioriza la subida sobre banner_url.
// Las fotos no son clickeables y el velo garantiza contraste AA sobre todas las fotos.
export default function Portada({ configuracion, edicion }) {
  const listaFotos = (configuracion.banners && configuracion.banners.length > 0)
    ? configuracion.banners
    : (configuracion.banner || configuracion.banner_url?.trim()
        ? [{ id: 'default', imagen: configuracion.banner || configuracion.banner_url.trim() }]
        : [{ id: 'default', imagen: PORTADA_POR_DEFECTO }]);

  const editando = Boolean(edicion?.editando);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  // WCAG 2.2.2: mientras el mouse o el foco están sobre los textos o el botón, la foto no cambia
  const [enUso, setEnUso] = useState(false);

  const totalFotos = listaFotos.length;
  // En el modo edición se ve la foto que el admin está editando
  const editandoFotos = editando && edicion.banners?.length > 0;
  const indiceSeguro = editandoFotos ? edicion.fotoEditada : totalFotos > 0 ? indiceActivo % totalFotos : 0;
  const imagenActual = listaFotos[indiceSeguro]?.imagen || PORTADA_POR_DEFECTO;

  // Textos y botón de la foto que se ve; sin fotos propias, los generales de la portada con el botón al catálogo
  const fotoActual = listaFotos[indiceSeguro];
  const textos = fotoActual?.titulo ? fotoActual : {
    antetitulo: configuracion.subtitulo_bienvenida, titulo: configuracion.texto_bienvenida,
    texto: configuracion.texto_landing, destino: 'CATALOGO',
  };
  const boton = botonDeFoto(configuracion, textos.destino);

  // Rendimiento (Point 12): Carga solo la diapositiva activa y precarga la siguiente, evitando descargar todas de golpe
  const [fotosCargadas, setFotosCargadas] = useState(() => new Set([0, 1]));

  useEffect(() => {
    if (totalFotos <= 1 || pausado || enUso || editando) return undefined;
    const intervalo = setInterval(() => {
      setIndiceActivo((actual) => {
        const siguiente = (actual + 1) % totalFotos;
        const subsiguiente = (siguiente + 1) % totalFotos;
        setFotosCargadas((cargadas) => {
          if (cargadas.has(siguiente) && cargadas.has(subsiguiente)) return cargadas;
          const nuevo = new Set(cargadas);
          nuevo.add(siguiente);
          nuevo.add(subsiguiente);
          return nuevo;
        });
        return siguiente;
      });
    }, 5000);
    return () => clearInterval(intervalo);
  }, [totalFotos, pausado, enUso, editando]);

  const textoBoton = textoBotonCatalogo(configuracion);


  return (
    <section className={`portada${editando ? ' portada--editando' : ''}`} aria-labelledby="portada-titulo"
      style={{ backgroundImage: `url("${imagenActual}")` }}>
      {/* Carrusel de diapositivas con fundido suave (no clickeables) */}
      <div className="portada-carrusel" aria-hidden="true">
        {listaFotos.map((foto, index) => {
          const debeCargar = fotosCargadas.has(index) || editando;
          return (
            <div
              key={foto.id ?? index}
              className={`portada-diapositiva ${index === indiceSeguro ? 'portada-diapositiva--activa' : ''}`}
              style={debeCargar ? { backgroundImage: `url("${foto.imagen}")` } : undefined}
            />
          );
        })}
      </div>

      <div className="portada-velo" aria-hidden="true" />

      {editando && (
        <div className="contenedor portada-controles">
          <EditorFotosBanner banners={edicion?.banners || listaFotos} edicion={edicion} claro />
        </div>
      )}

      {/* Botón visible para pausar y reanudar con 2+ fotos (WCAG 2.2.2) */}
      {totalFotos >= 2 && !editando && (
        <button
          type="button"
          className="portada-boton-pausa"
          onClick={() => setPausado((p) => !p)}
          aria-label={pausado ? 'Reanudar carrusel' : 'Pausar carrusel'}
        >
          <span aria-hidden="true">{pausado ? '▶' : '⏸'}</span>
          <span>{pausado ? 'Reanudar carrusel' : 'Pausar carrusel'}</span>
        </button>
      )}

      <div className="contenedor portada-contenido"
        onMouseEnter={() => setEnUso(true)} onMouseLeave={() => setEnUso(false)}
        onFocus={() => setEnUso(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEnUso(false); }}>
        {editandoFotos ? (
          <EditorTextosFoto configuracion={configuracion} edicion={edicion} />
        ) : editando ? (
          <>
            <CampoEditable campo="subtitulo_bienvenida" edicion={edicion} claro ancho="campo-ancho-medio"
              className="antetitulo portada-antetitulo" />
            <h1 id="portada-titulo" className="visualmente-oculto">{configuracion.texto_bienvenida}</h1>
            <CampoEditable campo="texto_bienvenida" edicion={edicion} claro multilinea ancho="campo-ancho-titulo"
              className="portada-titulo portada-titulo--campo" />
            <CampoEditable campo="texto_landing" edicion={edicion} claro multilinea filas={3}
              ancho="campo-ancho-medio" className="portada-texto" />
            <span className="boton boton-primario portada-boton">{textoBoton}</span>
          </>
        ) : (
          <>
            {textos.antetitulo && (
              <span className="antetitulo portada-antetitulo">{textos.antetitulo}</span>
            )}
            <h1 id="portada-titulo" className="portada-titulo">
              {textos.titulo || TEXTOS_POR_DEFECTO.texto_bienvenida}
            </h1>
            {textos.texto && <p className="portada-texto">{textos.texto}</p>}
            {boton && (
              <Link to={boton.to} className="boton boton-primario portada-boton">
                {boton.texto}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}
