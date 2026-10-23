import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Checkout from './components/Checkout';
import ProtectedRoute from './components/ProtectedRoute';
import VariantSelector from './components/VariantSelector';
import Catalogo from './pages/Catalogo';
import LandingPage from './pages/LandingPage';
import Admin from './pages/Admin';
import { aplicarPaleta } from './constants/palettes';
import { aplicarTipografia, CLAVE_TIPOGRAFIA } from './constants/tipografias';
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
import AccesibilidadNavegacion from './components/AccesibilidadNavegacion';
import useConfiguracionTienda from './hooks/useConfiguracionTienda';
import { PORTADA_POR_DEFECTO } from './components/landing/textosPorDefecto';
import './components/auth/auth.css';

const applyPaletteToRoot = aplicarPaleta;

// Componente para manejar la vista de autenticación (Login / Registro con Google SSO)
function AuthPage({ googleHabilitado }) {
  const [showLogin, setShowLogin] = useState(true);
  // Aviso que deja el registro para el login ("Tu cuenta quedó creada...", con el correo ya escrito)
  const [avisoLogin, setAvisoLogin] = useState(null);
  // La misma portada de la landing acompaña al formulario (decorativa: el nombre ya está en el header)
  const configuracion = useConfiguracionTienda();
  const portada = configuracion?.banner || configuracion?.banner_url?.trim() || PORTADA_POR_DEFECTO;

  return (
    <>
      <Header />
      <main tabIndex={-1} id="contenido" className="auth-main">
        <div className="auth-imagen" aria-hidden="true" style={{ backgroundImage: `url("${portada}")` }}>
          {configuracion?.nombre_tienda && <span className="auth-imagen-nombre">{configuracion.nombre_tienda}</span>}
        </div>
        <div className="auth-contenido">
          {showLogin ? (
            <Login
              onSwitchToRegister={() => { setAvisoLogin(null); setShowLogin(false); }}
              googleHabilitado={googleHabilitado}
              aviso={avisoLogin}
            />
          ) : (
            <Register onSwitchToLogin={(aviso = null) => { setAvisoLogin(aviso); setShowLogin(true); }} />
          )}
        </div>
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
  const configuracion = useConfiguracionTienda();
  const googleClientId = configuracion?.google_client_id || '';
  useEffect(() => {
    if (configuracion?.tema_seleccionado !== undefined) {
      const serverId = Number(configuracion.tema_seleccionado);
      localStorage.setItem('ecommerce_palette', serverId.toString());
      applyPaletteToRoot(serverId);
    }
    if (configuracion?.tipografia_seleccionada !== undefined) {
      localStorage.setItem(CLAVE_TIPOGRAFIA, String(configuracion.tipografia_seleccionada));
      aplicarTipografia(configuracion.tipografia_seleccionada);
    }
  }, [configuracion]);
  useEffect(() => {
    // 1. Carga inicial instantánea desde localStorage
    const saved = localStorage.getItem('ecommerce_palette');
    const initialId = saved ? Number(saved) : 1;
    applyPaletteToRoot(initialId);

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
      <AccesibilidadNavegacion />
      <TrackingScripts
        googleAnalyticsId={configuracion?.google_analytics_id || ''}
        metaPixelId={configuracion?.meta_pixel_id || ''}
        consent={consent}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1 }}>
          <Routes>
            {/* Vistas públicas */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/seguimiento" element={<SeguimientoEnvio />} />
            <Route path="/variantes" element={<main id="contenido" tabIndex={-1} className="contenedor"><h1>Selección de variantes</h1><VariantSelector /></main>} />
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
