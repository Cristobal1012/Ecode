import { useState } from 'react';
import clienteAxios from './axiosConfig';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';

// googleHabilitado: la tienda configuró GOOGLE_CLIENT_ID (RN-04); si no, no se ofrece Google
export default function Login({ onSwitchToRegister, googleHabilitado = false }) {
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

    // Función para descargar el carrito guardado en la base de datos de Django al iniciar sesión
    const sincronizarCarrito = async () => {
        try {
            const respuesta = await clienteAxios.get('ventas/carrito/');
            const carritoData = Array.isArray(respuesta.data) ? respuesta.data : (respuesta.data.items || []);

            if (carritoData.length > 0) {
                const carritoFormateado = carritoData.map(item => ({
                    id: item.producto_id || item.id, 
                    sku: item.sku || item.variante_sku || item.id,
                    nombre: item.nombre || item.producto_nombre || 'Producto',
                    precio: Number(item.precio),
                    cantidad: Number(item.cantidad)
                }));
                
                // Guardamos en memoria local del navegador y actualizamos el header
                localStorage.setItem('carrito_local', JSON.stringify(carritoFormateado));
                window.dispatchEvent(new Event('carritoActualizado'));
            } else {
                // Si en Django el carrito está vacío, limpiamos por si acaso
                localStorage.removeItem('carrito_local');
                window.dispatchEvent(new Event('carritoActualizado'));
            }
        } catch (error) {
            console.error("No se pudo recuperar el carrito de la base de datos:", error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // 1. Obtenemos los tokens y el interceptor los guarda
            await clienteAxios.post('usuarios/token/', formData);
            
            // 2. Consultamos el rol del usuario
            const respuestaPerfil = await clienteAxios.get('usuarios/me/');
            const rolUsuario = respuestaPerfil.data.rol;

            // 3. Descargamos el carrito asociado a este usuario desde Django
            await sincronizarCarrito();

            alert("¡Login exitoso!");

            const urlAnterior = localStorage.getItem('url_anterior_login');
            if (urlAnterior) {
                localStorage.removeItem('url_anterior_login');
                navigate(urlAnterior);
            } else if (rolUsuario === 'ADMIN') {
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
            const { data } = await clienteAxios.post('usuarios/google/', { id_token: googleToken });
            // Este endpoint devuelve los JWT dentro de "tokens" (el interceptor solo guarda los del nivel superior)
            localStorage.setItem('access_token', data.tokens.access);
            localStorage.setItem('refresh_token', data.tokens.refresh);

            const respuestaPerfil = await clienteAxios.get('usuarios/me/');
            const rolUsuario = respuestaPerfil.data.rol;

            // Descargamos el carrito también para Google
            await sincronizarCarrito();

            alert("¡Inicio de sesión con Google exitoso!");

            // Igual que el login con contraseña: vuelve a donde estaba (ej. el checkout)
            const urlAnterior = localStorage.getItem('url_anterior_login');
            if (urlAnterior) {
                localStorage.removeItem('url_anterior_login');
                navigate(urlAnterior);
            } else if (rolUsuario === 'ADMIN') {
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

            {googleHabilitado && (
                <>
                    <div style={{ margin: '20px 0', textAlign: 'center', color: '#4b5563', fontSize: '14px' }}>
                        O ingresa con
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={handleGoogleError}
                        />
                    </div>
                </>
            )}

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