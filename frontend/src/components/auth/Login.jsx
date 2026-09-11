import { useState } from 'react';
import clienteAxios from './axiosConfig';

export default function Login({ onSwitchToRegister }) {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Simulación para cuando este configurado el backend.
        try {
            console.log("Enviando petición a la ruta: http://localhost:8000/api/login/");
            
            const respuesta = await clienteAxios.post('login/', formData);
            console.log("Respuesta del servidor:", respuesta.data);
            alert("¡Login exitoso!");
        } catch (error) {
            // Como el backend no está listo, la petición caerá aquí. 
            console.error("Axios interceptó un error:", error);
            alert("Axios disparó la petición, pero el servidor no respondió (esperando al backend).");
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2 style={{ textAlign: 'center' }}>Iniciar Sesión</h2>
            
            
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label>Correo Electrónico:</label><br/>
                    <input 
                        type="email" 
                        name="email"
                        value={formData.email} 
                        onChange={handleChange} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                <div style={{ marginBottom: '15px' }}>
                    <label>Contraseña:</label><br/>
                    <input 
                        type="password" 
                        name="password"
                        value={formData.password} 
                        onChange={handleChange} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                <button type="submit" style={{ width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Entrar
                </button>
            </form>

            
            <div style={{ margin: '20px 0', textAlign: 'center', color: '#888', fontSize: '14px' }}>
                O ingresa con
            </div>

            
            <button 
                type="button" 
                onClick={() => alert("Aquí irá el botón oficial de Google Identity")}
                style={{ width: '100%', padding: '10px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
                Continuar con Google
            </button>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button 
                    onClick={onSwitchToRegister}
                    style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    ¿No tienes cuenta? Regístrate aquí
                </button>
            </div>

        </div>
    );
}