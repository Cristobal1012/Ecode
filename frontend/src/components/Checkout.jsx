import { useEffect, useState } from 'react';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';
 
export default function Checkout() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    
    //estados para guardar lo que el usuario escribe en el formulario.
    const [emailInvitado, setEmailInvitado] = useState('');
    const [calle, setCalle] = useState('');
    const [comuna, setComuna] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [opcionCompra, setOpcionCompra] = useState(null);
    const [usuarioAutenticado, setUsuarioAutenticado] = useState(
         !!localStorage.getItem('access_token')
    );
    const navigate = useNavigate();

    const estiloContenedorOpciones = { 
        maxWidth: '400px', 
        margin: '40px auto', 
        padding: '20px', 
        border: '1px solid #ccc', 
        borderRadius: '8px', 
        fontFamily: 'sans-serif', 
        textAlign: 'center' };

        const irALogin = () => { 
            localStorage.setItem('url_anterior_login', window.location.pathname); 
            navigate('/login'); 
        };

        const compraComoInvitado = modoAutenticacion === 'INVITADO' || 
        (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');

    useEffect(() => {
        const obtenerReglas = async () => { 
            try { 
                const respuesta = await clienteAxios.get(
                    'ventas/checkout/reglas/' 
                );
                
                setModoAutenticacion(respuesta.data.modo_autenticacion); 
            } catch (error) {
                console.error('Error al obtener reglas:', error); 
                setMensaje('No se pudieron cargar las opciones de compra.'); 
            } 
        }; 

        obtenerReglas(); 
    }, []);

    useEffect(() => {
        if (usuarioAutenticado && modoAutenticacion === 'MIXTO') {
            setOpcionCompra('USUARIO');
        }
    }, [usuarioAutenticado, modoAutenticacion]);
    
    const procesarPago = async (e) => {
        e.preventDefault(); //evita que la pagina se recargue al enviar el formulario.
        setMensaje('Procesando...');

        //armamos el JSON para django
        const payload = {
            email_invitado: !usuarioAutenticado && compraComoInvitado 
            ? emailInvitado : '',
            metodo_pago: "TRANSBANK",
            direccion_envio_snapshot: {
                calle: calle,
                comuna: comuna
            },
            subtotal: 25000,
            costo_envio: 3500,
            total_final: 28500
        };

        try {
            //se hace la petición POST al backend.
            const respuesta = await clienteAxios.post(
                'ventas/checkout/',
                payload
            );

            setMensaje('¡Éxito! Orden creada correctamente.');
            console.log("Respuesta del servidor:", respuesta.data);
            
            //se limpia el formulario.
            setEmailInvitado('');
            setCalle('');
            setComuna('');
        } catch (error) {
            setMensaje('Error al procesar la compra. Revisa la consola.');
            console.error("Error devuelto por Django:", error.response?.data);
        }
    };
    
    if (modoAutenticacion == null) {
        return <p>Cargando opciones de compra...</p>;
    }

        // Modo REGISTRO_OBLIGATORIO.
        if (modoAutenticacion === 'REGISTRO_OBLIGATORIO' && !usuarioAutenticado) {
        return (
            <div style={estiloContenedorOpciones}> 
            <h2>Finalizar Compra</h2> 
            <p> 
                Para realizar la compra debes iniciar sesión o crear una cuenta. 
                </p>

                <button
                    onClick={irALogin}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#007BFF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        marginBottom: '10px'
                    }}
                >
                    Iniciar sesión o registrarse
                </button>
            </div>
        );
    }

    //modo mixto
     if (
        modoAutenticacion === 'MIXTO' &&
        !usuarioAutenticado &&
        opcionCompra === null
    ) {
        return (
            <div style={estiloContenedorOpciones}> 
            <h2>Finalizar Compra</h2> 
            <p>
                ¿Cómo quieres realizar tu compra?
                </p>

                <button
                    onClick={() => setOpcionCompra('INVITADO')}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#007BFF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        marginBottom: '10px'
                    }}
                >
                    Comprar como invitado
                </button>

                <button
                    onClick={irALogin}
                    style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    Iniciar sesión o registrarse
                </button>
            </div>
        );
    }


    return (
        <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2>Finalizar Compra</h2>
            
            {mensaje && (
                <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensaje.includes('Éxito') ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
                    {mensaje}
                </div>
            )}

            <form onSubmit={procesarPago}>
                {/*Correo para comprar como invitado */}
                {compraComoInvitado && ( 
                    <div style={{ marginBottom: '15px' }}> 
                        <label>Correo para el recibo:</label> 
                        <input
                            type = 'email'
                            value = {emailInvitado}
                            onChange = {(e) => setEmailInvitado(e.target.value)}
                            required 
                            style = {{width:'100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box'}}
                        />
                    </div>
                )}

                <div style = {{marginBottom: '15px'}}>
                    <label>Calle y número:</label>
                    <input
                        type = 'text'
                        value = {calle}
                        onChange = {(e) => setCalle(e.target.value)}
                        required
                        style= {{width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box'}}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label>Comuna:</label>
                    <input 
                        type="text" 
                        value={comuna} 
                        onChange={(e) => setComuna(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
                    />
                </div>

                <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
                    Pagar $28.500
                </button>
            </form>
        </div>
    );
}
