import axios from 'axios';

// Agregamos /api/ a la base URL para que todas las peticiones apunten correctamente
const clienteAxios = axios.create({
    baseURL: 'http://localhost:8000/api/', 
    headers: {
        'Content-Type': 'application/json'
    }
});

// NUEVO: Interceptor de Peticiones (Inyecta el token)
clienteAxios.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// El Interceptor
clienteAxios.interceptors.response.use(
    (response) => {
        // Corregido: usamos 'response.data' en todas las líneas, no 'respuesta'
        if (response.data && response.data.access) {
            localStorage.setItem('access_token', response.data.access);
            localStorage.setItem('refresh_token', response.data.refresh);
            console.log("Token JWT interceptado y guardado con éxito.");
        }
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default clienteAxios;