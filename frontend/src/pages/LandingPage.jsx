import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import clienteAxios from "../components/auth/axiosConfig";
import Header from "../components/header/header";
import Portada from "../components/landing/Portada";
import SeccionProductos from "../components/landing/SeccionProductos";
import SeccionNosotros from "../components/landing/SeccionNosotros";
import useConfiguracionTienda from "../hooks/useConfiguracionTienda";
import "../components/landing/landing.css";

// RF-01.1: la raíz del dominio muestra la landing (nunca el catálogo directo). El admin edita sus textos e
// imágenes; los productos salen de la vitrina (más vendidos y últimos agregados).
function LandingPage() {
  const configuracion = useConfiguracionTienda();
  // null mientras carga: así se sabe cuándo ya están dibujadas las secciones de productos
  const [vitrina, setVitrina] = useState(null);
  const { hash } = useLocation();

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

  return (
    <>
      <Header />
      <main id="contenido">
        {configuracion ? (
          <>
            <Portada configuracion={configuracion} />
            <SeccionProductos id="mas-vendidos" antetitulo="Lo más elegido" titulo="Más vendidos"
              productos={vitrina?.mas_vendidos} alterna />
            <SeccionProductos id="recientes" antetitulo="Recién llegados" titulo="Últimos agregados"
              productos={vitrina?.recientes} etiqueta="Nuevo" />
            <SeccionNosotros configuracion={configuracion} />
          </>
        ) : (
          // Mientras llega la configuración se reserva el espacio de la portada (sin textos de ejemplo)
          <div className="portada" aria-busy="true">
            <p className="visualmente-oculto">Cargando la tienda...</p>
          </div>
        )}
      </main>
    </>
  );
}

export default LandingPage;
