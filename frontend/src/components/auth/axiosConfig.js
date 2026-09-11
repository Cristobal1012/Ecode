import axios from 'axios';


// Esta es una url base, despues cambiar.
const clienteAxios = axios.create({
    baseURL: 'http://localhost:8000/api/', 
    headers: {
        'Content-Type': 'application/json'
    }
});

// El Interceptor
clienteAxios.interceptors.response.use(
    (response) => {
        
        // lo guardamos automáticamente en el navegador de forma segura.
        if (response.data && response.data.access) {
            localStorage.setItem('token', response.data.access);
            console.log("Token JWT interceptado y guardado con éxito.");
        }
        return response;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default clienteAxios;