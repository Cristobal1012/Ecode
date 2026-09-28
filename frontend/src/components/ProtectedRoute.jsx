import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import clienteAxios from "./auth/axiosConfig";

export default function ProtectedRoute({ allowedRoles }) {
    const [cargando, setCargando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);
    const [rol, setRol] = useState(null);

    useEffect(() => {
        // Buscamos la llave correcta
        const token = localStorage.getItem('access_token');

        if (!token) {
            setCargando(false);
            return;
        }

        // Usamos la ruta relativa, clienteAxios pone el baseURL y el Header
        clienteAxios.get('usuarios/me/')
        .then((respuesta) => {
            setAutenticado(true);
            setRol(respuesta.data.rol);
            localStorage.setItem('rol', respuesta.data.rol);
        })
        .catch(() => {
            // Limpiamos todo el rastro si el token expiró o es inválido
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('rol');
            setAutenticado(false);
        })
        .finally(() => {
            setCargando(false);
        });
    }, []);

    if (cargando) {
        return <p>Verificando sesion...</p>;
    }

    if (!autenticado) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(rol)) {
        return <Navigate to="/login" replace />; // O a una página de "No Autorizado"
    }

    return <Outlet />;
}