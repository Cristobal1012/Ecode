import { useState, useEffect } from 'react';
import axios from 'axios';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';
import { ajustarCarrito, guardarCarrito, validarCarrito } from './carrito';

export default function Checkout() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    const [emailInvitado, setEmailInvitado] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [opcionCompra, setOpcionCompra] = useState(null);
    const [itemsCarrito, setItemsCarrito] = useState([]);
    
    // --- CONFIGURACIÓN DE LA TIENDA (LOCAL) ---
    const [configTienda, setConfigTienda] = useState(null);

    // --- ESTADOS DE TIPO DE DESPACHO ---
    const [tipoDespacho, setTipoDespacho] = useState('DOMICILIO'); // 'DOMICILIO' | 'SUCURSAL' | 'RETIRO_LOCAL'
    const [comunaSucursal, setComunaSucursal] = useState('');
    const [sucursalesDisponibles, setSucursalesDisponibles] = useState([]);
    const [cargandoSucursales, setCargandoSucursales] = useState(false);
    const [sucursalSeleccionada, setSucursalSeleccionada] = useState(null);

    // --- ESTADOS DE DIRECCIÓN DOMICILIO ---
    const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
    const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState('nueva');
    const [guardarNuevaDireccion, setGuardarNuevaDireccion] = useState(true);

    const [calle, setCalle] = useState('');
    const [numero, setNumero] = useState('');
    const [dptoCasa, setDptoCasa] = useState('');
    const [comuna, setComuna] = useState('');
    const [ciudad, setCiudad] = useState('');
    const [region, setRegion] = useState('');

    const [listaComunas, setListaComunas] = useState([]);
    const [cargandoComunas, setCargandoComunas] = useState(true);
    const [pasarelas, setPasarelas] = useState([]);
    const [cargandoPagos, setCargandoPagos] = useState(true);

    const [cajaCalculada, setCajaCalculada] = useState({ peso_kg: '1.0', alto_cm: '10', ancho_cm: '10', largo_cm: '10' });
    const [opcionesEntrega, setOpcionesEntrega] = useState([]);
    const [opcionEntregaSeleccionada, setOpcionEntregaSeleccionada] = useState(null);
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [cotizando, setCotizando] = useState(false);
    // RF-04.4: consentimiento obligatorio, desmarcado por defecto
    const [aceptaTerminos, setAceptaTerminos] = useState(false);
    // Tipos de página legal publicados (ej. 'TERMINOS'), para enlazarlos junto al consentimiento
    const [paginasLegales, setPaginasLegales] = useState([]);
    // Cambios hechos al carrito porque algo se agotó o cambió de precio
    const [avisosCarrito, setAvisosCarrito] = useState([]);

    const [usuarioAutenticado, setUsuarioAutenticado] = useState(!!localStorage.getItem('access_token'));
    const navigate = useNavigate();

    // 1. CARGA INICIAL: Configuración de la tienda, Pasarelas y Comunas
    useEffect(() => {
        clienteAxios.get('configuracion/')
            .then(res => {
                setPasarelas(res.data.pasarelas_activas || []);
                setConfigTienda(res.data);
            })
            .finally(() => setCargandoPagos(false));

        clienteAxios.get('ventas/logistica/comunas/')
            .then(res => setListaComunas(res.data.comunas || []))
            .finally(() => setCargandoComunas(false));

        clienteAxios.get('ventas/checkout/reglas/')
            .then(res => setModoAutenticacion(res.data.modo_autenticacion))
            .catch(() => setMensaje('No se pudieron cargar las opciones de compra.'));

        // Sin enlaces el checkbox sigue funcionando: solo se pierde la opción de leerlas aquí
        clienteAxios.get('ventas/paginas-legales/')
            .then(res => setPaginasLegales((res.data || []).map(p => p.tipo_pagina)))
            .catch(() => setPaginasLegales([]));
    }, []);

    const enlaceLegal = (tipo, texto) => paginasLegales.includes(tipo) ? (
        <a href={`/legal/${tipo.toLowerCase()}`} target="_blank" rel="noopener noreferrer" aria-label={`${texto} (se abre en otra pestaña)`}>
            {texto}
        </a>
    ) : texto;

    // 2. CARGA DE DIRECCIONES GUARDADAS
    useEffect(() => {
        if (usuarioAutenticado) {
            clienteAxios.get('ventas/direcciones/')
                .then(res => {
                    const direcciones = res.data;
                    setDireccionesGuardadas(direcciones);
                    if (direcciones.length > 0) {
                        const predeterminada = direcciones.find(d => d.es_predeterminado) || direcciones[0];
                        setDireccionSeleccionadaId(predeterminada.id);
                        if (itemsCarrito.length > 0 && tipoDespacho === 'DOMICILIO') {
                            cotizarEnvio(predeterminada.comuna, itemsCarrito);
                        }
                    }
                })
                .catch(err => console.error(err));
        }
    }, [usuarioAutenticado, itemsCarrito.length]);

    // RN-03: ajusta el carrito al stock y precios vigentes y avisa qué cambió.
    // Si la validación falla, se sigue con el carrito tal cual: el backend revalida al crear la orden.
    const revisarCarrito = async (items) => {
        if (items.length === 0) return;
        try {
            const ajuste = ajustarCarrito(items, await validarCarrito(items));
            if (ajuste.avisos.length > 0) {
                setItemsCarrito(ajuste.items);
                setAvisosCarrito(ajuste.avisos);
                await guardarCarrito(ajuste.items);
            }
        } catch (error) {
            console.error('No se pudo validar el carrito:', error);
        }
    };

    // 3. CARGA DEL CARRITO
    useEffect(() => {
        const carritoGuardado = localStorage.getItem('carrito_local');
        if (carritoGuardado) {
            try {
                const carritoParseado = JSON.parse(carritoGuardado);
                setItemsCarrito(carritoParseado);
                revisarCarrito(carritoParseado);
            } catch (e) { setItemsCarrito([]); }
        }
    }, []);

    useEffect(() => {
        if (usuarioAutenticado && modoAutenticacion === 'MIXTO') setOpcionCompra('USUARIO');
    }, [usuarioAutenticado, modoAutenticacion]);

    // 4. CAMBIO ENTRE TABS (DOMICILIO / SUCURSAL / RETIRO_LOCAL)
    useEffect(() => {
        if (itemsCarrito.length === 0) return;
        
        if (tipoDespacho === 'DOMICILIO') {
            if (direccionSeleccionadaId !== 'nueva') {
                const dir = direccionesGuardadas.find(d => d.id === direccionSeleccionadaId);
                if (dir) cotizarEnvio(dir.comuna);
            } else if (comuna) {
                cotizarEnvio(comuna);
            }
        } else if (tipoDespacho === 'SUCURSAL') {
            if (comunaSucursal) {
                cotizarEnvio(comunaSucursal);
            } else {
                setOpcionesEntrega([]); setCostoEnvio(0); setOpcionEntregaSeleccionada(null);
            }
        } else if (tipoDespacho === 'RETIRO_LOCAL') {
            const opcionRetiroLocal = {
                proveedor: 'RETIRO_LOCAL',
                nombre: 'Retiro en Tienda / Local',
                tipo: 'RETIRO',
                costo_envio: 0
            };
            setOpcionesEntrega([opcionRetiroLocal]);
            setOpcionEntregaSeleccionada(opcionRetiroLocal);
            setCostoEnvio(0);
        }
    }, [tipoDespacho]);

    // 5. CARGAR SUCURSALES CUANDO CAMBIA LA COMUNA SUCURSAL
    useEffect(() => {
        if (tipoDespacho === 'SUCURSAL' && comunaSucursal) {
            setCargandoSucursales(true);
            setSucursalSeleccionada(null);
            clienteAxios.get(`ventas/logistica/sucursales/?comuna=${comunaSucursal}`)
                .then(res => setSucursalesDisponibles(res.data.sucursales || []))
                .catch(() => setSucursalesDisponibles([]))
                .finally(() => setCargandoSucursales(false));
        }
    }, [comunaSucursal, tipoDespacho]);

    const calcularCajaDeEnvio = (carritoActual) => {
        let pesoTotal = 0, volumenTotal = 0, ladoMasLargo = 0;
        carritoActual.forEach(item => {
            const peso = parseFloat(item.peso_kg) || 0.1, alto = parseInt(item.alto_cm, 10) || 10, ancho = parseInt(item.ancho_cm, 10) || 10, largo = parseInt(item.largo_cm, 10) || 10, cantidad = parseInt(item.cantidad, 10) || 1;
            pesoTotal += (peso * cantidad); volumenTotal += (alto * ancho * largo) * cantidad;
            ladoMasLargo = Math.max(ladoMasLargo, alto, ancho, largo);
        });
        let ladoCajaFinal = Math.ceil(Math.pow(volumenTotal, 1/3));
        if (ladoCajaFinal < ladoMasLargo) ladoCajaFinal = ladoMasLargo;
        if (ladoCajaFinal < 10) ladoCajaFinal = 10;
        return { peso: Number(pesoTotal.toFixed(2)), lado: ladoCajaFinal };
    };

    const cotizarEnvio = async (comunaDestino, carritoActual = itemsCarrito) => {
        if (!comunaDestino.trim() || carritoActual.length === 0) {
            setOpcionesEntrega([]); setCostoEnvio(0); return;
        }
        setCotizando(true); setMensaje('');
        const medidasCaja = calcularCajaDeEnvio(carritoActual);
        setCajaCalculada({ peso_kg: String(medidasCaja.peso), alto_cm: String(medidasCaja.lado), ancho_cm: String(medidasCaja.lado), largo_cm: String(medidasCaja.lado) });

        try {
            const payload = { destino: comunaDestino.trim().toUpperCase(), peso: medidasCaja.peso, alto: medidasCaja.lado, ancho: medidasCaja.lado, largo: medidasCaja.lado };
            const respuesta = await clienteAxios.post('ventas/logistica/cotizar/', payload);
            
            // Cambio importante: pasamos el proveedor a MAYÚSCULAS para cumplir con el serializer
            const opciones = [{
                proveedor: respuesta.data.proveedor.toUpperCase(),
                nombre: `Chilexpress - ${respuesta.data.tiempo_estimado}`,
                tipo: tipoDespacho === 'SUCURSAL' ? 'RETIRO' : 'DOMICILIO',
                costo_envio: respuesta.data.precio
            }];

            setOpcionesEntrega(opciones);
            setOpcionEntregaSeleccionada(opciones[0]);
            setCostoEnvio(Number(opciones[0].costo_envio));
        } catch (error) {
            setOpcionesEntrega([]); setCostoEnvio(0);
            setMensaje(error.response?.data?.error || 'No se pudo calcular el costo de envío.');
        } finally {
            setCotizando(false);
        }
    };

    const handleCambioDireccionGuardada = (id) => {
        setDireccionSeleccionadaId(id);
        if (id !== 'nueva') {
            const dir = direccionesGuardadas.find(d => d.id === id);
            cotizarEnvio(dir.comuna);
        } else {
            if (comuna) cotizarEnvio(comuna);
            else { setOpcionesEntrega([]); setCostoEnvio(0); }
        }
    };

    const estiloContenedorOpciones = { maxWidth: '400px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', textAlign: 'center' };
    const inputStyle = { width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' };

    const irALogin = () => { localStorage.setItem('url_anterior_login', window.location.pathname); navigate('/login'); };
    const compraComoInvitado = modoAutenticacion === 'INVITADO' || (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');
    const subtotal = itemsCarrito.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
    const totalFinal = subtotal + costoEnvio;

    const procesarPago = async (metodoSeleccionado) => {
        if (itemsCarrito.length === 0) return setMensaje('Tu carrito está vacío.');
        if (!opcionEntregaSeleccionada) return setMensaje('Selecciona una opción de entrega.');
        if (!aceptaTerminos) return setMensaje('Debes aceptar los Términos y Condiciones y la Política de Privacidad.');

        let dirSnapshot = {};
        
        if (tipoDespacho === 'RETIRO_LOCAL') {
            dirSnapshot = {
                calle: `Retiro en Local: ${configTienda?.calle_origen || 'Av. Principal'}`,
                numero: configTienda?.numero_origen || '123',
                dpto_casa: configTienda?.dpto_casa_origen ? `Oficina/Detalle: ${configTienda.dpto_casa_origen}` : 'Retiro en Tienda Física',
                comuna: configTienda?.comuna_origen || 'Santiago',
                ciudad: configTienda?.comuna_origen || 'Santiago',
                region: configTienda?.region_origen || 'Metropolitana'
            };
        } else if (tipoDespacho === 'SUCURSAL') {
            if (!comunaSucursal || !sucursalSeleccionada) {
                return setMensaje('Debes elegir una sucursal para el retiro.');
            }
            dirSnapshot = {
                calle: `Agencia Chilexpress: ${sucursalSeleccionada.nombre}`,
                numero: 'S/N',
                dpto_casa: `Código Oficial: ${sucursalSeleccionada.codigo}`,
                comuna: comunaSucursal,
                ciudad: comunaSucursal,
                region: ''
            };
        } else {
            if (direccionSeleccionadaId !== 'nueva') {
                const dir = direccionesGuardadas.find(d => d.id === direccionSeleccionadaId);
                dirSnapshot = { calle: dir.calle, numero: dir.calle_numero, dpto_casa: dir.dpto_casa, comuna: dir.comuna, ciudad: dir.ciudad, region: dir.region };
            } else {
                if (!calle.trim() || !numero.trim() || !comuna.trim() || !ciudad.trim()) {
                    return setMensaje('Completa todos los campos obligatorios de tu nueva dirección de envío.');
                }
                dirSnapshot = { calle, numero, dpto_casa: dptoCasa, comuna, ciudad, region };

                if (usuarioAutenticado && guardarNuevaDireccion) {
                    try {
                        await clienteAxios.post('ventas/direcciones/', { calle, calle_numero: numero, dpto_casa: dptoCasa, comuna, ciudad, region, es_predeterminado: true });
                    } catch (err) { console.error(err); }
                }
            }
        }
        
        setMensaje('Procesando...');

        const payload = {
            metodo_pago: metodoSeleccionado, 
            email_invitado: !usuarioAutenticado && compraComoInvitado ? emailInvitado : null,
            direccion_envio_snapshot: dirSnapshot, 
            subtotal, 
            costo_envio: costoEnvio, 
            total_final: totalFinal,
            proveedor_logistico: opcionEntregaSeleccionada.proveedor, 
            paquete: tipoDespacho === 'RETIRO_LOCAL' ? undefined : cajaCalculada,
            acepta_terminos: aceptaTerminos,
            items: itemsCarrito.map(item => ({ producto_mongo_id: item.id, variante_sku: item.sku, nombre_producto_snapshot: item.nombre, precio_unitario_snapshot: item.precio, cantidad: item.cantidad }))
        };

        try {
            const respuesta = await clienteAxios.post('ventas/checkout/', payload);

            if (respuesta.data.url_pago) {
                // El carrito se conserva por si el pago se anula; lo vacía PagoExitoso
                window.location.href = respuesta.data.url_pago;
            } else {
                localStorage.removeItem('carrito_local');
                window.dispatchEvent(new Event('carritoActualizado'));
                if (usuarioAutenticado) {
                    try { await clienteAxios.post('ventas/carrito/', { items: [] }); } catch (err) {}
                }
                setTimeout(() => { navigate('/mis-pedidos'); }, 1500);
            }
        } catch (error) {
            const datos = error.response?.data || {};
            // Si cambiaron los precios, se actualiza el carrito para que el comprador vea el nuevo total
            if (datos.precios_vigentes) {
                const carritoActualizado = itemsCarrito.map(item => {
                    const vigente = datos.precios_vigentes.find(p => p.variante_sku === item.sku);
                    return vigente ? { ...item, precio: vigente.precio } : item;
                });
                localStorage.setItem('carrito_local', JSON.stringify(carritoActualizado));
                setItemsCarrito(carritoActualizado);
                window.dispatchEvent(new Event('carritoActualizado'));
                if (usuarioAutenticado) {
                    try { await clienteAxios.post('ventas/carrito/', { items: carritoActualizado }); } catch (err) {}
                }
            }
            // Algo se agotó mientras completaba el formulario: se ajusta el carrito y se le avisa
            if (datos.items) await revisarCarrito(itemsCarrito);
            const detalle = datos.subtotal || datos.items || datos.acepta_terminos;
            setMensaje(detalle ? [].concat(detalle).join(' ') : 'Error al procesar la compra.');
            console.error(datos);
        }
    };

    if (modoAutenticacion == null) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Cargando...</p>;
    if (modoAutenticacion === 'REGISTRO_OBLIGATORIO' && !usuarioAutenticado) return ( <div style={estiloContenedorOpciones}><h2>Finalizar Compra</h2><button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Iniciar sesión o registrarse</button></div> );
    if (modoAutenticacion === 'MIXTO' && !usuarioAutenticado && opcionCompra === null) return ( <div style={estiloContenedorOpciones}><h2>Finalizar Compra</h2><button onClick={() => setOpcionCompra('INVITADO')} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}>Comprar como invitado</button><button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Iniciar sesión o registrarse</button></div> );

    return (
        <div style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h2>Finalizar Compra</h2>
            {mensaje && <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensaje.includes('Éxito') ? '#d4edda' : '#f8d7da', borderRadius: '4px', color: mensaje.includes('Éxito') ? '#155724' : '#721c24' }}>{mensaje}</div>}
            {avisosCarrito.length > 0 && (
                <div role="alert" style={{ padding: '10px 15px', marginBottom: '15px', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '4px', color: '#92400e' }}>
                    <strong>Actualizamos tu carrito:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                        {avisosCarrito.map(aviso => <li key={aviso}>{aviso}</li>)}
                    </ul>
                </div>
            )}

            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Resumen del pedido</h3>
                {itemsCarrito.length > 0 ? itemsCarrito.map((item, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '5px', color: '#4b5563' }}>
                        <span>{item.nombre} (x{item.cantidad})</span><span>${(item.precio * item.cantidad).toLocaleString('es-CL')}</span>
                    </div>
                )) : <p>No hay productos</p>}
                <hr style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}><span>Subtotal:</span><span>${subtotal.toLocaleString('es-CL')}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '6px' }}><span>Costo de envío:</span><span>{cotizando ? 'Calculando...' : `$${costoEnvio.toLocaleString('es-CL')}`}</span></div>
                <hr style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.05rem' }}><span>Total a pagar:</span><span>${totalFinal.toLocaleString('es-CL')}</span></div>
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
                {compraComoInvitado && (
                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="checkout-email" style={{fontWeight: 'bold'}}>Correo electrónico para el recibo y estado de envío:</label>
                        <input id="checkout-email" type="email" autoComplete="email" value={emailInvitado} onChange={(e) => setEmailInvitado(e.target.value)} required style={inputStyle} />
                    </div>
                )}
                
                {/* --- TABS: ¿CÓMO DESEAS RECIBIR TU PEDIDO? --- */}
                <div style={{ marginBottom: '25px' }}>
                    <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '15px' }}>¿Cómo deseas recibir tu pedido?</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'DOMICILIO' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'DOMICILIO' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'DOMICILIO' ? 'bold' : 'normal', textAlign: 'center' }}>
                            <input type="radio" checked={tipoDespacho === 'DOMICILIO'} onChange={() => setTipoDespacho('DOMICILIO')} style={{ display: 'none' }} />
                            A Domicilio
                        </label>
                        <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'SUCURSAL' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'SUCURSAL' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'SUCURSAL' ? 'bold' : 'normal', textAlign: 'center' }}>
                            <input type="radio" checked={tipoDespacho === 'SUCURSAL'} onChange={() => setTipoDespacho('SUCURSAL')} style={{ display: 'none' }} />
                            Sucursal Chilexpress
                        </label>
                        {configTienda?.retiro_en_local_activo && (
                            <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'RETIRO_LOCAL' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'RETIRO_LOCAL' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'RETIRO_LOCAL' ? 'bold' : 'normal', textAlign: 'center' }}>
                                <input type="radio" checked={tipoDespacho === 'RETIRO_LOCAL'} onChange={() => {
                                    setTipoDespacho('RETIRO_LOCAL');
                                    setCostoEnvio(0);
                                    setOpcionesEntrega([{
                                        proveedor: 'RETIRO_LOCAL',
                                        nombre: 'Retiro en Tienda / Local',
                                        tipo: 'RETIRO',
                                        costo_envio: 0
                                    }]);
                                    setOpcionEntregaSeleccionada({
                                        proveedor: 'RETIRO_LOCAL',
                                        nombre: 'Retiro en Tienda / Local',
                                        tipo: 'RETIRO',
                                        costo_envio: 0
                                    });
                                }} style={{ display: 'none' }} />
                                Retiro en Local
                            </label>
                        )}
                    </div>
                </div>

                {/* --- CONTENIDO SEGÚN EL TAB SELECCIONADO --- */}
                {tipoDespacho === 'DOMICILIO' ? (
                    <div style={{ marginBottom: '25px' }}>
                        {usuarioAutenticado && direccionesGuardadas.length > 0 && (
                            <div style={{ marginBottom: '15px' }}>
                                {direccionesGuardadas.map(dir => (
                                    <label key={dir.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === dir.id ? '2px solid #007BFF' : '1px solid #ddd', borderRadius: '6px', marginBottom: '8px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === dir.id ? '#f0f7ff' : 'white' }}>
                                        <input type="radio" checked={direccionSeleccionadaId === dir.id} onChange={() => handleCambioDireccionGuardada(dir.id)} style={{ marginRight: '10px' }} />
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{dir.calle} {dir.calle_numero} {dir.dpto_casa && `- ${dir.dpto_casa}`}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#666' }}>{dir.comuna}, {dir.ciudad}</div>
                                        </div>
                                    </label>
                                ))}
                                <label style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === 'nueva' ? '2px solid #007BFF' : '1px dashed #ccc', borderRadius: '6px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === 'nueva' ? '#f0f7ff' : 'white' }}>
                                    <input type="radio" checked={direccionSeleccionadaId === 'nueva'} onChange={() => handleCambioDireccionGuardada('nueva')} style={{ marginRight: '10px' }} />
                                    <span style={{ fontWeight: 'bold' }}>Ingresar una nueva dirección</span>
                                </label>
                            </div>
                        )}

                        {direccionSeleccionadaId === 'nueva' && (
                            <div style={{ padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <div style={{ flex: 3 }}>
                                        <label htmlFor="checkout-calle" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Calle</label>
                                        <input id="checkout-calle" type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required style={inputStyle} placeholder="Ej: Av. Providencia" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor="checkout-numero" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Número</label>
                                        <input id="checkout-numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label htmlFor="checkout-dpto" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Dpto, Casa o Referencia (Opcional)</label>
                                    <input id="checkout-dpto" type="text" value={dptoCasa} onChange={(e) => setDptoCasa(e.target.value)} style={inputStyle} placeholder="Ej: Depto 505" />
                                </div>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor="checkout-comuna" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Comuna</label>
                                        <select id="checkout-comuna" value={comuna} onChange={(e) => { setComuna(e.target.value); cotizarEnvio(e.target.value); }} required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}>
                                            <option value="">{cargandoComunas ? "Cargando..." : "-- Selecciona --"}</option>
                                            {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor="checkout-ciudad" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Ciudad</label>
                                        <input id="checkout-ciudad" type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)} required style={inputStyle} />
                                    </div>
                                </div>
                                {usuarioAutenticado && (
                                    <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={guardarNuevaDireccion} onChange={(e) => setGuardarNuevaDireccion(e.target.checked)} style={{ marginRight: '8px' }} />
                                        Guardar esta dirección para mis próximas compras
                                    </label>
                                )}
                            </div>
                        )}
                    </div>
                ) : tipoDespacho === 'SUCURSAL' ? (
                    <div style={{ marginBottom: '25px', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '1rem' }}>Elige la sucursal de retiro</h4>
                        <div style={{ marginBottom: '15px' }}>
                            <label htmlFor="checkout-comuna-sucursal" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>¿En qué comuna te encuentras?</label>
                            <select id="checkout-comuna-sucursal" value={comunaSucursal} onChange={(e) => { setComunaSucursal(e.target.value); cotizarEnvio(e.target.value); }} required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}>
                                <option value="">-- Selecciona comuna --</option>
                                {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        
                        {cargandoSucursales ? (
                            <p style={{ color: '#007BFF', fontSize: '0.9rem' }}>Buscando oficinas disponibles...</p>
                        ) : comunaSucursal && sucursalesDisponibles.length === 0 ? (
                            <div style={{ padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontSize: '0.9rem' }}>
                                Lo sentimos, Chilexpress no tiene oficinas disponibles en <strong>{comunaSucursal}</strong>.
                            </div>
                        ) : sucursalesDisponibles.length > 0 && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Oficinas Disponibles</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                    {sucursalesDisponibles.map(suc => (
                                        <label key={suc.codigo} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: sucursalSeleccionada?.codigo === suc.codigo ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: sucursalSeleccionada?.codigo === suc.codigo ? '#f0f7ff' : 'white' }}>
                                            <input type="radio" checked={sucursalSeleccionada?.codigo === suc.codigo} onChange={() => setSucursalSeleccionada(suc)} style={{ marginRight: '12px' }} />
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{suc.nombre}</div>
                                                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{suc.direccion}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ marginBottom: '25px', padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#166534' }}>Retiro Gratuito en Local</h4>
                        <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#15803d' }}>Puedes retirar tu pedido sin costo en nuestra dirección:</p>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#14532d', fontSize: '1.05rem' }}>
                            📍 {configTienda?.calle_origen || 'Av. Principal'} #{configTienda?.numero_origen || '123'} {configTienda?.dpto_casa_origen ? `- ${configTienda.dpto_casa_origen}` : ''}, {configTienda?.comuna_origen || 'Santiago'} ({configTienda?.region_origen || 'Metropolitana'})
                        </p>
                    </div>
                )}

                {/* --- MÉTODOS DE ENTREGA Y PAGO --- */}
                {opcionesEntrega.length > 0 && (
                    <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Costo Logístico</h3>
                        {opcionesEntrega.map((opcion) => (
                            <div key={opcion.proveedor} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '2px solid #007BFF', borderRadius: '6px', backgroundColor: '#f0f7ff' }}>
                                <div>
                                    <strong>{opcion.nombre}</strong>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                        {opcion.tipo === 'RETIRO' ? (tipoDespacho === 'RETIRO_LOCAL' ? 'Retiro en Local Propio' : 'Retiro en Sucursal') : 'Despacho a Domicilio'}
                                    </div>
                                </div>
                                <strong>{Number(opcion.costo_envio).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</strong>
                            </div>
                        ))}
                    </div>
                )}
            
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '20px', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} required style={{ marginTop: '3px' }} />
                    <span>Acepto los {enlaceLegal('TERMINOS', 'Términos y Condiciones')} y la {enlaceLegal('PRIVACIDAD', 'Política de Privacidad')}.</span>
                </label>

                <div style={{ marginTop: '20px' }}>
                    {cargandoPagos ? (
                        <p style={{ color: '#d9534f', fontWeight: 'bold' }}>Cargando métodos de pago...</p>
                    ) : pasarelas.length === 0 ? (
                        <p style={{ color: '#d9534f', fontWeight: 'bold' }}>No hay métodos de pago configurados en la tienda.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {pasarelas.map(pasarela => {
                                const validadoParaPagar = aceptaTerminos && itemsCarrito.length > 0 && !cotizando && opcionEntregaSeleccionada && (tipoDespacho === 'DOMICILIO' || tipoDespacho === 'RETIRO_LOCAL' || (tipoDespacho === 'SUCURSAL' && sucursalSeleccionada));
                                return (
                                    <button
                                        key={pasarela} type="button" onClick={() => procesarPago(pasarela)} disabled={!validadoParaPagar}
                                        style={{ width: '100%', padding: '12px', backgroundColor: validadoParaPagar ? '#007BFF' : '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: validadoParaPagar ? 'pointer' : 'not-allowed', fontSize: '16px', fontWeight: 'bold' }}
                                    >
                                        Pagar con {pasarela}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}