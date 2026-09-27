import { useState } from 'react';
import clienteAxios from './axiosConfig';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';

export default function Login({ onSwitchToRegister }) {
    const navigate = useNavigate();
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
        try {
            // 1. Obtenemos los tokens y el interceptor los guarda
            await clienteAxios.post('usuarios/token/', formData);
            
            // 2. Inmediatamente consultamos el rol del usuario
            const respuestaPerfil = await clienteAxios.get('usuarios/me/');
            const rolUsuario = respuestaPerfil.data.rol;

            alert("¡Login exitoso!");

            // 3. Redirección bifurcada según el rol
            if (rolUsuario === 'ADMIN') {
                navigate('/admin');
            } else {
                navigate('/catalogo');
            }

        } catch (error) {
            console.error("Axios interceptó un error:", error);
            alert("Error al iniciar sesión. Verifica tus credenciales.");
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        const googleToken = credentialResponse.credential;
        
        try {
            // Ajustar ruta ('google-login/') según el backend
            await clienteAxios.post('google-login/', { token: googleToken });
            
            // Consultamos el perfil para saber a dónde mandarlo
            const respuestaPerfil = await clienteAxios.get('usuarios/me/');
            const rolUsuario = respuestaPerfil.data.rol;

            alert("¡Inicio de sesión con Google exitoso!");
            
            if (rolUsuario === 'ADMIN') {
                navigate('/admin');
            } else {
                navigate('/catalogo');
            }
        } catch (error) {
            console.error("Axios interceptó un error con Google:", error);
            alert("No se pudo completar el acceso con Google.");
        }
    };

    const handleGoogleError = () => {
        console.error("Error al iniciar sesión con Google");
        alert("No se pudo completar el acceso con Google.");
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

            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                />
            </div>

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