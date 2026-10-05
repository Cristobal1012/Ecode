import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import clienteAxios from './components/auth/axiosConfig';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Checkout from './components/Checkout';
import ProtectedRoute from './components/ProtectedRoute';
import VariantSelector from './components/VariantSelector';
import Catalogo from './pages/Catalogo';
import LandingPage from './pages/LandingPage';
import Admin from './pages/Admin';
import { PALETTES } from './constants/palettes';
import DetalleProducto from './pages/DetalleProducto';
import SeguimientoEnvio from './pages/SeguimientoEnvio';
import HistorialPedidos from './pages/HistorialPedidos'; // NUEVO: Importamos el componente de historial
import MisDirecciones from './components/MisDirecciones'; // Ajusta la ruta a donde guardaste el archivo
// Inyecta las variables CSS directamente en :root
const applyPaletteToRoot = (paletteId) => {
  const activePalette = PALETTES.find((p) => p.id === Number(paletteId)) || PALETTES[0];
  if (activePalette) {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', activePalette.colors.primary);
    root.style.setProperty('--color-secondary', activePalette.colors.secondary);
    root.style.setProperty('--color-accent', activePalette.colors.accent);
    root.style.setProperty('--color-background', activePalette.colors.background);
    root.style.setProperty('--color-text', activePalette.colors.text);
  }
};

// Componente para manejar la vista de autenticación (Login / Registro con Google SSO)
function AuthPage() {
  const [showLogin, setShowLogin] = useState(true);

  return (
    <div>
      {showLogin ? (
        <Login onSwitchToRegister={() => setShowLogin(false)} />
      ) : (
        <Register onSwitchToLogin={() => setShowLogin(true)} />
      )}
    </div>
  );
}

function App() {
  const GOOGLE_CLIENT_ID = "tu-client-id-temporal.apps.googleusercontent.com";

  useEffect(() => {
    // 1. Carga inicial instantánea desde localStorage
    const saved = localStorage.getItem('ecommerce_palette');
    const initialId = saved ? Number(saved) : 1;
    applyPaletteToRoot(initialId);

    // 2. Consulta a Django para sincronizar con la base de datos
    const syncTheme = async () => {
      try {
        const response = await clienteAxios.get('configuracion/');
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        if (config && config.tema_seleccionado !== undefined) {
          const serverId = Number(config.tema_seleccionado);
          localStorage.setItem('ecommerce_palette', serverId.toString());
          applyPaletteToRoot(serverId);
        }
      } catch (error) {
        console.error('Error al sincronizar tema global en App:', error);
      }
    };

    syncTheme();

    // 3. Listener para cambios en la misma pestaña (CustomEvent)
    const handleCustomEvent = (e) => {
      const id = e?.detail?.temaId || Number(localStorage.getItem('ecommerce_palette')) || 1;
      applyPaletteToRoot(id);
    };

    // 4. Listener para cambios entre pestañas separadas (StorageEvent nativo)
    const handleStorageEvent = (e) => {
      if (e.key === 'ecommerce_palette' && e.newValue) {
        applyPaletteToRoot(e.newValue);
      }
    };

    window.addEventListener('themeChanged', handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('themeChanged', handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          {/* Vistas públicas */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/seguimiento" element={<SeguimientoEnvio />} />
          <Route path="/variantes" element={<VariantSelector />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/catalogo/producto/:id" element={<DetalleProducto />} />
          <Route path="/mis-direcciones" element={<MisDirecciones />} />
          {/* Pantalla de login y registro */}
          <Route path="/login" element={<AuthPage />} />

          {/* NUEVO: Ruta protegida genérica (solo requiere estar logueado como cliente) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/mis-pedidos" element={<HistorialPedidos />} />
          </Route>

          {/* Ruta protegida para usuarios con rol ADMIN */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;