import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import clienteAxios from "../components/auth/axiosConfig";
import Header from "../components/header/header";
import { PALETTES } from "../constants/palettes";

const DEFAULT_BANNER =
  "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D";

function LandingPage() {
  const navigate = useNavigate();

  const [configuracion, setConfiguracion] =
    useState(null);

  const [loading, setLoading] = useState(true);

  
  useEffect(() => {
    const savedPaletteId =
      Number(localStorage.getItem("ecommerce_palette")) ||
      1;

    const activePalette =
      PALETTES.find(
        (p) => p.id === savedPaletteId
      ) || PALETTES[0];

    if (activePalette) {
      const root = document.documentElement;

      root.style.setProperty(
        "--color-primary",
        activePalette.colors.primary
      );

      root.style.setProperty(
        "--color-secondary",
        activePalette.colors.secondary
      );

      root.style.setProperty(
        "--color-accent",
        activePalette.colors.accent
      );

      root.style.setProperty(
        "--color-background",
        activePalette.colors.background
      );

      root.style.setProperty(
        "--color-text",
        activePalette.colors.text
      );
    }
  }, []);

  useEffect(() => {
    const obtenerConfiguracion =
      async () => {
        try {
          const response = await clienteAxios.get(
            "configuracion/"
          );

          setConfiguracion(response.data);

          
          const paletaId =
            response.data?.paleta_id ||
            response.data?.paleta;

          if (paletaId) {
            const paletaBackend =
              PALETTES.find(
                (p) =>
                  p.id === Number(paletaId)
              );

            if (paletaBackend) {
              const root =
                document.documentElement;

              root.style.setProperty(
                "--color-primary",
                paletaBackend.colors.primary
              );

              root.style.setProperty(
                "--color-secondary",
                paletaBackend.colors.secondary
              );

              root.style.setProperty(
                "--color-accent",
                paletaBackend.colors.accent
              );

              root.style.setProperty(
                "--color-background",
                paletaBackend.colors.background
              );

              root.style.setProperty(
                "--color-text",
                paletaBackend.colors.text
              );

              localStorage.setItem(
                "ecommerce_palette",
                paletaBackend.id.toString()
              );
            }
          }
        } catch (error) {
          console.error(
            "Error al obtener la configuración:",
            error
          );

          
          setConfiguracion({
            texto_bienvenida:
              "Bienvenido a nuestra tienda",

            texto_boton_ingreso:
              "Ver Catálogo",

            banner_url: DEFAULT_BANNER,
          });
        } finally {
          setLoading(false);
        }
      };

    obtenerConfiguracion();
  }, []);

  if (loading) {
    return (
      <p
        style={{
          textAlign: "center",
          padding: "2rem",
        }}
      >
        Cargando...
      </p>
    );
  }

  const bannerFondo =
    configuracion?.banner_url?.trim()
      ? configuracion.banner_url
      : DEFAULT_BANNER;

  return (
    <>
      <Header />

      <main
        style={{
          height: "calc(100vh - 199px)",

          backgroundImage: `
            linear-gradient(
              rgba(0, 0, 0, 0.4),
              rgba(0, 0, 0, 0.4)
            ),
            url(${bannerFondo})
          `,

          backgroundSize: "cover",
          backgroundPosition: "center",

          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            textAlign: "center",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          <h1
            style={{
              fontFamily: "'Playfair Display', 'Georgia', serif", 
              color: "white",
              fontSize: "4rem", 
              fontWeight: "normal", 
              marginBottom: "2rem",
              textShadow: "2px 2px 8px rgba(0, 0, 0, 0.7)",
            }}
          >
            {configuracion?.texto_bienvenida || "Bienvenido a nuestra tienda"}
          </h1>

          <button
            type="button"
            onClick={() => navigate("/catalogo")}
            style={{
              padding: "16px 44px", 
              fontSize: "0.85rem",
              fontWeight: "600",
              letterSpacing: "3.5px", 
              textTransform: "uppercase",
              color: "#ffffff",
              
              
              backgroundColor: "rgba(255, 255, 255, 0.08)", 
              backdropFilter: "blur(5px)", 
              WebkitBackdropFilter: "blur(5px)", 
              border: "1px solid rgba(255, 255, 255, 0.25)", 
              
              
              borderRadius: "0",
              cursor: "pointer",
              boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.2)", 
              transition: "all 0.3s ease",
              display: "inline-flex",
              alignItems: "center",
              gap: "12px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.18)";
              e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.25)";
            }}
          >
            {configuracion?.texto_boton_ingreso || "Ver Catálogo"} 
            <span style={{ fontSize: "1.2rem", transform: "translateY(-1px)" }}>→</span>
          </button>
        </div>
      </main>
    </>
  );
}

export default LandingPage;
