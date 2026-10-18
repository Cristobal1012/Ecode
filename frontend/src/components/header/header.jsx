import { Link } from "react-router-dom";
import "./header.css";
import logo from "./logoU.png";
import MenuUsuario from "../MenuUsuario";
import CarritoCompras from "../CarritoCompras"; // NUEVA IMPORTACIÓN

function Header() {
  // Solo conservamos el rol para saber si mostramos el atajo de admin
  const rol = localStorage.getItem("rol");

  return (
    <header className="header">
      <div className="header-content">

        <div className="header-logo">
          <img
            className="header-logo-img"
            src={logo}
            alt="Logo de la Universidad Autónoma"
          />
        </div>

        <nav className="header-nav" aria-label="Navegación de la tienda">
          <div className="header-links">
            <Link to="/">Inicio</Link>
            <Link to="/catalogo">Catálogo</Link>
            <Link to="/contacto">Contacto</Link>

            {/* Si es ADMIN, le damos un atajo rápido a su panel */}
            {rol === 'ADMIN' && (
              <Link to="/admin">Panel admin</Link>
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
