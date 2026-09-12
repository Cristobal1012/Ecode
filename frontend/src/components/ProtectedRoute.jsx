import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import axios from 'axios';

export default function ProtectedRoute({ allowedRoles }) {
    const [cargando, setCargando] = useState(true);
    const [autenticado, setAutenticado] = useState(false);
    const [rol, setRol] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');

        if (!token) {
            setCargando(false);
            return;
        }

        axios.get('http://127.0.0.1:8000/usuarios/me/', {
            headers: {
                Authorization: `Token ${token}`,
            },
        })
        .then((respuesta) => {
            setAutenticado(true);
            setRol(respuesta.data.rol);

            // Guardamos el rol actualizado
            localStorage.setItem('rol', respuesta.data.rol);
        })
        .catch(() => {
            // Token invalido o sesión no valida
            localStorage.removeItem('token');
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
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}