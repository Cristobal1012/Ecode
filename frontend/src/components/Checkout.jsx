import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Checkout() {
    //simulamos que el usuario no ha iniciado sesion (invitado).
    const usuarioActual = null; 
    
    //estados para guardar lo que el usuario escribe en el formulario.
    const [emailInvitado, setEmailInvitado] = useState('');
    const [calle, setCalle] = useState('');
    const [comuna, setComuna] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [pasarelas, setPasarelas] = useState([]);

    useEffect(() => {
        
      axios.get('http://127.0.0.1:8000/api/configuracion/')
        .then(response => {
          console.log("Configuración recibida:", response.data);
          const configuracionPagos = response.data.api_keys_pagos || response.data;
          
          const pasarelasValidas = Object.entries(configuracionPagos)
            .filter(([nombre, config]) => config.activo === true)
            .map(([nombre, config]) => nombre.toUpperCase());
            
          setPasarelas(pasarelasValidas);
        })
        .catch(error => {
          console.error("Hubo un error obteniendo los métodos de pago:", error);
        });
        
       

    

    }, []);

    const procesarPago = async (metodoSeleccionado) => {
        
        setMensaje('Procesando...');

        //armamos el JSON para django
        const payload = {
            email_invitado: usuarioActual ? '' : emailInvitado,
            metodo_pago: metodoSeleccionado,
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
            const respuesta = await axios.post('http://127.0.0.1:8000/ventas/api/checkout/', payload);
            setMensaje('¡Éxito! Orden creada correctamente.');
            console.log("Respuesta del servidor:", respuesta.data);
            
            //se limpia el formulario.
            setEmailInvitado(''); setCalle(''); setComuna('');
        } catch (error) {
            setMensaje('Error al procesar la compra. Revisa la consola.');
            console.error("Error devuelto por Django:", error.response?.data);
        }
    };

    return (
        <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2>Finalizar Compra</h2>
            
            {mensaje && (
                <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensaje.includes('Éxito') ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
                    {mensaje}
                </div>
            )}

            <form>
                {/* Formulario de Invitado */}
                {!usuarioActual && (
                    <div style={{ marginBottom: '15px' }}>
                        <label>Correo para el recibo:</label>
                        <input 
                            type="email" 
                            value={emailInvitado} 
                            onChange={(e) => setEmailInvitado(e.target.value)} 
                            required 
                            style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
                        />
                    </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                    <label>Calle y número:</label>
                    <input 
                        type="text" 
                        value={calle} 
                        onChange={(e) => setCalle(e.target.value)} 
                        required 
                        style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
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

                <div style={{ marginTop: '20px' }}>
        {pasarelas.length === 0 ? (
          <p style={{ color: '#d9534f', fontWeight: 'bold' }}>Cargando métodos de pago...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pasarelas.map(pasarela => (
              <button 
                key={pasarela}
                type="button" 
                onClick={() => procesarPago(pasarela)}
                style={{ 
                  width: '100%', padding: '10px', backgroundColor: '#007BFF', 
                  color: 'white', border: 'none', borderRadius: '4px', 
                  cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' 
                }}
              >
                Pagar $28.500 con {pasarela}
              </button>
            ))}
          </div>
        )}
      </div>
            </form>
        </div>
    );
}