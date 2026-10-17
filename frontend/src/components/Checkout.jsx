import { useState, useEffect, useCallback } from 'react';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';
import { ajustarCarrito, guardarCarrito, interpretarCarrito, leerSnapshotCarrito, vaciarCarrito, validarCarrito } from './carrito';
import useCarrito from '../hooks/useCarrito';
import './Checkout.css';
import Header from './header/header';

const OPCION_RETIRO_LOCAL = {
    proveedor: 'RETIRO_LOCAL', nombre: 'Retiro en Tienda / Local', tipo: 'RETIRO', costo_envio: 0,
};

const calcularCajaDeEnvio = (items) => {
    let pesoTotal = 0, volumenTotal = 0, ladoMasLargo = 0;
    items.forEach(item => {
        const peso = parseFloat(item.peso_kg) || 0.1;
        const alto = parseInt(item.alto_cm, 10) || 10;
        const ancho = parseInt(item.ancho_cm, 10) || 10;
        const largo = parseInt(item.largo_cm, 10) || 10;
        pesoTotal += peso * item.cantidad;
        volumenTotal += alto * ancho * largo * item.cantidad;
        ladoMasLargo = Math.max(ladoMasLargo, alto, ancho, largo);
    });
    return { peso: Number(pesoTotal.toFixed(2)), lado: Math.max(10, ladoMasLargo, Math.ceil(Math.cbrt(volumenTotal))) };
};

// Nombre que ve el comprador para cada código de medio de pago (RN-02: el backend solo envía los disponibles)
const NOMBRES_MEDIO_PAGO = {
    TRANSBANK: 'Webpay (Transbank)',
    MERCADO_PAGO: 'Mercado Pago',
    TRANSFERENCIA: 'Transferencia bancaria'
};

export default function Checkout() {
    return (
        <>
            <Header />
            <main className="checkout-main">
                <CheckoutContenido />
            </main>
        </>
    );
}

function CheckoutContenido() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    const [emailInvitado, setEmailInvitado] = useState('');
    // RF-02.3: quién recibe o retira el pedido (Chilexpress y la tienda lo contactan)
    const [nombreDestinatario, setNombreDestinatario] = useState('');
    const [telefonoDestinatario, setTelefonoDestinatario] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [opcionCompra, setOpcionCompra] = useState(null);
    const itemsCarrito = useCarrito();
    
    // --- CONFIGURACIÓN DE LA TIENDA (LOCAL) ---
    const [configTienda, setConfigTienda] = useState(null);

    // --- ESTADOS DE TIPO DE DESPACHO ---
    const [tipoDespacho, setTipoDespacho] = useState('DOMICILIO'); // 'DOMICILIO' | 'SUCURSAL' | 'RETIRO_LOCAL'
    const [comunaSucursal, setComunaSucursal] = useState('');
    const [resultadoSucursales, setResultadoSucursales] = useState({ comuna: null, items: [] });
    const [sucursalElegida, setSucursalElegida] = useState(null);

    // --- ESTADOS DE DIRECCIÓN DOMICILIO ---
    const [direccionesGuardadas, setDireccionesGuardadas] = useState([]);
    const [direccionSeleccionadaId, setDireccionSeleccionadaId] = useState('nueva');
    const [guardarNuevaDireccion, setGuardarNuevaDireccion] = useState(true);

    const [calle, setCalle] = useState('');
    const [numero, setNumero] = useState('');
    const [dptoCasa, setDptoCasa] = useState('');
    const [comuna, setComuna] = useState('');
    const [ciudad, setCiudad] = useState('');
    const region = '';

    const [listaComunas, setListaComunas] = useState([]);
    const [cargandoComunas, setCargandoComunas] = useState(true);
    const [pasarelas, setPasarelas] = useState([]);
    const [cargandoPagos, setCargandoPagos] = useState(true);

    const [resultadoCotizacion, setResultadoCotizacion] = useState({ clave: null, opcion: null, error: '' });
    // RF-04.4: consentimiento obligatorio, desmarcado por defecto
    const [aceptaTerminos, setAceptaTerminos] = useState(false);
    // Tipos de página legal publicados (ej. 'TERMINOS'), para enlazarlos junto al consentimiento
    const [paginasLegales, setPaginasLegales] = useState([]);
    // Cambios hechos al carrito porque algo se agotó o cambió de precio
    const [revisionCarrito, setRevisionCarrito] = useState({ snapshot: null, avisos: [] });
    const avisosCarrito = revisionCarrito.snapshot === leerSnapshotCarrito() ? revisionCarrito.avisos : [];

    const usuarioAutenticado = !!localStorage.getItem('access_token');
    const navigate = useNavigate();

    // 1. CARGA INICIAL: Configuración de la tienda, Pasarelas y Comunas
    useEffect(() => {
        clienteAxios.get('configuracion/')
            .then(res => {
                const config = Array.isArray(res.data) ? res.data[0] : res.data;
                setPasarelas(config?.pasarelas_activas || []);
                setConfigTienda(config);
            })
            .catch(() => setMensaje('No se pudo cargar la configuración de la tienda.'))
            .finally(() => setCargandoPagos(false));

        clienteAxios.get('ventas/logistica/comunas/')
            .then(res => setListaComunas(res.data.comunas || []))
            .catch(() => setMensaje('No se pudieron cargar las comunas de envío.'))
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

    // Con sesión, quién recibe se precarga con los datos de la cuenta (el comprador puede cambiarlos)
    useEffect(() => {
        if (!usuarioAutenticado) return;
        clienteAxios.get('usuarios/me/')
            .then(({ data }) => {
                // Algunas cuentas (ej. creadas con Google) ya traen el apellido dentro del nombre
                const nombre = (data.nombre || '').trim();
                const apellido = (data.apellido_paterno || '').trim();
                const completo = !apellido || nombre.toLowerCase().includes(apellido.toLowerCase())
                    ? nombre : `${nombre} ${apellido}`;
                setNombreDestinatario(actual => actual || completo);
                setTelefonoDestinatario(actual => actual || data.telefono || '');
            })
            .catch(() => {});
    }, [usuarioAutenticado]);

    // 2. CARGA DE DIRECCIONES GUARDADAS
    // Las direcciones se cargan por sesión, sin reiniciar la elección al cambiar el carrito.
    useEffect(() => {
        let vigente = true;
        if (usuarioAutenticado) {
            clienteAxios.get('ventas/direcciones/')
                .then(res => {
                    if (!vigente) return;
                    const direcciones = res.data;
                    setDireccionesGuardadas(direcciones);
                    if (direcciones.length > 0) {
                        const predeterminada = direcciones.find(d => d.es_predeterminado) || direcciones[0];
                        setDireccionSeleccionadaId(predeterminada.id);
                    }
                })
                .catch(err => console.error(err));
        }
        return () => { vigente = false; };
    }, [usuarioAutenticado]);

    // RN-03: ajusta el carrito al stock y precios vigentes y avisa qué cambió.
    // Si la validación falla, se sigue con el carrito tal cual: el backend revalida al crear la orden.
    const revisarCarrito = useCallback(async () => {
        const snapshot = leerSnapshotCarrito();
        const items = interpretarCarrito(snapshot);
        if (items.length === 0) return null;
        try {
            const ajuste = ajustarCarrito(items, await validarCarrito(items));
            if (snapshot !== leerSnapshotCarrito()) return null;
            if (ajuste.avisos.length > 0 && JSON.stringify(ajuste.items) !== JSON.stringify(items)) {
                return { ...ajuste, snapshot };
            }
        } catch (error) {
            console.error('No se pudo validar el carrito:', error);
        }
        return null;
    }, []);

    // Cada versión se valida; una respuesta anterior no puede reemplazar el carrito actual.
    useEffect(() => {
        let vigente = true;
        revisarCarrito().then(ajuste => {
            if (!vigente || !ajuste || ajuste.snapshot !== leerSnapshotCarrito()) return;
            setRevisionCarrito({ snapshot: JSON.stringify(ajuste.items), avisos: ajuste.avisos });
            guardarCarrito(ajuste.items);
        });
        return () => { vigente = false; };
    }, [itemsCarrito, revisarCarrito]);

    // Las sucursales y su selección pertenecen a una comuna concreta.
    useEffect(() => {
        if (tipoDespacho !== 'SUCURSAL' || !comunaSucursal) return;
        let vigente = true;
        const controller = new AbortController();
        clienteAxios.get(`ventas/logistica/sucursales/?comuna=${encodeURIComponent(comunaSucursal)}`, { signal: controller.signal })
            .then(res => {
                if (vigente) setResultadoSucursales({ comuna: comunaSucursal, items: res.data.sucursales || [] });
            })
            .catch(() => {
                if (vigente) setResultadoSucursales({ comuna: comunaSucursal, items: [] });
            });
        return () => { vigente = false; controller.abort(); };
    }, [comunaSucursal, tipoDespacho]);

    const sucursalesDisponibles = resultadoSucursales.comuna === comunaSucursal ? resultadoSucursales.items : [];
    const cargandoSucursales = tipoDespacho === 'SUCURSAL' && !!comunaSucursal && resultadoSucursales.comuna !== comunaSucursal;
    const sucursalSeleccionada = sucursalElegida?.comuna === comunaSucursal ? sucursalElegida : null;
    const direccionGuardada = direccionesGuardadas.find(dir => dir.id === direccionSeleccionadaId);
    const destinoEnvio = tipoDespacho === 'SUCURSAL' ? comunaSucursal
        : tipoDespacho === 'DOMICILIO' ? (direccionSeleccionadaId === 'nueva' ? comuna : direccionGuardada?.comuna || '') : '';
    const claveCotizacion = destinoEnvio.trim() && itemsCarrito.length > 0
        ? JSON.stringify([tipoDespacho, destinoEnvio.trim().toUpperCase(), itemsCarrito]) : null;

    // El estado de carga se deriva de la clave: nunca se ofrece la cotización de otro carrito.
    useEffect(() => {
        if (!claveCotizacion) return;
        const [tipo, destino, items] = JSON.parse(claveCotizacion);
        const medidas = calcularCajaDeEnvio(items);
        let vigente = true;
        const controller = new AbortController();
        clienteAxios.post('ventas/logistica/cotizar/', {
            destino, peso: medidas.peso, alto: medidas.lado, ancho: medidas.lado, largo: medidas.lado,
        }, { signal: controller.signal })
            .then(({ data }) => {
                if (!vigente) return;
                setResultadoCotizacion({
                    clave: claveCotizacion,
                    opcion: {
                        proveedor: data.proveedor.toUpperCase(), nombre: `Chilexpress - ${data.tiempo_estimado}`,
                        tipo: tipo === 'SUCURSAL' ? 'RETIRO' : 'DOMICILIO', costo_envio: Number(data.precio),
                    },
                    error: '',
                });
            })
            .catch(error => {
                if (vigente) setResultadoCotizacion({
                    clave: claveCotizacion, opcion: null,
                    error: error.response?.data?.error || 'No se pudo calcular el costo de envío.',
                });
            });
        return () => { vigente = false; controller.abort(); };
    }, [claveCotizacion]);

    const cotizacionVigente = claveCotizacion && resultadoCotizacion.clave === claveCotizacion ? resultadoCotizacion : null;
    const cotizando = !!claveCotizacion && !cotizacionVigente;
    const opcionEntregaSeleccionada = tipoDespacho === 'RETIRO_LOCAL' && itemsCarrito.length > 0
        ? OPCION_RETIRO_LOCAL : cotizacionVigente?.opcion || null;
    const opcionesEntrega = opcionEntregaSeleccionada ? [opcionEntregaSeleccionada] : [];
    const costoEnvio = Number(opcionEntregaSeleccionada?.costo_envio || 0);
    const medidasCaja = calcularCajaDeEnvio(itemsCarrito);
    const cajaCalculada = { peso_kg: String(medidasCaja.peso), alto_cm: String(medidasCaja.lado), ancho_cm: String(medidasCaja.lado), largo_cm: String(medidasCaja.lado) };
    const mensajeVisible = mensaje || cotizacionVigente?.error || '';

    const estiloContenedorOpciones = { maxWidth: '400px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', textAlign: 'center' };
    const inputStyle = { width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' };

    const irALogin = () => { localStorage.setItem('url_anterior_login', window.location.pathname); navigate('/login'); };
    const compraComoInvitado = modoAutenticacion === 'INVITADO' || (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');
    const subtotal = itemsCarrito.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
    const totalFinal = subtotal + costoEnvio;

    const procesarPago = async (metodoSeleccionado) => {
        const snapshotPedido = leerSnapshotCarrito();
        if (itemsCarrito.length === 0) return setMensaje('Tu carrito está vacío.');
        if (!opcionEntregaSeleccionada) return setMensaje('Selecciona una opción de entrega.');
        if (!nombreDestinatario.trim() || !telefonoDestinatario.trim()) return setMensaje('Indica el nombre y el teléfono de quien recibe el pedido.');
        if (!aceptaTerminos) return setMensaje('Debes aceptar los Términos y Condiciones y la Política de Privacidad.');

        let dirSnapshot;
        
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
                // La orden de transporte se entrega en esta oficina de Chilexpress
                codigo_sucursal: sucursalSeleccionada.codigo,
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
        
        if (snapshotPedido !== leerSnapshotCarrito()) {
            return setMensaje('El carrito cambió. Revisa el resumen antes de pagar.');
        }
        setMensaje('Procesando...');

        const payload = {
            metodo_pago: metodoSeleccionado, 
            email_invitado: !usuarioAutenticado && compraComoInvitado ? emailInvitado : null,
            nombre_destinatario: nombreDestinatario.trim(),
            telefono_destinatario: telefonoDestinatario.trim(),
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
                window.location.assign(respuesta.data.url_pago);
            } else {
                if (snapshotPedido === leerSnapshotCarrito()) await vaciarCarrito();
                // Sin pasarela (ej. transferencia) la orden queda Pendiente; el invitado no tiene /mis-pedidos
                // Con transferencia, el backend envía los datos bancarios para mostrarlos de inmediato
                navigate(`/pedido-recibido?orden=${encodeURIComponent(respuesta.data.orden_id)}`, {
                    replace: true,
                    state: { instrucciones: respuesta.data.instrucciones_pago || null }
                });
            }
        } catch (error) {
            const datos = error.response?.data || {};

            // Si cambiaron los precios, se actualiza el carrito para que el comprador vea el nuevo total
            if (datos.precios_vigentes && snapshotPedido === leerSnapshotCarrito()) {
                const carritoActualizado = itemsCarrito.map(item => {
                    const vigente = datos.precios_vigentes.find(p => p.variante_sku === item.sku);
                    return vigente ? { ...item, precio: vigente.precio } : item;
                });
                await guardarCarrito(carritoActualizado);
            }

            // Algo se agotó mientras completaba el formulario: se ajusta el carrito y se le avisa
            if (datos.items) {
                const ajuste = await revisarCarrito();
                if (ajuste && ajuste.snapshot === leerSnapshotCarrito()) {
                    setRevisionCarrito({ snapshot: JSON.stringify(ajuste.items), avisos: ajuste.avisos });
                    await guardarCarrito(ajuste.items);
                }
            }
            const detalle = datos.subtotal || datos.items || datos.acepta_terminos || datos.metodo_pago
                || datos.nombre_destinatario || datos.telefono_destinatario;
            setMensaje(detalle ? [].concat(detalle).join(' ') : 'Error al procesar la compra.');
            console.error(datos);
        }
    };

    if (modoAutenticacion == null) return <p role={mensaje ? 'alert' : undefined} style={{ textAlign: 'center', marginTop: '50px' }}>{mensaje || 'Cargando...'}</p>;
    if (modoAutenticacion === 'REGISTRO_OBLIGATORIO' && !usuarioAutenticado) return ( <div className="checkout-card" style={estiloContenedorOpciones}><h1 className="checkout-titulo">Finalizar Compra</h1><button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Iniciar sesión o registrarse</button></div> );
    if (modoAutenticacion === 'MIXTO' && !usuarioAutenticado && opcionCompra === null) return ( <div className="checkout-card" style={estiloContenedorOpciones}><h1 className="checkout-titulo">Finalizar Compra</h1><button onClick={() => setOpcionCompra('INVITADO')} style={{ width: '100%', padding: '10px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}>Comprar como invitado</button><button onClick={irALogin} style={{ width: '100%', padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Iniciar sesión o registrarse</button></div> );

    return (
        <div className="checkout-card" style={{ maxWidth: '600px', margin: '40px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif' }}>
            <h1 className="checkout-titulo">Finalizar Compra</h1>
            {mensajeVisible && <div role="status" style={{ padding: '10px', marginBottom: '15px', backgroundColor: mensajeVisible.includes('Éxito') ? '#d4edda' : '#f8d7da', borderRadius: '4px', color: mensajeVisible.includes('Éxito') ? '#155724' : '#721c24' }}>{mensajeVisible}</div>}
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
                {itemsCarrito.length > 0 ? itemsCarrito.map((item) => (
                    <div className="checkout-resumen-linea" key={`${item.id}|${item.sku}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '5px', color: '#4b5563' }}>
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

                <fieldset className="checkout-grupo" style={{ marginBottom: '25px' }}>
                    <legend style={{ width: '100%', padding: 0 }}>
                        <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '15px' }}>¿Quién recibe el pedido?</h3>
                    </legend>
                    <div style={{ marginBottom: '15px' }}>
                        <label htmlFor="checkout-destinatario" style={{ fontWeight: 'bold' }}>Nombre de quien recibe o retira</label>
                        <input id="checkout-destinatario" type="text" autoComplete="name" maxLength={120} value={nombreDestinatario} onChange={(e) => setNombreDestinatario(e.target.value)} required style={inputStyle} />
                    </div>
                    <div>
                        <label htmlFor="checkout-telefono" style={{ fontWeight: 'bold' }}>Teléfono de contacto</label>
                        <input id="checkout-telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={telefonoDestinatario} onChange={(e) => setTelefonoDestinatario(e.target.value)} required aria-describedby="checkout-telefono-ayuda" placeholder="+56 9 1234 5678" style={inputStyle} />
                        <p id="checkout-telefono-ayuda" style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#4b5563' }}>
                            Teléfono chileno de 9 dígitos. Lo usamos solo para coordinar la entrega.
                        </p>
                    </div>
                </fieldset>
                
                {/* --- TABS: ¿CÓMO DESEAS RECIBIR TU PEDIDO? --- */}
                <fieldset className="checkout-grupo" style={{ marginBottom: '25px' }}>
                    <legend style={{ width: '100%', padding: 0 }}>
                        <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginBottom: '15px' }}>¿Cómo deseas recibir tu pedido?</h3>
                    </legend>
                    <div className="checkout-fila" style={{ display: 'flex', gap: '10px' }}>
                        <label className="checkout-opcion" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'DOMICILIO' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'DOMICILIO' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'DOMICILIO' ? 'bold' : 'normal', textAlign: 'center' }}>
                            <input type="radio" name="tipo-despacho" value="DOMICILIO" checked={tipoDespacho === 'DOMICILIO'} onChange={() => setTipoDespacho('DOMICILIO')} className="checkout-radio-oculto" />
                            A Domicilio
                        </label>
                        <label className="checkout-opcion" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'SUCURSAL' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'SUCURSAL' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'SUCURSAL' ? 'bold' : 'normal', textAlign: 'center' }}>
                            <input type="radio" name="tipo-despacho" value="SUCURSAL" checked={tipoDespacho === 'SUCURSAL'} onChange={() => setTipoDespacho('SUCURSAL')} className="checkout-radio-oculto" />
                            Sucursal Chilexpress
                        </label>
                        {configTienda?.retiro_en_local_activo && (
                            <label className="checkout-opcion" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '10px', border: tipoDespacho === 'RETIRO_LOCAL' ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', backgroundColor: tipoDespacho === 'RETIRO_LOCAL' ? '#f0f7ff' : 'white', fontSize: '0.85rem', fontWeight: tipoDespacho === 'RETIRO_LOCAL' ? 'bold' : 'normal', textAlign: 'center' }}>
                                <input type="radio" name="tipo-despacho" value="RETIRO_LOCAL" checked={tipoDespacho === 'RETIRO_LOCAL'} onChange={() => setTipoDespacho('RETIRO_LOCAL')} className="checkout-radio-oculto" />
                                Retiro en Local
                            </label>
                        )}
                    </div>
                </fieldset>

                {/* --- CONTENIDO SEGÚN EL TAB SELECCIONADO --- */}
                {tipoDespacho === 'DOMICILIO' ? (
                    <div style={{ marginBottom: '25px' }}>
                        {usuarioAutenticado && direccionesGuardadas.length > 0 && (
                            <fieldset className="checkout-grupo" style={{ marginBottom: '15px' }}>
                                <legend className="checkout-solo-lector">Dirección de envío</legend>
                                {direccionesGuardadas.map(dir => (
                                    <label key={dir.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === dir.id ? '2px solid #007BFF' : '1px solid #ddd', borderRadius: '6px', marginBottom: '8px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === dir.id ? '#f0f7ff' : 'white' }}>
                                        <input type="radio" name="direccion-envio" value={dir.id} checked={direccionSeleccionadaId === dir.id} onChange={() => setDireccionSeleccionadaId(dir.id)} style={{ marginRight: '10px' }} />
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{dir.calle} {dir.calle_numero} {dir.dpto_casa && `- ${dir.dpto_casa}`}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#666' }}>{dir.comuna}, {dir.ciudad}</div>
                                        </div>
                                    </label>
                                ))}
                                <label style={{ display: 'flex', alignItems: 'center', padding: '12px', border: direccionSeleccionadaId === 'nueva' ? '2px solid #007BFF' : '1px dashed #ccc', borderRadius: '6px', cursor: 'pointer', backgroundColor: direccionSeleccionadaId === 'nueva' ? '#f0f7ff' : 'white' }}>
                                    <input type="radio" name="direccion-envio" value="nueva" checked={direccionSeleccionadaId === 'nueva'} onChange={() => setDireccionSeleccionadaId('nueva')} style={{ marginRight: '10px' }} />
                                    <span style={{ fontWeight: 'bold' }}>Ingresar una nueva dirección</span>
                                </label>
                            </fieldset>
                        )}

                        {direccionSeleccionadaId === 'nueva' && (
                            <div style={{ padding: '15px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                <div className="checkout-fila" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
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
                                <div className="checkout-fila" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label htmlFor="checkout-comuna" style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Comuna</label>
                                        <select id="checkout-comuna" value={comuna} onChange={(e) => { setComuna(e.target.value); setMensaje(''); }} required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}>
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
                            <select id="checkout-comuna-sucursal" value={comunaSucursal} onChange={(e) => { setComunaSucursal(e.target.value); setSucursalElegida(null); setMensaje(''); }} required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}>
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
                            <fieldset className="checkout-grupo" style={{ marginBottom: '15px' }}>
                                <legend style={{ fontSize: '0.9rem', fontWeight: 'bold', padding: 0 }}>Oficinas Disponibles</legend>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                    {sucursalesDisponibles.map(suc => (
                                        <label key={suc.codigo} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: sucursalSeleccionada?.codigo === suc.codigo ? '2px solid #007BFF' : '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', backgroundColor: sucursalSeleccionada?.codigo === suc.codigo ? '#f0f7ff' : 'white' }}>
                                            <input type="radio" name="sucursal" value={suc.codigo} checked={sucursalSeleccionada?.codigo === suc.codigo} onChange={() => setSucursalElegida({ ...suc, comuna: comunaSucursal })} style={{ marginRight: '12px' }} />
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{suc.nombre}</div>
                                                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{suc.direccion}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
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
                                const validadoParaPagar = aceptaTerminos && nombreDestinatario.trim() && telefonoDestinatario.trim() && itemsCarrito.length > 0 && !cotizando && opcionEntregaSeleccionada && (tipoDespacho === 'DOMICILIO' || tipoDespacho === 'RETIRO_LOCAL' || (tipoDespacho === 'SUCURSAL' && sucursalSeleccionada));
                                return (
                                    <button
                                        key={pasarela} type="button" onClick={() => procesarPago(pasarela)} disabled={!validadoParaPagar}
                                        style={{ width: '100%', padding: '12px', backgroundColor: validadoParaPagar ? '#007BFF' : '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: validadoParaPagar ? 'pointer' : 'not-allowed', fontSize: '16px', fontWeight: 'bold' }}
                                    >
                                        Pagar con {NOMBRES_MEDIO_PAGO[pasarela] || pasarela}
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
