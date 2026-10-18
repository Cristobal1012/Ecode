import { useId, useState } from 'react';
import clienteAxios from './axiosConfig';

export default function Register({ onSwitchToLogin }) {
    // Prefijo único para asociar cada etiqueta con su campo
    const id = useId();
    const [formData, setFormData] = useState({
        nombre: '',
        apellido_paterno: '',
        email: '',
        password: '',
        password2: ''
    });

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (formData.password !== formData.password2) {
            alert("Las contraseñas no coinciden");
            return;
        }

        try {
            console.log("Enviando petición a la ruta: http://localhost:8000/api/usuarios/registro/");
            
            
            const respuesta = await clienteAxios.post('/usuarios/registro/', formData);
            
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

    const campos = [
        { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'text', autocompletar: 'given-name' },
        { nombre: 'apellido_paterno', etiqueta: 'Apellido paterno', tipo: 'text', autocompletar: 'family-name' },
        { nombre: 'email', etiqueta: 'Correo electrónico', tipo: 'email', autocompletar: 'email' },
        { nombre: 'password', etiqueta: 'Contraseña', tipo: 'password', autocompletar: 'new-password' },
        { nombre: 'password2', etiqueta: 'Confirmar contraseña', tipo: 'password', autocompletar: 'new-password' }
    ];

    return (
        <div className="auth-tarjeta">
            <span className="antetitulo">Mi cuenta</span>
            <h1 className="auth-titulo">Crear cuenta</h1>

            <form onSubmit={handleSubmit} className="auth-formulario">
                {campos.map(campo => (
                    <div className="auth-campo" key={campo.nombre}>
                        <label htmlFor={`${id}-${campo.nombre}`}>{campo.etiqueta}</label>
                        <input
                            id={`${id}-${campo.nombre}`}
                            type={campo.tipo}
                            name={campo.nombre}
                            autoComplete={campo.autocompletar}
                            value={formData[campo.nombre]}
                            onChange={handleChange}
                            required
                        />
                    </div>
                ))}
                <button type="submit" className="boton boton-primario auth-enviar">
                    Registrarse
                </button>
            </form>

            <p className="auth-cambiar">
                ¿Ya tienes cuenta?{' '}
                <button type="button" className="boton-texto auth-cambiar-boton" onClick={onSwitchToLogin}>
                    Inicia sesión aquí
                </button>
            </p>
        </div>
    );
}
