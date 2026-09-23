import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clienteAxios from "../components/auth/axiosConfig";
import Header from "../components/header/header";

function LandingPage() {
  const navigate = useNavigate();
  const [configuracion, setConfiguracion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const obtenerConfiguracion = async () => {
      try {
        const response = await clienteAxios.get("/api/configuracion/");
        setConfiguracion(response.data);
      } catch (error) {
        console.error("Error al obtener la configuración:", error);

        // Datos de ejemplo mientras se termina el backend
        setConfiguracion({
          texto_bienvenida: "Bienvenido a nuestra tienda",
          texto_boton_ingreso: "Ver Catálogo",
          banner_url:
            "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
        });
      } finally {
        setLoading(false);
      }
    };

    obtenerConfiguracion();
  }, []);

  if (loading) {
    return <p>Cargando...</p>;
  }

  return (
    <>
      {/* ENCABEZADO */}
      <Header />

      {/* CONTENIDO PRINCIPAL */}
      <main
        style={{
          minHeight: "100vh",
          backgroundImage: configuracion?.banner_url
            ? `url(${configuracion.banner_url})`
            : "none",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "sans-serif",
            textAlign: "center",
            padding: "20px",
          }}
        >
          <h1 style={{ color: "white" }}>
            {configuracion?.texto_bienvenida}
          </h1>

          <button
            type="button"
            onClick={() => navigate("/catalogo")}
          >
            {configuracion?.texto_boton_ingreso || "Error!"}
          </button>
        </div>
      </main>
    </>
  );
}

export default LandingPage;