import { useState } from 'react';
import Login from './components/auth/Login';
import Register from './components/auth/Register';

function App() {

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

export default App;