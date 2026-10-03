import { useEffect, useState } from 'react';
import clienteAxios from './auth/axiosConfig';
import { useNavigate } from 'react-router-dom';

export default function Checkout() {
    const [modoAutenticacion, setModoAutenticacion] = useState(null);
    const [emailInvitado, setEmailInvitado] = useState('');
    const [calle, setCalle] = useState('');
    const [comuna, setComuna] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [opcionCompra, setOpcionCompra] = useState(null);
    const [itemsCarrito, setItemsCarrito] = useState([]);

    // Cotización logística
    const [opcionesEntrega, setOpcionesEntrega] = useState([]);
    const [opcionEntregaSeleccionada, setOpcionEntregaSeleccionada] = useState(null);
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [cotizando, setCotizando] = useState(false);

    const [usuarioAutenticado, setUsuarioAutenticado] = useState(
        !!localStorage.getItem('access_token')
    );
    const navigate = useNavigate();

    //Datos de prueba
    const paquete = {
        peso_kg: '1.50',
        alto_cm: '10',
        ancho_cm: '20',
        largo_cm: '30'
    };

    useEffect(() => {
        const carritoGuardado = localStorage.getItem('carrito_local');

        if (carritoGuardado) {
            try {
                setItemsCarrito(JSON.parse(carritoGuardado));
            } catch (error) {
                console.error('Error leyendo carrito:', error);
                setItemsCarrito([]);
            }
        }
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
        localStorage.setItem(
            'url_anterior_login',
            window.location.pathname
        );
        navigate('/login');
    };

    const compraComoInvitado =
        modoAutenticacion === 'INVITADO' ||
        (modoAutenticacion === 'MIXTO' && opcionCompra === 'INVITADO');

    useEffect(() => {
        const obtenerReglas = async () => {
            try {
                const respuesta = await clienteAxios.get(
                    'ventas/checkout/reglas/'
                );

                setModoAutenticacion(
                    respuesta.data.modo_autenticacion
                );
            } catch (error) {
                console.error(
                    'Error al obtener reglas:',
                    error
                );

                setMensaje(
                    'No se pudieron cargar las opciones de compra.'
                );
            }
        };

        obtenerReglas();
    }, []);

    useEffect(() => {
        if (
            usuarioAutenticado &&
            modoAutenticacion === 'MIXTO'
        ) {
            setOpcionCompra('USUARIO');
        }
    }, [usuarioAutenticado, modoAutenticacion]);

    const subtotal = itemsCarrito.reduce(
        (acc, item) =>
            acc + (Number(item.precio) * Number(item.cantidad)),
        0
    );

    const totalFinal = subtotal + costoEnvio;

    // Cotizar envío
    const cotizarEnvio = async () => {
        if (!comuna.trim() || subtotal <= 0) {
            setOpcionesEntrega([]);
            setOpcionEntregaSeleccionada(null);
            setCostoEnvio(0);
            return;
        }

        setCotizando(true);
        setMensaje('');

        try {
            const payload = {
                comuna: comuna.trim(),
                subtotal: subtotal,
                paquete: paquete
            };

            console.log('Enviando cotización:', payload);

            const respuesta = await clienteAxios.post(
                'ventas/cotizaciones/',
                payload
            );

            console.log(
                'Respuesta cotización:',
                respuesta.data
            );

            const opciones = respuesta.data.opciones || [];
            const errores = respuesta.data.errores || [];

            setOpcionesEntrega(opciones);

            if (errores.length > 0) {
                console.warn(
                    'Errores de proveedores logísticos:',
                    errores
                );
            }

            if (opciones.length === 0) {
                setOpcionEntregaSeleccionada(null);
                setCostoEnvio(0);

                setMensaje(
                    'No hay opciones de entrega disponibles para esta comuna.'
                );

                return;
            }

            const primeraOpcion = opciones[0];

            setOpcionEntregaSeleccionada(primeraOpcion);
            setCostoEnvio(
                Number(primeraOpcion.costo_envio)
            );

        } catch (error) {
            console.error(
                'Error al cotizar envío:',
                error
            );

            console.error(
                'Respuesta del servidor:',
                error.response?.data
            );

            setOpcionesEntrega([]);
            setOpcionEntregaSeleccionada(null);
            setCostoEnvio(0);

            const detalle =
                error.response?.data?.detail;

            setMensaje(
                detalle ||
                'No se pudo calcular el costo de envío.'
            );
        } finally {
            setCotizando(false);
        }
    };

    //Seleccionar una opción de entrega
    const seleccionarEntrega = (opcion) => {
        setOpcionEntregaSeleccionada(opcion);
        setCostoEnvio(
            Number(opcion.costo_envio)
        );

        setMensaje('');
    };

    const procesarPago = async (e) => {
        e.preventDefault();

        if (itemsCarrito.length === 0) {
            setMensaje(
                'Tu carrito está vacío. Agrega productos antes de pagar.'
            );
            return;
        }

        if (!comuna.trim()) {
            setMensaje(
                'Ingresa una comuna para calcular el envío.'
            );
            return;
        }

        if (!opcionEntregaSeleccionada) {
            setMensaje(
                'Selecciona una opción de entrega antes de continuar.'
            );
            return;
        }

        setMensaje('Procesando pago...');

        const payload = {
            email_invitado:
                !usuarioAutenticado && compraComoInvitado
                    ? emailInvitado
                    : null,

            metodo_pago: 'TRANSBANK',

            direccion_envio_snapshot: {
                calle: calle,
                comuna: comuna
            },

            subtotal: subtotal,
            costo_envio: costoEnvio,
            total_final: totalFinal,

            proveedor_logistico:
                opcionEntregaSeleccionada.proveedor,
            paquete: paquete,

            //Productos del carrito
            items: itemsCarrito.map(item => ({
                producto_mongo_id: item.id,
                variante_sku: item.sku,
                nombre_producto_snapshot: item.nombre,
                precio_unitario_snapshot: item.precio,
                cantidad: item.cantidad
            }))
        };

        try {
            console.log(
                'Enviando checkout:',
                payload
            );

            const respuesta =
                await clienteAxios.post(
                    'ventas/checkout/',
                    payload
                );

            setMensaje(
                '¡Éxito! Orden creada correctamente.'
            );

            console.log(
                'Respuesta del servidor:',
                respuesta.data
            );

            //Limpiar carrito local
            localStorage.removeItem(
                'carrito_local'
            );

            window.dispatchEvent(
                new Event('carritoActualizado')
            );

            //Limpiar carrito en BD si corresponde
            if (usuarioAutenticado) {
                try {
                    await clienteAxios.post(
                        'ventas/carrito/',
                        { items: [] }
                    );
                } catch (err) {
                    console.error(
                        'Error limpiando carrito en BD:',
                        err
                    );
                }
            }

            setTimeout(() => {
                navigate('/mis-pedidos');
            }, 1500);

        } catch (error) {
            setMensaje(
                'Error al procesar la compra. Revisa la consola.'
            );

            console.error(
                'Error devuelto por Django:',
                error.response?.data
            );
        }
    };

    if (modoAutenticacion == null) {
        return (
            <p
                style={{
                    textAlign: 'center',
                    marginTop: '50px'
                }}
            >
                Cargando opciones de compra...
            </p>
        );
    }

    if (
        modoAutenticacion === 'REGISTRO_OBLIGATORIO' &&
        !usuarioAutenticado
    ) {
        return (
            <div style={estiloContenedorOpciones}>
                <h2>Finalizar Compra</h2>

                <p>
                    Para realizar la compra debes
                    iniciar sesión o crear una cuenta.
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
                    onClick={() =>
                        setOpcionCompra('INVITADO')
                    }
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
        <div
            style={{
                maxWidth: '600px',
                margin: '40px auto',
                padding: '20px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                fontFamily: 'sans-serif'
            }}
        >
            <h2>Finalizar Compra</h2>

            {mensaje && (
                <div
                    style={{
                        padding: '10px',
                        marginBottom: '15px',
                        backgroundColor:
                            mensaje.includes('Éxito')
                                ? '#d4edda'
                                : '#f8d7da',
                        borderRadius: '4px',
                        color:
                            mensaje.includes('Éxito')
                                ? '#155724'
                                : '#721c24'
                    }}
                >
                    {mensaje}
                </div>
            )}

            <div
                style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                }}
            >
                <h3
                    style={{
                        margin: '0 0 10px 0',
                        fontSize: '1rem'
                    }}
                >
                    Resumen del pedido
                </h3>

                {itemsCarrito.length > 0 ? (
                    itemsCarrito.map((item, index) => (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '0.9rem',
                                marginBottom: '5px',
                                color: '#4b5563'
                            }}
                        >
                            <span>
                                {item.nombre} (x{item.cantidad})
                            </span>

                            <span>
                                $
                                {(
                                    item.precio *
                                    item.cantidad
                                ).toLocaleString('es-CL')}
                            </span>
                        </div>
                    ))
                ) : (
                    <p
                        style={{
                            margin: 0,
                            color: '#6b7280',
                            fontSize: '0.9rem'
                        }}
                    >
                        No hay productos en el carrito.
                    </p>
                )}

                <hr
                    style={{
                        border: 'none',
                        borderTop: '1px solid #e5e7eb',
                        margin: '12px 0'
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.9rem',
                        marginBottom: '6px',
                        color: '#4b5563'
                    }}
                >
                    <span>Subtotal:</span>

                    <span>
                        ${subtotal.toLocaleString('es-CL')}
                    </span>
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.9rem',
                        marginBottom: '10px',
                        color: '#4b5563'
                    }}
                >
                    <span>Costo de envío:</span>

                    <span>
                        {cotizando
                            ? 'Calculando...'
                            : `$${costoEnvio.toLocaleString('es-CL')}`}
                    </span>
                </div>

                <hr
                    style={{
                        border: 'none',
                        borderTop: '1px solid #e5e7eb',
                        margin: '10px 0'
                    }}
                />

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 'bold',
                        fontSize: '1.05rem',
                        color: '#1f2937'
                    }}
                >
                    <span>Total a pagar:</span>

                    <span>
                        ${totalFinal.toLocaleString('es-CL')}
                    </span>
                </div>
            </div>

            <form onSubmit={procesarPago}>

                {compraComoInvitado && (
                    <div
                        style={{
                            marginBottom: '15px'
                        }}
                    >
                        <label>
                            Correo para el recibo:
                        </label>

                        <input
                            type="email"
                            value={emailInvitado}
                            onChange={(e) =>
                                setEmailInvitado(
                                    e.target.value
                                )
                            }
                            required
                            style={{
                                width: '100%',
                                padding: '8px',
                                marginTop: '5px',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                )}

                <div
                    style={{
                        marginBottom: '15px'
                    }}
                >
                    <label>
                        Calle y número:
                    </label>

                    <input
                        type="text"
                        value={calle}
                        onChange={(e) =>
                            setCalle(e.target.value)
                        }
                        required
                        style={{
                            width: '100%',
                            padding: '8px',
                            marginTop: '5px',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <div
                    style={{
                        marginBottom: '20px'
                    }}
                >
                    <label>
                        Comuna:
                    </label>

                    <input
                        type="text"
                        value={comuna}
                        onChange={(e) =>
                            setComuna(e.target.value)
                        }
                        onBlur={cotizarEnvio}
                        required
                        placeholder="Ej: Santiago"
                        style={{
                            width: '100%',
                            padding: '8px',
                            marginTop: '5px',
                            boxSizing: 'border-box'
                        }}
                    />

                    {cotizando && (
                        <p
                            style={{
                                fontSize: '13px',
                                color: '#6b7280',
                                marginTop: '5px'
                            }}
                        >
                            Calculando costo de envío...
                        </p>
                    )}
                </div>

                {opcionesEntrega.length > 0 && (
                    <div
                        style={{
                            marginBottom: '20px',
                            padding: '15px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px'
                        }}
                    >
                        <h3
                            style={{
                                marginTop: 0,
                                fontSize: '1rem'
                            }}
                        >
                            Método de entrega
                        </h3>

                        {opcionesEntrega.map((opcion) => {
                            const seleccionada =
                                opcionEntregaSeleccionada?.proveedor ===
                                opcion.proveedor;

                            return (
                                <label
                                    key={opcion.proveedor}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px',
                                        marginBottom: '8px',
                                        border: seleccionada
                                            ? '2px solid #007BFF'
                                            : '1px solid #ddd',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        backgroundColor: seleccionada
                                            ? '#f0f7ff'
                                            : 'white'
                                    }}
                                >
                                    <div>
                                        <input
                                            type="radio"
                                            name="metodoEntrega"
                                            checked={seleccionada}
                                            onChange={() =>
                                                seleccionarEntrega(
                                                    opcion
                                                )
                                            }
                                            style={{
                                                marginRight: '8px'
                                            }}
                                        />

                                        <strong>
                                            {opcion.nombre}
                                        </strong>

                                        <div
                                            style={{
                                                fontSize: '12px',
                                                color: '#6b7280',
                                                marginTop: '4px'
                                            }}
                                        >
                                            {opcion.tipo === 'RETIRO'
                                                ? 'Retiro en tienda'
                                                : 'Despacho a domicilio'}
                                        </div>
                                    </div>

                                    <strong>
                                        {Number(
                                            opcion.costo_envio
                                        ).toLocaleString('es-CL', {
                                            style: 'currency',
                                            currency: 'CLP',
                                            maximumFractionDigits: 0
                                        })}
                                    </strong>
                                </label>
                            );
                        })}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={
                        itemsCarrito.length === 0 ||
                        cotizando ||
                        !opcionEntregaSeleccionada
                    }
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor:
                            itemsCarrito.length === 0 ||
                            cotizando ||
                            !opcionEntregaSeleccionada
                                ? '#9ca3af'
                                : '#007BFF',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor:
                            itemsCarrito.length === 0 ||
                            cotizando ||
                            !opcionEntregaSeleccionada
                                ? 'not-allowed'
                                : 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold'
                    }}
                >
                    {cotizando
                        ? 'Calculando envío...'
                        : `Pagar $${totalFinal.toLocaleString('es-CL')}`}
                </button>
            </form>
        </div>
    );
}