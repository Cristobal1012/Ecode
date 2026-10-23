import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import clienteAxios from "../components/auth/axiosConfig";
import Header from "../components/header/header";
import Portada from "../components/landing/Portada";
import SeccionProductos from "../components/landing/SeccionProductos";
import SeccionNosotros from "../components/landing/SeccionNosotros";
import SeccionInstagram from "../components/landing/SeccionInstagram";
import BarraEdicion from "../components/landing/BarraEdicion";
import useConfiguracionTienda from "../hooks/useConfiguracionTienda";
import useEdicionLanding from "../hooks/useEdicionLanding";
import "../components/landing/landing.css";

const NOTA_PRODUCTOS = "Esta sección se llena sola con tus productos publicados.";

// RF-01.1: la raíz del dominio muestra la landing (nunca el catálogo directo). El admin la edita en su mismo
// lugar (modo edición); los productos salen de la vitrina (más vendidos y últimos agregados).
function LandingPage() {
  const configuracion = useConfiguracionTienda();
  const edicion = useEdicionLanding(configuracion);
  // null mientras carga: así se sabe cuándo ya están dibujadas las secciones de productos
  const [vitrina, setVitrina] = useState(null);
  const { hash } = useLocation();
  const [parametros, setParametros] = useSearchParams();
  // El rol solo decide si se ofrece el botón; quien de verdad autoriza los cambios es el backend
  const esAdmin = localStorage.getItem("rol") === "ADMIN";

  useEffect(() => {
    clienteAxios.get("catalogo/vitrina/")
      .then(({ data }) => setVitrina(data))
      .catch((error) => {
        console.error("No se pudieron cargar los productos de la portada:", error);
        setVitrina({ mas_vendidos: [], recientes: [] });
      });
  }, []);

  // El enlace "Nosotros" del header lleva a /#nosotros. Se baja cuando ya está todo lo de arriba (portada y
  // productos); si no, el contenido que llega después corre la sección
  useEffect(() => {
    if (!hash || !configuracion || !vitrina) return;
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, configuracion, vitrina]);

  // El panel abre la landing directo en modo edición con /?editar=1. Se abre una sola vez, en el render (no en
  // un efecto), apenas llega la configuración
  const [abrirEdicion, setAbrirEdicion] = useState(() => parametros.get("editar") === "1");
  if (abrirEdicion && configuracion) {
    setAbrirEdicion(false);
    if (esAdmin) edicion.iniciar();
  }

  // Se quita ?editar=1 de la URL, para que recargar la página no vuelva a abrir el modo edición
  useEffect(() => {
    if (parametros.has("editar")) setParametros({}, { replace: true });
  }, [parametros, setParametros]);

  // Con cambios sin guardar se avisa antes de cerrar la pestaña o de seguir un enlace
  useEffect(() => {
    if (!edicion.hayCambios) return;
    const alSalir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const alHacerClic = (e) => {
      const enlace = e.target.closest?.("a[href]");
      if (enlace && !window.confirm("Tienes cambios sin guardar en la página de inicio. ¿Salir y descartarlos?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", alSalir);
    document.addEventListener("click", alHacerClic, true);
    return () => {
      window.removeEventListener("beforeunload", alSalir);
      document.removeEventListener("click", alHacerClic, true);
    };
  }, [edicion.hayCambios]);

  const vista = edicion.vista;

  return (
    <>
      <Header vistaPrevia={edicion.editando ? { nombre_tienda: vista.nombre_tienda, logo: vista.logo } : undefined} />
      <main tabIndex={-1} id="contenido" className={edicion.editando ? "landing--editando" : undefined}>
        {configuracion ? (
          <>
            {edicion.editando && (
              <div className="contenedor landing-nombre-edicion">
                <CampoNombreTienda edicion={edicion} />
              </div>
            )}
            <Portada configuracion={vista} edicion={edicion} />
            <SeccionProductos id="mas-vendidos" antetitulo="Lo más elegido" titulo="Más vendidos"
              productos={vitrina?.mas_vendidos} alterna nota={edicion.editando ? NOTA_PRODUCTOS : undefined} />
            <SeccionProductos id="recientes" antetitulo="Recién llegados" titulo="Últimos agregados"
              productos={vitrina?.recientes} etiqueta="Nuevo"
              nota={edicion.editando ? NOTA_PRODUCTOS : undefined} />
            <SeccionNosotros configuracion={vista} edicion={edicion} />
            <SeccionInstagram configuracion={vista} edicion={edicion} />
          </>
        ) : (
          // Mientras llega la configuración se reserva el espacio de la portada (sin textos de ejemplo)
          <div className="portada" aria-busy="true">
            <p className="visualmente-oculto">Cargando la tienda...</p>
          </div>
        )}
      </main>

      {esAdmin && configuracion && (edicion.editando ? (
        <BarraEdicion edicion={edicion} />
      ) : (
        <button type="button" className="boton boton-primario boton-editar-pagina" onClick={edicion.iniciar}>
          Editar página
        </button>
      ))}
    </>
  );
}

// El nombre de la tienda se ve en el header y en la pestaña: en modo edición se cambia arriba de la portada
function CampoNombreTienda({ edicion }) {
  return (
    <label className="landing-nombre-campo">
      <span className="campo-editable-etiqueta">Nombre de la tienda</span>
      <input
        value={edicion.textos.nombre_tienda}
        maxLength={255}
        onChange={(e) => edicion.cambiarTexto("nombre_tienda", e.target.value)}
        aria-invalid={Boolean(edicion.errores.nombre_tienda)}
      />
    </label>
  );
}

export default LandingPage;
