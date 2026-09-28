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

  // Aplicar la paleta guardada
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

          // Sincronizar la paleta con el backend
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

          // Datos de ejemplo mientras el backend no responde
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
          minHeight: "100vh",

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
            fontFamily: "sans-serif",
            textAlign: "center",
            padding: "20px",
          }}
        >
          <h1
            style={{
              color: "white",
              fontSize: "2.5rem",
              marginBottom: "1.5rem",
            }}
          >
            {configuracion?.texto_bienvenida ||
              "Bienvenido a nuestra tienda"}
          </h1>

          <button
            type="button"
            onClick={() =>
              navigate("/catalogo")
            }
            style={{
              padding: "12px 28px",
              fontSize: "1.1rem",
              fontWeight: "bold",
              color: "#ffffff",
              backgroundColor:
                "var(--color-primary, #2E7D32)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow:
                "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
              transition:
                "background-color 0.2s ease",
            }}
          >
            {configuracion?.texto_boton_ingreso ||
              "Ver Catálogo"}
          </button>
        </div>
      </main>
    </>
  );
}

export default LandingPage;
