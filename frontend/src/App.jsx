import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';

import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Checkout from './components/Checkout';
import ProtectedRoute from './components/ProtectedRoute';
import Catalogo from './pages/Catalogo';

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
  // Client ID temporal para Google OAuth
  const GOOGLE_CLIENT_ID = "tu-client-id-temporal.apps.googleusercontent.com";

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          {/* Página pública */}
          <Route path="/" element={<Checkout />} />

          {/* Pantalla de login y registro */}
          <Route path="/login" element={<AuthPage />} />

          {/* Catálogo con los filtros dinámicos*/}
          <Route path="/catalogo" element={<Catalogo />} />

          {/* Ruta protegida para ADMIN */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route
              path="/admin"
              element={<h1>Panel de Administración</h1>}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

export default App;