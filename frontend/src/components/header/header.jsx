import { Link, useNavigate } from "react-router-dom";
import "./header.css";
import logo from "./logoU.png";

function Header() {
  const navigate = useNavigate();
  
  // Leemos si hay un usuario activo buscando el token en el almacenamiento
  const token = localStorage.getItem("access_token");
  const rol = localStorage.getItem("rol");

  const handleLogout = () => {
    // 1. Limpiamos todos los rastros de la sesión
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("rol");
    
    // 2. Redirigimos al inicio
    navigate("/");
  };

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

        <nav className="header-nav">
          <Link to="/">Inicio</Link>
          <Link to="/catalogo">Catálogo</Link>
          <Link to="/contacto">Contacto</Link>

          {/* RENDERIZADO CONDICIONAL DE AUTENTICACIÓN */}
          {!token ? (
            // Si NO hay token, mostramos Iniciar Sesión
            <Link to="/login">Iniciar sesión</Link>
          ) : (
            // Si SÍ hay token, mostramos las opciones del usuario logueado
            <>
              {/* Si es ADMIN, le damos un atajo rápido a su panel */}
              {rol === 'ADMIN' && (
                <Link to="/admin">Panel admin</Link>
              )}
              
              {/* Usamos una etiqueta <a> para heredar el CSS exacto de los otros botones */}
              <a 
                href="#"
                onClick={(e) => {
                  e.preventDefault(); // Evita que la página salte hacia arriba
                  handleLogout();
                }}
              >
                Cerrar sesión
              </a>
            </>
          )}
        </nav>

      </div>
    </header>
  );
}

export default Header;