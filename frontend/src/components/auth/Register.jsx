import { useState } from 'react';
import clienteAxios from './axiosConfig';

export default function Register({ onSwitchToLogin }) {
    const [formData, setFormData] = useState({
        nombre: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (formData.password !== formData.confirmPassword) {
            alert("Las contraseñas no coinciden");
            return;
        }

        try {
            console.log("Enviando petición a la ruta: http://localhost:8000/api/register/");
            
            
            const respuesta = await clienteAxios.post('register/', formData);
            
            console.log("Respuesta del servidor:", respuesta.data);
            alert("¡Registro exitoso!");
            
            //Si el registro es exitoso, lo enviamos de vuelta al Login automáticamente
            onSwitchToLogin(); 

        } catch (error) {
            // Capturamos la caída por la falta de backend
            console.error("Axios interceptó un error en el registro:", error);
            alert("Axios disparó la petición de registro, pero el servidor no respondió.");
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2 style={{ textAlign: 'center' }}>Crear Cuenta</h2>
            
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label>Nombre completo:</label><br/>
                    <input 
                        type="text" 
                        name="nombre"
                        value={formData.nombre} 
                        onChange={handleChange} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
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
                <div style={{ marginBottom: '15px' }}>
                    <label>Confirmar Contraseña:</label><br/>
                    <input 
                        type="password" 
                        name="confirmPassword"
                        value={formData.confirmPassword} 
                        onChange={handleChange} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                </div>
                <button type="submit" style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Registrarse
                </button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button 
                    onClick={onSwitchToLogin}
                    style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    ¿Ya tienes cuenta? Inicia sesión aquí
                </button>
            </div>
        </div>
    );
}