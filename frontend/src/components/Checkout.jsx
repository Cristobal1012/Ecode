import { useState, useEffect } from 'react';
import axios from 'axios';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';

export default function Checkout() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    const [emailInvitado, setEmailInvitado] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [opcionCompra, setOpcionCompra] = useState(null);
    const [itemsCarrito, setItemsCarrito] = useState([]);
    
    // --- NUEVOS ESTADOS DE DIRECCIÓN ---
    const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
    const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState('nueva');
    const [guardarNuevaDireccion, setGuardarNuevaDireccion] = useState(true);

    const [calle, setCalle] = useState('');
    const [numero, setNumero] = useState('');
    const [dptoCasa, setDptoCasa] = useState(''); // <- NUEVO ESTADO PARA DPTO/CASA
    const [comuna, setComuna] = useState('');
    const [ciudad, setCiudad] = useState('');
    const [region, setRegion] = useState('');

    const [listaComunas, setListaComunas] = useState([]);
    const [cargandoComunas, setCargandoComunas] = useState(true);
    const [pasarelas, setPasarelas] = useState([]);
    const [cargandoPagos, setCargandoPagos] = useState(true);

    const [cajaCalculada, setCajaCalculada] = useState({
        peso_kg: '1.0', alto_cm: '10', ancho_cm: '10', largo_cm: '10'
    });

    const [opcionesEntrega, setOpcionesEntrega] = useState([]);
    const [opcionEntregaSeleccionada, setOpcionEntregaSeleccionada] = useState(null);
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [cotizando, setCotizando] = useState(false);

    const [usuarioAutenticado, setUsuarioAutenticado] = useState(
      !!localStorage.getItem('access_token')
    );
    const navigate = useNavigate();

    // 1. CARGA INICIAL: Pasarelas, Comunas y Reglas
    useEffect(() => {
        clienteAxios.get('configuracion/')
            .then(response => setPasarelas(response.data.pasarelas_activas || []))
            .catch(error => console.error("Error obteniendo métodos de pago:", error))
            .finally(() => setCargandoPagos(false));

        clienteAxios.get('ventas/logistica/comunas/')
            .then(response => setListaComunas(response.data.comunas || []))
            .catch(error => {
                console.error("Error cargando comunas:", error);
                setMensaje("No se pudo cargar el listado oficial de comunas.");
            })
            .finally(() => setCargandoComunas(false));

        const obtenerReglas = async () => {
            try {
                const respuesta = await clienteAxios.get('ventas/checkout/reglas/');
                setModoAutenticacion(respuesta.data.modo_autenticacion);
            } catch (error) {
                setMensaje('No se pudieron cargar las opciones de compra.');
            }
        };
        obtenerReglas();
    }, []);

    // 2. CARGA DE DIRECCIONES DEL USUARIO
    useEffect(() => {
        if (usuarioAutenticado) {
            clienteAxios.get('ventas/direcciones/')
                .then(res => {
                    const direcciones = res.data;
                    setDireccionesGuardadas(direcciones);
                    
                    if (direcciones.length > 0) {
                        const predeterminada = direcciones.find(d => d.es_predeterminado) || direcciones[0];
                        setDireccionSeleccionadaId(predeterminada.id);
                        // Si ya tenemos el carrito cargado, cotizamos con la dirección predeterminada
                        if (itemsCarrito.length > 0) {
                            cotizarEnvio(predeterminada.comuna, itemsCarrito);
                        }
                    }
                })
                .catch(err => console.error("Error cargando direcciones:", err));
        }
    }, [usuarioAutenticado, itemsCarrito.length]);

    // 3. CARGA DEL CARRITO
    useEffect(() => {
        const carritoGuardado = localStorage.getItem('carrito_local');
        if (carritoGuardado) {
            try {
                const carritoParseado = JSON.parse(carritoGuardado);
                setItemsCarrito(carritoParseado);
                if (comuna && direccionSeleccionadaId === 'nueva') {
                    cotizarEnvio(comuna, carritoParseado);
                }
            } catch (error) {
                console.error('Error leyendo carrito:', error);
                setItemsCarrito([]);
            }
        }
    }, []);

    useEffect(() => {
        if (usuarioAutenticado && modoAutenticacion === 'MIXTO') {
            setOpcionCompra('USUARIO');
        }
    }, [usuarioAutenticado, modoAutenticacion]);

    // ==========================================
    // ALGORITMO DE EMPAQUETADO VIRTUAL
    // ==========================================
    const calcularCajaDeEnvio = (carritoActual) => {
        let pesoTotal = 0;
        let volumenTotal = 0;
        let ladoMasLargoDelCarrito = 0;

        carritoActual.forEach(item => {
            const peso = parseFloat(item.peso_kg) || 0.1;
            const alto = parseInt(item.alto_cm, 10) || 10;
            const ancho = parseInt(item.ancho_cm, 10) || 10;
            const largo = parseInt(item.largo_cm, 10) || 10;
            const cantidad = parseInt(item.cantidad, 10) || 1;

            pesoTotal += (peso * cantidad);
            volumenTotal += (alto * ancho * largo) * cantidad;

            const maxDimensionProducto = Math.max(alto, ancho, largo);
            if (maxDimensionProducto > ladoMasLargoDelCarrito) {
                ladoMasLargoDelCarrito = maxDimensionProducto;
            }
        });

        let ladoCajaFinal = Math.ceil(Math.pow(volumenTotal, 1/3));
        if (ladoCajaFinal < ladoMasLargoDelCarrito) ladoCajaFinal = ladoMasLargoDelCarrito;
        if (ladoCajaFinal < 10) ladoCajaFinal = 10;

        return {
            peso: Number(pesoTotal.toFixed(2)),
            lado: ladoCajaFinal
        };
    };

    // ==========================================
    // COTIZACIÓN DINÁMICA
    // ==========================================
    const cotizarEnvio = async (comunaSeleccionada, carritoActual = itemsCarrito) => {
        const destinoAUsar = comunaSeleccionada || comuna;
        const totalProductos = carritoActual.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
        
        if (!destinoAUsar.trim() || totalProductos <= 0) {
            setOpcionesEntrega([]); setOpcionEntregaSeleccionada(null); setCostoEnvio(0);
            return;
        }
        
        setCotizando(true);
        setMensaje('');

        const medidasCaja = calcularCajaDeEnvio(carritoActual);
        setCajaCalculada({
            peso_kg: String(medidasCaja.peso),
            alto_cm: String(medidasCaja.lado),
            ancho_cm: String(medidasCaja.lado),
            largo_cm: String(medidasCaja.lado)
        });

        try {
            const payload = { 
                destino: destinoAUsar.trim().toUpperCase(), 
                peso: medidasCaja.peso, 
                alto: medidasCaja.lado, 
                ancho: medidasCaja.lado, 
                largo: medidasCaja.lado 
            };
            
            const respuesta = await clienteAxios.post('ventas/logistica/cotizar/', payload);
            const resultadoChilexpress = respuesta.data;
            
            const opciones = [{
                proveedor: resultadoChilexpress.proveedor.toLowerCase(),
                nombre: `Chilexpress - ${resultadoChilexpress.tiempo_estimado}`,
                tipo: 'DOMICILIO',
                costo_envio: resultadoChilexpress.precio
            }];

            setOpcionesEntrega(opciones);
            setOpcionEntregaSeleccionada(opciones[0]);
            setCostoEnvio(Number(opciones[0].costo_envio));
        } catch (error) {
            console.error('Error al cotizar envío:', error);
            setOpcionesEntrega([]); setOpcionEntregaSeleccionada(null); setCostoEnvio(0);
            setMensaje(error.response?.data?.error || 'No se pudo calcular el costo de envío.');
        } finally {
            setCotizando(false);
        }
    };

    // Manejador para el cambio de dirección (Guardada vs Nueva)
    const handleCambioDireccion = (id) => {
        setDireccionSeleccionadaId(id);
        if (id !== 'nueva') {
            const dir = direccionesGuardadas.find(d => d.id === id);
            cotizarEnvio(dir.comuna);
        } else {
            setOpcionesEntrega([]); setOpcionEntregaSeleccionada(null); setCostoEnvio(0);
            if (comuna) cotizarEnvio(comuna);
        }
    };

    const seleccionarEntrega = (opcion) => {
        setOpcionEntregaSeleccionada(opcion);
        setCostoEnvio(Number(opcion.costo_envio));
        setMensaje('');
    };

    const estiloContenedorOpciones = {
        maxWidth: '400px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', textAlign: 'center'
    };
    const inputStyle = { width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' };

    const irALogin = () => {
        localStorage.setItem('url_anterior_login', window.location.pathname);
        navigate('/login');
    };

    const compraComoInvitado = modoAutenticacion === 'INVITADO' || 
        (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');
    const subtotal = itemsCarrito.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
    const totalFinal = subtotal + costoEnvio;

    // ==========================================
    // PROCESAR PAGO
    // ==========================================
    const procesarPago = async (metodoSeleccionado) => {
        if (itemsCarrito.length === 0) return setMensaje('Tu carrito está vacío. Agrega productos antes de pagar.');
        if (!opcionEntregaSeleccionada) return setMensaje('Selecciona una opción de entrega antes de continuar.');

        let dirSnapshot = {};
        
        // 1. Determinar qué dirección enviar al backend
        if (direccionSeleccionadaId !== 'nueva') {
            const dir = direccionesGuardadas.find(d => d.id === direccionSeleccionadaId);
            // INCLUYE EL CAMPO DPTO_CASA DESDE LA DIRECCIÓN GUARDADA
            dirSnapshot = { calle: dir.calle, numero: dir.calle_numero, dpto_casa: dir.dpto_casa, comuna: dir.comuna, ciudad: dir.ciudad, region: dir.region };
        } else {
            if (!calle.trim() || !numero.trim() || !comuna.trim() || !ciudad.trim()) {
                return setMensaje('Completa todos los campos obligatorios de tu nueva dirección de envío.');
            }
            // INCLUYE EL CAMPO DPTO_CASA DESDE EL ESTADO DEL FORMULARIO
            dirSnapshot = { calle, numero, dpto_casa: dptoCasa, comuna, ciudad, region };

            // 2. Si el usuario quiere guardar la dirección, hacemos el POST en segundo plano
            if (usuarioAutenticado && guardarNuevaDireccion) {
                try {
                    await clienteAxios.post('ventas/direcciones/', {
                        calle, calle_numero: numero, dpto_casa: dptoCasa, comuna, ciudad, region, es_predeterminado: true
                    });
                } catch (err) {
                    console.error("No se pudo guardar la dirección", err);
                }
            }
        }
        
        setMensaje('Procesando...');

        const payload = {
            metodo_pago: metodoSeleccionado, 
            email_invitado: !usuarioAutenticado && compraComoInvitado ? emailInvitado : null,
            direccion_envio_snapshot: dirSnapshot,
            subtotal: subtotal,
            costo_envio: costoEnvio,
            total_final: totalFinal,
            proveedor_logistico: opcionEntregaSeleccionada.proveedor, 
            paquete: cajaCalculada, 
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
            localStorage.removeItem('carrito_local');
            window.dispatchEvent(new Event('carritoActualizado'));

            if (usuarioAutenticado) {
                try {
                    await clienteAxios.post('ventas/carrito/', { items: [] });
                } catch (err) {}
            }

            if (respuesta.data.url_pago) {
                window.location.href = respuesta.data.url_pago;
            } else {
                setTimeout(() => { navigate('/mis-pedidos'); }, 1500);
            }
        } catch (error) {
            setMensaje('Error al procesar la compra. Revisa la consola.');
            console.error('Error devuelto por Django:', error.response?.data);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '6px', color: '#4b5563' }}>
                    <span>Subtotal:</span>
                    <span>${subtotal.toLocaleString('es-CL')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '10px', color: '#4b5563' }}>
                    <span>Costo de envío:</span>
                    <span>{cotizando ? 'Calculando...' : `$${costoEnvio.toLocaleString('es-CL')}`}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem', color: '#1f2937' }}>
                    <span>Total a pagar:</span>
                    <span>${totalFinal.toLocaleString('es-CL')}</span>
                </div>
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
                {compraComoInvitado && (
                    <div style={{ marginBottom: '15px' }}>
                        <label>Correo para el recibo:</label>
                        <input type="email" value={emailInvitado} onChange={(e) => setEmailInvitado(e.target.value)} required style={inputStyle} />
                    </div>
                )}
                
                {/* --- SELECCIÓN DE DIRECCIÓN --- */}
                <div style={{ marginBottom: '25px' }}>
                    <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '15px' }}>Dirección de Envío</h3>
                    
                    {usuarioAutenticado && direccionesGuardadas.length > 0 && (
                        <div style={{ marginBottom: '15px' }}>
                            {direccionesGuardadas.map(dir => (
                                <label key={dir.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === dir.id ? '2px solid #007BFF' : '1px solid #ddd', borderRadius: '6px', marginBottom: '8px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === dir.id ? '#f0f7ff' : 'white' }}>
                                    <input type="radio" name="direccion" checked={direccionSeleccionadaId === dir.id} onChange={() => handleCambioDireccion(dir.id)} style={{ marginRight: '10px' }} />
                                    <div>
                                        <div style={{ fontWeight: 'bold' }}>{dir.calle} {dir.calle_numero} {dir.dpto_casa && `- ${dir.dpto_casa}`}</div>
                                        <div style={{ fontSize: '0.85rem', color: '#666' }}>{dir.comuna}, {dir.ciudad} {dir.es_predeterminado && '(Predeterminada)'}</div>
                                    </div>
                                </label>
                            ))}
                            <label style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === 'nueva' ? '2px solid #007BFF' : '1px dashed #ccc', borderRadius: '6px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === 'nueva' ? '#f0f7ff' : 'white' }}>
                                <input type="radio" name="direccion" checked={direccionSeleccionadaId === 'nueva'} onChange={() => handleCambioDireccion('nueva')} style={{ marginRight: '10px' }} />
                                <span style={{ fontWeight: 'bold' }}>Ingresar una nueva dirección</span>
                            </label>
                        </div>
                    )}

                    {/* Formulario Nueva Dirección */}
                    {direccionSeleccionadaId === 'nueva' && (
                        <div style={{ padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <div style={{ flex: 3 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Calle</label>
                                    <input type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required style={inputStyle} placeholder="Ej: Av. Providencia" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Número</label>
                                    <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required style={inputStyle} placeholder="Ej: 1234" />
                                </div>
                            </div>

                            {/* NUEVO CAMPO DE FORMULARIO */}
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Dpto, Casa o Referencia (Opcional)</label>
                                <input type="text" value={dptoCasa} onChange={(e) => setDptoCasa(e.target.value)} style={inputStyle} placeholder="Ej: Depto 505 / Casa 12 / Condominio Las Rosas" />
                            </div>
                            
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Comuna</label>
                                    <select 
                                        value={comuna} 
                                        onChange={(e) => {
                                            setComuna(e.target.value);
                                            cotizarEnvio(e.target.value);
                                        }} 
                                        required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}
                                    >
                                        <option value="">{cargandoComunas ? "Cargando..." : "-- Selecciona --"}</option>
                                        {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Ciudad</label>
                                    <input type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)} required style={inputStyle} placeholder="Ej: Santiago" />
                                </div>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Región (Opcional)</label>
                                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} placeholder="Ej: Metropolitana" />
                            </div>

                            {usuarioAutenticado && (
                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', color: '#4b5563', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={guardarNuevaDireccion} onChange={(e) => setGuardarNuevaDireccion(e.target.checked)} style={{ marginRight: '8px' }} />
                                    Guardar esta dirección para mis próximas compras
                                </label>
                            )}
                        </div>
                    )}
                </div>

                {opcionesEntrega.length > 0 && (
                    <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Método de entrega</h3>
                        {opcionesEntrega.map((opcion) => {
                            const seleccionada = opcionEntregaSeleccionada?.proveedor === opcion.proveedor;
                            return (
                                <label key={opcion.proveedor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', marginBottom: '8px', border: seleccionada ? '2px solid #007BFF' : '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', backgroundColor: seleccionada ? '#f0f7ff' : 'white' }}>
                                    <div>
                                        <input type="radio" name="metodoEntrega" checked={seleccionada} onChange={() => seleccionarEntrega(opcion)} style={{ marginRight: '8px' }} />
                                        <strong>{opcion.nombre}</strong>
                                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                            {opcion.tipo === 'RETIRO' ? 'Retiro en tienda' : 'Despacho a domicilio'}
                                        </div>
                                    </div>
                                    <strong>{Number(opcion.costo_envio).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</strong>
                                </label>
                            );
                        })}
                    </div>
                )}
            
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
                                    disabled={itemsCarrito.length === 0 || cotizando || !opcionEntregaSeleccionada}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        backgroundColor: (itemsCarrito.length === 0 || cotizando || !opcionEntregaSeleccionada) ? '#9ca3af' : '#007BFF',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: (itemsCarrito.length === 0 || cotizando || !opcionEntregaSeleccionada) ? 'not-allowed' : 'pointer',
                                        fontSize: '16px',
                                        fontWeight: 'bold'
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