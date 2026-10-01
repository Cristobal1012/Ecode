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
            alt="Logo"
          />
        </div>

        {/* Añadí un estilo inline muy ligero (flex y alignItems) para asegurar 
            que el nuevo botón quede bien centrado verticalmente con tus otros links */}
        <nav className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/">Inicio</Link>
          <Link to="/catalogo">Catálogo</Link>
          <Link to="/contacto">Contacto</Link>

          {/* Si es ADMIN, le damos un atajo rápido a su panel */}
          {rol === 'ADMIN' && (
            <Link to="/admin">Panel admin</Link>
          )}

          {/* Agrupamos el Menú de Usuario y el Carrito de Compras */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '8px' }}>
            <MenuUsuario />
            <CarritoCompras />
          </div>
        </nav>

      </div>
    </header>
  );
}

export default Header;