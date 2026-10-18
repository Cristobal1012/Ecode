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
import { aplicarPaleta } from './constants/palettes';
import DetalleProducto from './pages/DetalleProducto';
import SeguimientoEnvio from './pages/SeguimientoEnvio';
import HistorialPedidos from './pages/HistorialPedidos'; // NUEVO: Importamos el componente de historial
import MisDirecciones from './components/MisDirecciones'; // Ajusta la ruta a donde guardaste el archivo
import PagoExitoso from './components/PagoExitoso';
import PagoCancelado from './components/PagoCancelado'; // Ajusta la ruta a donde guardaste el archivo
import PedidoRecibido from './components/PedidoRecibido';
import Footer from './components/footer';
import PaginaLegal from './pages/PaginaLegal';
import TrackingScripts from './components/TrackingScripts';
import CookieBanner from './components/CookieBanner';
import useCookieConsent from './hooks/useCookieConsent';
import Header from './components/header/header';

const applyPaletteToRoot = aplicarPaleta;

// Componente para manejar la vista de autenticación (Login / Registro con Google SSO)
function AuthPage({ googleHabilitado }) {
  const [showLogin, setShowLogin] = useState(true);

  return (
    <>
      <Header />
      <main className="auth-main">
        {showLogin ? (
          <Login onSwitchToRegister={() => setShowLogin(false)} googleHabilitado={googleHabilitado} />
        ) : (
          <Register onSwitchToLogin={() => setShowLogin(true)} />
        )}
      </main>
    </>
  );
}

function App() {
  const {
    consent, isBannerOpen, storageError,
    acceptCookies, rejectCookies, openPreferences, closePreferences,
  } = useCookieConsent();
  // RN-04: lo informa el backend (GOOGLE_CLIENT_ID del .env); vacío = la tienda no ofrece Google
  const [googleClientId, setGoogleClientId] = useState('');
  const [trackingIds, setTrackingIds] = useState({googleAnalyticsId: '',metaPixelId: '',});
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
        setGoogleClientId(config?.google_client_id || '');
        setTrackingIds({
        googleAnalyticsId: config?.google_analytics_id || '', metaPixelId: config?.meta_pixel_id || '',});
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
    <BrowserRouter>
      <TrackingScripts
        googleAnalyticsId={trackingIds.googleAnalyticsId}
        metaPixelId={trackingIds.metaPixelId}
        consent={consent}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1 }}>
          <Routes>
            {/* Vistas públicas */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/seguimiento" element={<SeguimientoEnvio />} />
            <Route path="/variantes" element={<VariantSelector />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/catalogo/producto/:id" element={<DetalleProducto />} />
            <Route path="/mis-direcciones" element={<MisDirecciones />} />
            <Route path="/pago-exitoso" element={<PagoExitoso />} />
            <Route path="/pedido-recibido" element={<PedidoRecibido />} />
            <Route path="/pago-cancelado" element={<PagoCancelado />} />
            <Route path="/pago-rechazado" element={<PagoCancelado />} />
            {/* Pantalla de login y registro */}
            {/* El script de Google se carga solo aquí y solo si la tienda ofrece Google (RN-04) */}
            <Route path="/login" element={googleClientId ? (
              <GoogleOAuthProvider clientId={googleClientId}>
                <AuthPage googleHabilitado />
              </GoogleOAuthProvider>
            ) : <AuthPage googleHabilitado={false} />} />

            {/* Vista pública para desplegar páginas legales individuales (RF-03.5) */}
            <Route path="/legal/:tipo" element={<PaginaLegal />} />

            {/* NUEVO: Ruta protegida genérica (solo requiere estar logueado como cliente) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/mis-pedidos" element={<HistorialPedidos />} />
            </Route>

            {/* Ruta protegida para usuarios con rol ADMIN */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Routes>
        </div>
        
        {/* Footer inyectado dinámicamente en toda la aplicación */}
        <Footer onOpenCookiePreferences={openPreferences} />
        <CookieBanner
          consent={consent}
          isOpen={isBannerOpen}
          storageError={storageError}
          onAccept={acceptCookies}
          onReject={rejectCookies}
          onClose={closePreferences}
        />
      </div>
    </BrowserRouter>
  );
}

export default App;
