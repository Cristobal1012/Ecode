import { useState, useEffect } from 'react';
import axios from 'axios';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';

export default function Checkout() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    const [emailInvitado, setEmailInvitado] = useState('');
    const [calle, setCalle] = useState('');
    const [comuna, setComuna] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [pasarelas, setPasarelas] = useState([]);
    const [opcionCompra, setOpcionCompra] = useState(null);
    const [itemsCarrito, setItemsCarrito] = useState([]);
    const [cargandoPagos, setCargandoPagos] = useState(true);
    const [usuarioAutenticado, setUsuarioAutenticado] = useState(
      !!localStorage.getItem('access_token')
    );
    const navigate = useNavigate();

    
    // Cargar los productos del carrito 
    useEffect(() => {
      const carritoGuardado = localStorage.getItem('carrito_local');
      if (carritoGuardado) {
        setItemsCarrito(JSON.parse(carritoGuardado));
      }
    }, []);

     
    // Cargar las pasarelas activas
  useEffect(() => {
    
    clienteAxios.get('configuracion/')
      .then(response => {
        console.log("Configuración recibida:", response.data);
        
        
        
        const configuracionPagos = response.data.api_keys_pagos || {};
        
        const pasarelasValidas = Object.entries(configuracionPagos)
          .filter(([nombre, config]) => config && config.activo === true) 
          .map(([nombre, config]) => nombre.toUpperCase());

        setPasarelas(pasarelasValidas);
      })
      .catch(error => {
        console.error("Hubo un error obteniendo los métodos de pago:", error);
      })
      .finally(() => {
        
        setCargandoPagos(false); 
      });
  }, []);

    
    const estiloContenedorOpciones = {
      maxWidth: '400px',
      margin: '40px auto',
      padding: '20px',
      border: '1px solid #ccc',
      borderRadius: '8px',
      fontFamily: 'sans-serif',
      textAlign: 'center'
    };

    const irALogin = () => {
      localStorage.setItem('url_anterior_login', window.location.pathname);
      navigate('/login');
    };

    const compraComoInvitado = modoAutenticacion === 'INVITADO' || 
      (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');

    useEffect(() => {
      const obtenerReglas = async () => {
        try {
          const respuesta = await clienteAxios.get('ventas/checkout/reglas/');
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

    
    const subtotal = itemsCarrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const costoEnvio = subtotal > 0 ? 3500 : 0;
    const totalFinal = subtotal + costoEnvio;

    
    const procesarPago = async (metodoSeleccionado) => {
      
      // Validación
      if (itemsCarrito.length === 0) {
        setMensaje('Tu carrito está vacío. Agrega productos antes de pagar.');
        return;
      }
      
      setMensaje('Procesando...');

        // Payload completo adaptado para que Django genere la orden y sus detalles
        const payload = {

            metodo_pago: metodoSeleccionado,
            email_invitado: !usuarioAutenticado && compraComoInvitado ? emailInvitado : null,
            
            direccion_envio_snapshot: {
                calle: calle,
                comuna: comuna
            },
            subtotal: subtotal,
            costo_envio: costoEnvio,
            total_final: totalFinal,
            // Enviamos también los ítems para que el backend cree los DetalleOrden y vacíe el carrito si corresponde
            items: itemsCarrito.map(item => ({
                producto_mongo_id: item.id,
                variante_sku: item.sku,
                nombre_producto_snapshot: item.nombre,
                precio_unitario_snapshot: item.precio,
                cantidad: item.cantidad
            }))
        };

        try {
            const respuesta = await clienteAxios.post('ventas/checkout/', payload);

            setMensaje('¡Éxito! Orden creada correctamente.');
            console.log("Respuesta del servidor:", respuesta.data);
            
            // Limpiamos el carrito local y la base de datos visual del carrito
            localStorage.removeItem('carrito_local');
            window.dispatchEvent(new Event('carritoActualizado'));
            
            // Si el backend tiene la ruta para limpiar el carrito en la BD, lo sincronizamos
            if (usuarioAutenticado) {
                try {
                    await clienteAxios.post('ventas/carrito/', { items: [] });
                } catch (err) { console.error("Error limpiando carrito en BD", err); }
            }

            // Redirigimos al historial de pedidos después de 1.5 segundos para que vea su orden
            setTimeout(() => {
                navigate('/mis-pedidos');
            }, 1500);

        } catch (error) {
            setMensaje('Error al procesar la compra. Revisa la consola.');
            console.error("Error devuelto por Django:", error.response?.data);
        }
    };
    
    if (modoAutenticacion == null) {
        return <p style={{ textAlign: 'center', marginTop: '50px' }}>Cargando opciones de compra...</p>;
    }

    if (modoAutenticacion === 'REGISTRO_OBLIGATORIO' && !usuarioAutenticado) {
        return (
            <div style={estiloContenedorOpciones}> 
                <h2>Finalizar Compra</h2> 
                <p>Para realizar la compra debes iniciar sesión o crear una cuenta.</p>
                <button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', marginBottom: '10px' }}>
                    Iniciar sesión o registrarse
                </button>
            </div>
        );
    }

    if (modoAutenticacion === 'MIXTO' && !usuarioAutenticado && opcionCompra === null) {
        return (
            <div style={estiloContenedorOpciones}> 
                <h2>Finalizar Compra</h2> 
                <p>¿Cómo quieres realizar tu compra?</p>
                <button onClick={() => setOpcionCompra('INVITADO')} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', marginBottom: '10px' }}>
                    Comprar como invitado
                </button>
                <button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>
                    Iniciar sesión o registrarse
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2>Finalizar Compra</h2>
            
            {mensaje && (
                <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensaje.includes('Éxito') ? '#d4edda' : '#f8d7da', borderRadius: '4px', color: mensaje.includes('Éxito') ? '#155724' : '#721c24' }}>
                    {mensaje}
                </div>
            )}


            {/* Resumen detallado del pedido */}
          <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Resumen del pedido</h3>
            {itemsCarrito.length > 0 ? (
              itemsCarrito.map((item, index) => (
                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '5px', color: '#4b5563' }}>
                  <span>{item.nombre} (x{item.cantidad})</span>
                  <span>${(item.precio * item.cantidad).toLocaleString('es-CL')}</span>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>No hay productos en el carrito.</p>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />

            {/* Desglose de Subtotal y Envío */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px', color: '#4b5563' }}>
              <span>Subtotal:</span>
              <span>${subtotal.toLocaleString('es-CL')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '10px', color: '#4b5563' }}>
              <span>Costo de envío:</span>
              <span>${costoEnvio.toLocaleString('es-CL')}</span>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem', color: '#1f2937' }}>
              <span>Total a pagar:</span>
              <span>${totalFinal.toLocaleString('es-CL')}</span>
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            {/* Formulario de Invitado */}
            {compraComoInvitado && (
              <div style={{ marginBottom: '15px' }}>
                <label>Correo para el recibo:</label>
                <input
                  type='email'
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
                        type='text'
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
  {cargandoPagos ? (
    <p style={{ color: '#d9534f', fontWeight: 'bold' }}>Cargando métodos de pago...</p>
  ) : pasarelas.length === 0 ? (
    <p style={{ color: '#d9534f', fontWeight: 'bold' }}>No hay métodos de pago configurados en la tienda.</p>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {pasarelas.map(pasarela => (
        <button
          key={pasarela}
          type="button"
          onClick={() => procesarPago(pasarela)}
          disabled={itemsCarrito.length === 0}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: itemsCarrito.length === 0 ? '#9ca3af' : '#007BFF',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: itemsCarrito.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '16px',
          }}
        >
          Pagar con {pasarela}
        </button>
      ))}
    </div>
  )}
</div>
            </form>
        </div>
    );
}