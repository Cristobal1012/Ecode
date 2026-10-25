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

  return (
    <header className="header">
      <div className="header-content">
        {/* RN-01: el logo de la Universidad va siempre junto al del negocio; no hay opción para ocultarlo */}
        <div className="header-marcas">
          <Link to="/" className="header-marca-negocio" aria-label={`${nombreTienda}, ir al inicio`}>
            {configuracion?.logo ? (
              <img className="header-logo-negocio" src={configuracion.logo} alt="" />
            ) : (
              <span className="header-nombre-tienda">{nombreTienda}</span>
            )}
          </Link>
          <span className="header-separador" aria-hidden="true" />
          <img
            className="header-logo-universidad"
            src={logoUniversidad}
            alt="Logo de la Universidad Autónoma"
          />
        </div>

        <nav className="header-nav" aria-label="Navegación de la tienda">
          <div className="header-links">
            <NavLink to="/" end>Inicio</NavLink>
            <NavLink to="/catalogo">Catálogo</NavLink>
            {/* Con el blog activo, "Nosotros" (o el nombre que eligió el admin) lleva al blog; si no, a la landing */}
            {configuracion?.blog_activo ? (
              <NavLink to="/blog">{configuracion.blog_nombre || 'Nosotros'}</NavLink>
            ) : configuracion?.nosotros_texto && <Link to="/#nosotros">Nosotros</Link>}
            {configuracion?.cotizaciones_activas && <NavLink to="/cotizar">Cotizar</NavLink>}

            {/* Si es ADMIN, le damos un atajo rápido a su panel */}
            {rol === 'ADMIN' && (
              <NavLink to="/admin">Panel admin</NavLink>
            )}
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
