import { useState, useEffect, useCallback, useRef } from 'react';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';
import { ajustarCarrito, guardarCarrito, interpretarCarrito, leerSnapshotCarrito, vaciarCarrito, validarCarrito } from './carrito';
import useCarrito from '../hooks/useCarrito';
import './Checkout.css';
import Header from './header/header';
import Dialogo from './Dialogo';

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

// Orden de Mercado Pago que espera su pago. El token firmado que entrega el checkout prueba que la creó este
// navegador: sin él, verificar-pago no responde (los números de orden son correlativos y se podrían adivinar)
const consultarPagoPendiente = (idOrden) => clienteAxios.get('ventas/checkout/verificar-pago/', {
    params: { orden_id: idOrden, token: localStorage.getItem('orden_pendiente_token') }
});

const olvidarOrdenPendiente = () => {
    localStorage.removeItem('orden_pendiente_pago');
    localStorage.removeItem('orden_pendiente_token');
};

export default function Checkout() {
    return (
        <>
            <Header />
            <main tabIndex={-1} id="contenido" className="checkout-main">
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
    const [errorReglas, setErrorReglas] = useState(false);
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

    // Vista previa del cupón ({ tipo, valor, codigo }) y el código que se envía al checkout
    const [descuentoAplicado, setDescuentoAplicado] = useState(null);
    const [codigoValidado, setCodigoValidado] = useState(null);
    const [umbralEnvioGratis, setUmbralEnvioGratis] = useState(null);
    const [codigoInput, setCodigoInput] = useState('');
    const [resultadoCotizacion, setResultadoCotizacion] = useState({ clave: null, opcion: null, error: '' });
    // RF-04.4: consentimiento obligatorio, desmarcado por defecto
    const [aceptaTerminos, setAceptaTerminos] = useState(false);
    // Tipos de página legal publicados (ej. 'TERMINOS'), para enlazarlos junto al consentimiento
    const [paginasLegales, setPaginasLegales] = useState([]);
    // Cambios hechos al carrito porque algo se agotó o cambió de precio
    const [revisionCarrito, setRevisionCarrito] = useState({ snapshot: null, avisos: [] });
    const avisosCarrito = revisionCarrito.snapshot === leerSnapshotCarrito() ? revisionCarrito.avisos : [];

    const usuarioAutenticado = !!localStorage.getItem('access_token');
    const [esperandoPago, setEsperandoPago] = useState(null);
    const [mostrarDialogoPago, setMostrarDialogoPago] = useState(false);
    const consultaEnCurso = useRef(false);
    const botonReabrirPago = useRef(null);
    const cerrarAvisoPago = () => {
        setMostrarDialogoPago(false);
        // El disparador original queda deshabilitado mientras existe una orden pendiente.
        // Esperamos a que aparezca la acción que permite reabrir el mismo aviso.
        requestAnimationFrame(() => botonReabrirPago.current?.focus());
    };
    const [verificando, setVerificando] = useState(false);
    const [procesandoPago, setProcesandoPago] = useState(false);
    const navigate = useNavigate();

    const verificarEstadoOrden = useCallback(async (idOrden) => {
        if (!idOrden || consultaEnCurso.current) return;
        consultaEnCurso.current = true;
        setVerificando(true);
        try {
            const res = await consultarPagoPendiente(idOrden);
            if (res.data.pagado) {
                localStorage.removeItem('carrito_local');
                olvidarOrdenPendiente();
                window.dispatchEvent(new Event('carritoActualizado'));
                if (usuarioAutenticado) {
                    try { await clienteAxios.post('ventas/carrito/', { items: [] }); } catch { /* vaciado silencioso */ }
                }
                const sufijoRevision = res.data.requiere_revision ? '&revision=1' : '';
                navigate(`/pago-exitoso?orden=${idOrden}${sufijoRevision}`);
            } else if (res.data.cancelado) {
                setEsperandoPago(null);
                olvidarOrdenPendiente();
                setMensaje('La orden fue cancelada o rechazada.');
            }
        } catch (err) {
            console.error('Error verificando pago:', err);
        } finally {
            consultaEnCurso.current = false;
            setVerificando(false);
        }
    }, [usuarioAutenticado, navigate]);

    // Polling cada 3 segundos si esperandoPago está activo
    useEffect(() => {
        if (!esperandoPago?.ordenId) return;
        const interval = setInterval(() => {
            verificarEstadoOrden(esperandoPago.ordenId);
        }, 3000);
        return () => clearInterval(interval);
    }, [esperandoPago?.ordenId, verificarEstadoOrden]);

    // Verificación de orden pendiente al cargar la página
    useEffect(() => {
        const ordenPendiente = localStorage.getItem('orden_pendiente_pago');
        if (ordenPendiente) {
            consultarPagoPendiente(ordenPendiente)
                .then(res => {
                    if (res.data.pagado) {
                        localStorage.removeItem('carrito_local');
                        olvidarOrdenPendiente();
                        window.dispatchEvent(new Event('carritoActualizado'));
                        const sufijoRevision = res.data.requiere_revision ? '&revision=1' : '';
                        navigate(`/pago-exitoso?orden=${ordenPendiente}${sufijoRevision}`);
                    }
                })
                .catch(() => {});
        }
    }, [navigate]);

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
            .then(res => {
                setModoAutenticacion(res.data.modo_autenticacion);
            })
            .catch(() => {
                setMensaje('No se pudieron cargar las opciones de compra.');
                setErrorReglas(true);
            });

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


    const irALogin = () => { localStorage.setItem('url_anterior_login', window.location.pathname); navigate('/login'); };

    const compraComoInvitado = modoAutenticacion === 'INVITADO' || (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');
    const subtotal = itemsCarrito.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0);
    let montoDescuento = 0;
    if (descuentoAplicado) {
        if (descuentoAplicado.tipo === 'PORCENTAJE') {
            montoDescuento = subtotal * (descuentoAplicado.valor / 100);
        } else if (descuentoAplicado.tipo === 'MONTO_FIJO') {
            montoDescuento = descuentoAplicado.valor;
        }
    }

    const tieneEnvioGratisCupon = Boolean(
        codigoValidado &&
        umbralEnvioGratis !== null &&
        subtotal >= umbralEnvioGratis
    );
    const costoEnvioFinal = tieneEnvioGratisCupon ? 0 : costoEnvio;
    const totalFinal = Math.max(0, subtotal - montoDescuento) + costoEnvioFinal;

    // El cupón se valida en el servidor (vigencia incluida) y su código viaja en el checkout, donde el
    // servidor vuelve a validarlo y lo descuenta del total: lo que se muestra aquí es solo una vista previa
    const aplicarCodigo = async () => {
        const codigo = codigoInput.trim().toUpperCase();
        if (!codigo) return;

        try {
            const respuesta = await clienteAxios.post('ventas/promociones/validar/', { codigo, subtotal });
            const umbral = respuesta.data.umbral_envio_gratis;

            setDescuentoAplicado({
                tipo: respuesta.data.tipo_descuento,
                valor: Number(respuesta.data.valor_descuento),
                codigo: respuesta.data.codigo
            });
            setCodigoValidado(respuesta.data.codigo);
            setUmbralEnvioGratis(umbral === null || umbral === undefined ? null : Number(umbral));
            setMensaje('¡Código aplicado con Éxito!');
        } catch (error) {
            setDescuentoAplicado(null);
            setCodigoValidado(null);
            setUmbralEnvioGratis(null);
            setMensaje(error.response?.data?.error || 'Código inválido o expirado.');
        }
    };
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
        
        if (procesandoPago) return;
        if (snapshotPedido !== leerSnapshotCarrito()) {
            return setMensaje('El carrito cambió. Revisa el resumen antes de pagar.');
        }
        setProcesandoPago(true);
        setMensaje('Procesando...');

        const payload = {
            metodo_pago: metodoSeleccionado, 
            email_invitado: !usuarioAutenticado && compraComoInvitado ? emailInvitado : null,
            nombre_destinatario: nombreDestinatario.trim(),
            telefono_destinatario: telefonoDestinatario.trim(),
            direccion_envio_snapshot: dirSnapshot, 
            subtotal, 
            costo_envio: costoEnvioFinal, 
            total_final: totalFinal,
            proveedor_logistico: opcionEntregaSeleccionada.proveedor, 
            paquete: tipoDespacho === 'RETIRO_LOCAL' ? undefined : cajaCalculada,
            acepta_terminos: aceptaTerminos,
            codigo_promocion: codigoValidado,
            items: itemsCarrito.map(item => ({ producto_mongo_id: item.id, variante_sku: item.sku, nombre_producto_snapshot: item.nombre, precio_unitario_snapshot: item.precio, cantidad: item.cantidad }))
        };
        try {
            const respuesta = await clienteAxios.post('ventas/checkout/', payload);

            if (respuesta.data.url_pago) {
                if (metodoSeleccionado === 'MERCADO_PAGO') {
                    localStorage.setItem('orden_pendiente_pago', respuesta.data.orden_id);
                    localStorage.setItem('orden_pendiente_token', respuesta.data.token_verificacion);
                    setEsperandoPago({ ordenId: respuesta.data.orden_id, urlPago: respuesta.data.url_pago });
                    setMostrarDialogoPago(true);
                    const ventana = window.open(respuesta.data.url_pago, '_blank');
                    if (!ventana) {
                        window.location.assign(respuesta.data.url_pago);
                    }
                } else {
                    window.location.assign(respuesta.data.url_pago);
                }
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
        } finally {
            setProcesandoPago(false);
        }
    };

    if (modoAutenticacion == null) {
        if (errorReglas) {
            return (
                <p role="alert" className="checkout-estado">
                    No se pudieron cargar las opciones de compra.
                </p>
            );
        }

        return (
            <p role={mensaje ? 'alert' : undefined} className="checkout-estado">
                {mensaje || 'Cargando...'}
            </p>
        );
    }

    // RN-04: según el modo de la tienda, primero se elige cómo comprar
    if (modoAutenticacion === 'REGISTRO_OBLIGATORIO' && !usuarioAutenticado) return (
        <div className="checkout-card checkout-acceso">
            <span className="antetitulo">Compra segura</span>
            <h1 className="checkout-titulo">Finalizar Compra</h1>
            <p className="texto-secundario">Para comprar en esta tienda necesitas una cuenta.</p>
            <button type="button" className="boton boton-primario" onClick={irALogin}>Iniciar sesión o registrarse</button>
        </div>
    );
    if (modoAutenticacion === 'MIXTO' && !usuarioAutenticado && opcionCompra === null) return (
        <div className="checkout-card checkout-acceso">
            <span className="antetitulo">Compra segura</span>
            <h1 className="checkout-titulo">Finalizar Compra</h1>
            <p className="texto-secundario">Puedes comprar solo con tu correo o entrar a tu cuenta.</p>
            <button type="button" className="boton boton-primario" onClick={() => setOpcionCompra('INVITADO')}>Comprar como invitado</button>
            <button type="button" className="boton boton-contorno" onClick={irALogin}>Iniciar sesión o registrarse</button>
        </div>
    );

    const claseOpcion = (elegida) => `checkout-opcion${elegida ? ' checkout-opcion--elegida' : ''}`;
    const exito = mensajeVisible.includes('Éxito');

    return (
        <div className="checkout-card checkout">
            <div className="checkout-encabezado">
                <span className="antetitulo">Compra segura</span>
                <h1 className="checkout-titulo">Finalizar Compra</h1>
            </div>

            {mensajeVisible && (
                <div role="status" className={`checkout-aviso ${exito ? 'checkout-aviso--exito' : 'checkout-aviso--error'}`}>
                    {mensajeVisible}
                </div>
            )}
            {avisosCarrito.length > 0 && (
                <div role="alert" className="checkout-aviso checkout-aviso--advertencia">
                    <strong>Actualizamos tu carrito:</strong>
                    <ul>
                        {avisosCarrito.map(aviso => <li key={aviso}>{aviso}</li>)}
                    </ul>
                </div>
            )}

            <div className="checkout-columnas">
                <form className="checkout-formulario" onSubmit={(e) => e.preventDefault()}>
                    {compraComoInvitado && (
                        <section className="checkout-seccion" aria-labelledby="checkout-paso-contacto">
                            <h2 id="checkout-paso-contacto" className="checkout-paso">Contacto</h2>
                            <div className="checkout-campo">
                                <label htmlFor="checkout-email">Correo electrónico para el recibo y estado de envío:</label>
                                <input id="checkout-email" type="email" autoComplete="email" value={emailInvitado} onChange={(e) => setEmailInvitado(e.target.value)} required />
                            </div>
                        </section>
                    )}

                    <fieldset className="checkout-grupo checkout-seccion">
                        <legend className="checkout-paso">¿Quién recibe el pedido?</legend>
                        <div className="checkout-campo">
                            <label htmlFor="checkout-destinatario">Nombre de quien recibe o retira</label>
                            <input id="checkout-destinatario" type="text" autoComplete="name" maxLength={120} value={nombreDestinatario} onChange={(e) => setNombreDestinatario(e.target.value)} required />
                        </div>
                        <div className="checkout-campo">
                            <label htmlFor="checkout-telefono">Teléfono de contacto</label>
                            <input id="checkout-telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={telefonoDestinatario} onChange={(e) => setTelefonoDestinatario(e.target.value)} required aria-describedby="checkout-telefono-ayuda" placeholder="+56 9 1234 5678" />
                            <p id="checkout-telefono-ayuda" className="checkout-ayuda">
                                Teléfono chileno de 9 dígitos. Lo usamos solo para coordinar la entrega.
                            </p>
                        </div>
                    </fieldset>

                    {/* --- ¿CÓMO DESEAS RECIBIR TU PEDIDO? --- */}
                    <fieldset className="checkout-grupo checkout-seccion">
                        <legend className="checkout-paso">¿Cómo deseas recibir tu pedido?</legend>
                        <div className="checkout-fila checkout-opciones">
                            <label className={claseOpcion(tipoDespacho === 'DOMICILIO')}>
                                <input type="radio" name="tipo-despacho" value="DOMICILIO" checked={tipoDespacho === 'DOMICILIO'} onChange={() => setTipoDespacho('DOMICILIO')} className="checkout-radio-oculto" />
                                A Domicilio
                            </label>
                            <label className={claseOpcion(tipoDespacho === 'SUCURSAL')}>
                                <input type="radio" name="tipo-despacho" value="SUCURSAL" checked={tipoDespacho === 'SUCURSAL'} onChange={() => setTipoDespacho('SUCURSAL')} className="checkout-radio-oculto" />
                                Sucursal Chilexpress
                            </label>
                            {configTienda?.retiro_en_local_activo && (
                                <label className={claseOpcion(tipoDespacho === 'RETIRO_LOCAL')}>
                                    <input type="radio" name="tipo-despacho" value="RETIRO_LOCAL" checked={tipoDespacho === 'RETIRO_LOCAL'} onChange={() => setTipoDespacho('RETIRO_LOCAL')} className="checkout-radio-oculto" />
                                    Retiro en Local
                                </label>
                            )}
                        </div>

                        {/* --- CONTENIDO SEGÚN LA FORMA DE ENTREGA --- */}
                        {tipoDespacho === 'DOMICILIO' ? (
                            <div className="checkout-entrega">
                                {usuarioAutenticado && direccionesGuardadas.length > 0 && (
                                    <fieldset className="checkout-grupo checkout-direcciones">
                                        <legend className="checkout-solo-lector">Dirección de envío</legend>
                                        {direccionesGuardadas.map(dir => (
                                            <label key={dir.id} className={claseOpcion(direccionSeleccionadaId === dir.id) + ' checkout-opcion--fila'}>
                                                <input type="radio" name="direccion-envio" value={dir.id} checked={direccionSeleccionadaId === dir.id} onChange={() => setDireccionSeleccionadaId(dir.id)} />
                                                <span>
                                                    <strong>{dir.calle} {dir.calle_numero} {dir.dpto_casa && `- ${dir.dpto_casa}`}</strong>
                                                    <span className="checkout-ayuda">{dir.comuna}, {dir.ciudad}</span>
                                                </span>
                                            </label>
                                        ))}
                                        <label className={claseOpcion(direccionSeleccionadaId === 'nueva') + ' checkout-opcion--fila'}>
                                            <input type="radio" name="direccion-envio" value="nueva" checked={direccionSeleccionadaId === 'nueva'} onChange={() => setDireccionSeleccionadaId('nueva')} />
                                            <strong>Ingresar una nueva dirección</strong>
                                        </label>
                                    </fieldset>
                                )}

                                {direccionSeleccionadaId === 'nueva' && (
                                    <div className="checkout-direccion-nueva">
                                        <div className="checkout-fila">
                                            <div className="checkout-campo checkout-campo--ancho">
                                                <label htmlFor="checkout-calle">Calle</label>
                                                <input id="checkout-calle" type="text" value={calle} onChange={(e) => setCalle(e.target.value)} required placeholder="Ej: Av. Providencia" />
                                            </div>
                                            <div className="checkout-campo">
                                                <label htmlFor="checkout-numero">Número</label>
                                                <input id="checkout-numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required />
                                            </div>
                                        </div>
                                        <div className="checkout-campo">
                                            <label htmlFor="checkout-dpto">Dpto, Casa o Referencia (Opcional)</label>
                                            <input id="checkout-dpto" type="text" value={dptoCasa} onChange={(e) => setDptoCasa(e.target.value)} placeholder="Ej: Depto 505" />
                                        </div>
                                        <div className="checkout-fila">
                                            <div className="checkout-campo">
                                                <label htmlFor="checkout-comuna">Comuna</label>
                                                <select id="checkout-comuna" value={comuna} onChange={(e) => { setComuna(e.target.value); setMensaje(''); }} required disabled={cargandoComunas}>
                                                    <option value="">{cargandoComunas ? "Cargando..." : "-- Selecciona --"}</option>
                                                    {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div className="checkout-campo">
                                                <label htmlFor="checkout-ciudad">Ciudad</label>
                                                <input id="checkout-ciudad" type="text" value={ciudad} onChange={(e) => setCiudad(e.target.value)} required />
                                            </div>
                                        </div>
                                        {usuarioAutenticado && (
                                            <label className="checkout-casilla">
                                                <input type="checkbox" checked={guardarNuevaDireccion} onChange={(e) => setGuardarNuevaDireccion(e.target.checked)} />
                                                Guardar esta dirección para mis próximas compras
                                            </label>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : tipoDespacho === 'SUCURSAL' ? (
                            <div className="checkout-entrega">
                                <div className="checkout-campo">
                                    <label htmlFor="checkout-comuna-sucursal">¿En qué comuna te encuentras?</label>
                                    <select id="checkout-comuna-sucursal" value={comunaSucursal} onChange={(e) => { setComunaSucursal(e.target.value); setSucursalElegida(null); setMensaje(''); }} required disabled={cargandoComunas}>
                                        <option value="">-- Selecciona comuna --</option>
                                        {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>

                                {cargandoSucursales ? (
                                    <p className="checkout-ayuda" role="status">Buscando oficinas disponibles...</p>
                                ) : comunaSucursal && sucursalesDisponibles.length === 0 ? (
                                    <div className="checkout-aviso checkout-aviso--error">
                                        Lo sentimos, Chilexpress no tiene oficinas disponibles en <strong>{comunaSucursal}</strong>.
                                    </div>
                                ) : sucursalesDisponibles.length > 0 && (
                                    <fieldset className="checkout-grupo checkout-direcciones">
                                        <legend className="checkout-etiqueta">Oficinas disponibles</legend>
                                        {sucursalesDisponibles.map(suc => (
                                            <label key={suc.codigo} className={claseOpcion(sucursalSeleccionada?.codigo === suc.codigo) + ' checkout-opcion--fila'}>
                                                <input type="radio" name="sucursal" value={suc.codigo} checked={sucursalSeleccionada?.codigo === suc.codigo} onChange={() => setSucursalElegida({ ...suc, comuna: comunaSucursal })} />
                                                <span>
                                                    <strong>{suc.nombre}</strong>
                                                    <span className="checkout-ayuda">{suc.direccion}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </fieldset>
                                )}
                            </div>
                        ) : (
                            <div className="checkout-entrega checkout-retiro">
                                <p className="checkout-etiqueta">Retiro gratuito en local</p>
                                <p className="checkout-ayuda">Puedes retirar tu pedido sin costo en nuestra dirección:</p>
                                <p className="checkout-retiro-direccion">
                                    {configTienda?.calle_origen || 'Av. Principal'} #{configTienda?.numero_origen || '123'} {configTienda?.dpto_casa_origen ? `- ${configTienda.dpto_casa_origen}` : ''}, {configTienda?.comuna_origen || 'Santiago'} ({configTienda?.region_origen || 'Metropolitana'})
                                </p>
                            </div>
                        )}

                        {/* --- COSTO DE LA ENTREGA ELEGIDA --- */}
                        {opcionesEntrega.length > 0 && (
                            <div className="checkout-logistica">
                                {opcionesEntrega.map((opcion) => (
                                    <div key={opcion.proveedor} className="checkout-logistica-opcion">
                                        <div>
                                            <strong>{opcion.nombre}</strong>
                                            <div className="checkout-ayuda">
                                                {opcion.tipo === 'RETIRO' ? (tipoDespacho === 'RETIRO_LOCAL' ? 'Retiro en Local Propio' : 'Retiro en Sucursal') : 'Despacho a Domicilio'}
                                            </div>
                                        </div>
                                        <strong>{Number(opcion.costo_envio).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })}</strong>
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>
                </form>

                <aside className="checkout-resumen" aria-labelledby="checkout-resumen-titulo">
                    <h2 id="checkout-resumen-titulo" className="checkout-paso">Resumen del pedido</h2>
                    <div className="checkout-resumen-lineas">
                        {itemsCarrito.length > 0 ? itemsCarrito.map((item) => (
                            <div className="checkout-resumen-linea" key={`${item.id}|${item.sku}`}>
                                <span>{item.nombre} (x{item.cantidad})</span><span>${(item.precio * item.cantidad).toLocaleString('es-CL')}</span>
                            </div>
                        )) : <p>No hay productos</p>}
                    </div>

                    <div className="checkout-cupon">
                        <input
                            className="input-cupon"
                            type="text"
                            placeholder="Cupón de descuento"
                            aria-label="Cupón de descuento"
                            value={codigoInput}
                            onChange={(e) => setCodigoInput(e.target.value.toUpperCase())}
                        />
                        <button type="button" className="boton-edicion checkout-cupon-boton" onClick={aplicarCodigo}>
                            Aplicar
                        </button>
                    </div>

                    <div className="checkout-totales">
                        <div className="checkout-total-linea"><span>Subtotal:</span><span>${subtotal.toLocaleString('es-CL')}</span></div>

                        {montoDescuento > 0 && (
                            <div className="checkout-total-linea checkout-total-linea--descuento">
                                <span>Descuento {descuentoAplicado?.codigo ? `(${descuentoAplicado.codigo})` : ''}:</span>
                                <span>-${Math.round(montoDescuento).toLocaleString('es-CL')}</span>
                            </div>
                        )}

                        <div className="checkout-total-linea">
                            <span>Costo de envío:</span>
                            <span>
                                {cotizando ? 'Calculando...' : tieneEnvioGratisCupon ? (
                                    <>
                                        {costoEnvio > 0 && (
                                            <del className="checkout-precio-anterior">
                                                ${costoEnvio.toLocaleString('es-CL')}
                                            </del>
                                        )}
                                        <span className="checkout-envio-gratis">$0 (Envío gratis)</span>
                                    </>
                                ) : `$${costoEnvio.toLocaleString('es-CL')}`}
                            </span>
                        </div>

                        <div className="checkout-total-linea checkout-total-linea--final"><span>Total a pagar:</span><span>${totalFinal.toLocaleString('es-CL')}</span></div>
                    </div>

                    {/* RF-04.4: sin aceptar los términos no se puede pagar (el backend también lo valida) */}
                    <label className="checkout-casilla checkout-terminos">
                        <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} required />
                        <span>Acepto los {enlaceLegal('TERMINOS', 'Términos y Condiciones')} y la {enlaceLegal('PRIVACIDAD', 'Política de Privacidad')}.</span>
                    </label>

                    <div className="checkout-pagos">
                        {cargandoPagos ? (
                            <p className="checkout-ayuda" role="status">Cargando métodos de pago...</p>
                        ) : pasarelas.length === 0 ? (
                            <p className="checkout-aviso checkout-aviso--error">No hay métodos de pago configurados en la tienda.</p>
                        ) : (
                            pasarelas.map(pasarela => {
                                const validadoParaPagar = aceptaTerminos && nombreDestinatario.trim() && telefonoDestinatario.trim() && itemsCarrito.length > 0 && !cotizando && opcionEntregaSeleccionada && (tipoDespacho === 'DOMICILIO' || tipoDespacho === 'RETIRO_LOCAL' || (tipoDespacho === 'SUCURSAL' && sucursalSeleccionada));
                                const habilitado = validadoParaPagar && !procesandoPago;
                                return (
                                    <button
                                        key={pasarela} type="button" onClick={() => procesarPago(pasarela)} disabled={!habilitado || Boolean(esperandoPago)}
                                        className="boton boton-primario checkout-pagar"
                                    >
                                        {procesandoPago ? 'Procesando pedido...' : `Pagar con ${NOMBRES_MEDIO_PAGO[pasarela] || pasarela}`}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </aside>
            </div>

            {esperandoPago && !mostrarDialogoPago && (
                <div className="checkout-aviso" role="status">
                    El pago de la orden #{esperandoPago.ordenId} sigue pendiente. Cerrar el aviso no cancela el pedido.
                    <button ref={botonReabrirPago} type="button" className="boton boton-contorno" onClick={() => setMostrarDialogoPago(true)}>Volver a ver el pago pendiente</button>
                </div>
            )}
            {esperandoPago && mostrarDialogoPago && (
                    <Dialogo className="checkout-modal" tituloId="checkout-modal-titulo" onCerrar={cerrarAvisoPago}>
                        <span className="antetitulo">Pago en curso</span>
                        <h2 id="checkout-modal-titulo" tabIndex={-1} data-foco-inicial>Completando pago en Mercado Pago</h2>
                        <p className="texto-secundario">
                            Se abrió la ventana de Mercado Pago para la <strong>Orden #{esperandoPago.ordenId}</strong>.
                            Completa tu pago allá. Esta pantalla detectará tu pago automáticamente tan pronto como se acredite.
                        </p>
                        <div className="checkout-modal-acciones">
                            <button
                                type="button"
                                className="boton boton-primario"
                                onClick={() => verificarEstadoOrden(esperandoPago.ordenId)}
                                disabled={verificando}
                            >
                                {verificando ? 'Consultando a Mercado Pago...' : 'Ya pagué (Verificar mi pago)'}
                            </button>
                            <a href={esperandoPago.urlPago} target="_blank" rel="noopener noreferrer" className="checkout-modal-enlace">
                                ¿Se cerró la ventana? Abrir Mercado Pago de nuevo
                            </a>
                            <button
                                type="button"
                                className="boton-texto"
                                onClick={cerrarAvisoPago}
                            >
                                Cerrar y volver al checkout
                            </button>
                        </div>
                    </Dialogo>
            )}
        </div>
    );
}
