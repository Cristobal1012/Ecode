import { Link } from "react-router-dom";
import "./header.css";
import logo from "./logoU.png";
import MenuUsuario from "../MenuUsuario";
import CarritoCompras from "../CarritoCompras"; 

function Header() {
  // Solo conservamos el rol para saber si mostramos el atajo de admin
  const rol = localStorage.getItem("rol");

  return (
    <header className="header">
      <div className="header-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 'none', padding: '7px 3rem', boxSizing: 'border-box' }}>

        
        <div className="header-logo" style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '1rem' }}>
          <img 
            className="header-logo-img" 
            src={logo} 
            alt="Logo" 
            style={{ height: '60px', width: 'auto', objectFit: 'contain' }} 
          />
        </div>

        
        <nav style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '3.5rem' }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#333', fontWeight: '500' }}>Inicio</Link>
          <Link to="/catalogo" style={{ textDecoration: 'none', color: '#333', fontWeight: '500' }}>Catálogo</Link>
          <Link to="/nosotros" style={{ textDecoration: 'none', color: '#333', fontWeight: '500' }}>Nosotros</Link>

          {rol === 'ADMIN' && (
            <Link to="/admin" style={{ textDecoration: 'none', color: '#333', fontWeight: '500' }}>Panel admin</Link>
          )}
        </nav>

        
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px' }}>
          <MenuUsuario />
          <CarritoCompras />
        </div>

      </div>
    </header>
  );
}

export default Header;