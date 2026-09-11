import { useState } from 'react';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import { GoogleOAuthProvider } from '@react-oauth/google';

function App() {
  const [showLogin, setShowLogin] = useState(true);

  //Me falta el ID original de google.
  const GOOGLE_CLIENT_ID = "tu-client-id-temporal.apps.googleusercontent.com";

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div>
        {showLogin ? (
          <Login onSwitchToRegister={() => setShowLogin(false)} />
        ) : (
          <Register onSwitchToLogin={() => setShowLogin(true)} />
        )}
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;