import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Checkout from './components/Checkout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';

function App() {
    return (
        <BrowserRouter>
            <Routes>

                {/* Página pública */}
                <Route path="/" element={<Checkout />} />

                {/* Pantalla de login */}
                <Route path="/login" element={<Login />} />

                {/* Ejemplo de ruta privada para ADMIN */}
                <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
                    <Route
                        path="/admin"
                        element={<h1>Panel de Administración</h1>}
                    />
                </Route>

            </Routes>
        </BrowserRouter>
    );
}

export default App;