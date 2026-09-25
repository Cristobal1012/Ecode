import "./header.css";
import logo from "./logoU.png";

function Header() {
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
          <a href="/">Inicio</a>
          <a href="/catalogo">Catálogo</a>
          <a href="/contacto">Contacto</a>
        </nav>

      </div>
    </header>
  );
}

export default Header;