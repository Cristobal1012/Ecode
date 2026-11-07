import { Link, NavLink } from "react-router-dom";
import "./header.css";
import logoUniversidad from "./logoU.png";
import MenuUsuario from "../MenuUsuario";
import CarritoCompras from "../CarritoCompras";
import useConfiguracionTienda from "../../hooks/useConfiguracionTienda";

// vistaPrevia: el modo edición de la landing muestra aquí el nombre y el logo antes de guardarlos
function Header({ vistaPrevia }) {
  // Solo conservamos el rol para saber si mostramos el atajo de admin
  const rol = localStorage.getItem("rol");
  const publicada = useConfiguracionTienda();
  const configuracion = vistaPrevia ? { ...publicada, ...vistaPrevia } : publicada;
  const nombreTienda = configuracion?.nombre_tienda || "Tienda";
  // RN-01: si el admin lo llevó al pie de página, se muestra allá, más grande (footer.jsx)
  const universidadEnHeader = configuracion?.ubicacion_logo_universidad !== "FOOTER";

  return (
    <header className="header">
      <div className="header-content">
        {/* RN-01: el logo de la Universidad va aquí junto al del negocio, o en el footer si el admin lo eligió; nunca se oculta */}
        <div className="header-marcas">
          <Link
            to="/"
            className="header-marca-negocio"
            aria-label={`${nombreTienda}, ir al inicio`}
          >
            {configuracion?.logo ? (
              <img
                className="header-logo-negocio"
                src={configuracion.logo}
                alt=""
              />
            ) : (
              <span className="header-nombre-tienda">{nombreTienda}</span>
            )}
          </Link>
          {universidadEnHeader && (
            <>
              <span className="header-separador" aria-hidden="true" />
              <img
                className="header-logo-universidad"
                src={logoUniversidad}
                alt="Logo de la Universidad Autónoma"
              />
            </>
          )}
        </div>

        <nav className="header-nav" aria-label="Navegación de la tienda">
          <div className="header-links">
            <NavLink to="/" end>
              Inicio
            </NavLink>
            <NavLink to="/catalogo">Catálogo</NavLink>
            {/* Con el blog activo, "Nosotros" (o el nombre que eligió el admin) lleva al blog; si no, a la landing */}
            {/* El blog mantiene su enlace independiente de la página Sobre mí */}
            {configuracion?.blog_activo ? (
              <NavLink to="/blog">
                {configuracion.blog_nombre || "Nosotros"}
              </NavLink>
            ) : (
              configuracion?.nosotros_texto && (
                <Link to="/#nosotros">Nosotros</Link>
              )
            )}

            {/* Página Sobre mí: solo aparece cuando el emprendedor la activa */}
            {configuracion?.sobre_mi_activo && (
              <NavLink to="/sobre-mi">
                {configuracion.sobre_mi_nombre || "Sobre mí"}
              </NavLink>
            )}
            {configuracion?.cotizaciones_activas && (
              <NavLink to="/cotizar">Cotizar</NavLink>
            )}

            {/* Si es ADMIN, le damos un atajo rápido a su panel */}
            {rol === "ADMIN" && <NavLink to="/admin">Panel admin</NavLink>}
          </div>

          {/* Agrupamos el Menú de Usuario y el Carrito de Compras */}
          <div className="header-actions">
            <MenuUsuario />
            <CarritoCompras />
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Header;
