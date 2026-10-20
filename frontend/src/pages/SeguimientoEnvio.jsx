import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import Header from '../components/header/header';
import './SeguimientoEnvio.css';

export default function SeguimientoEnvio() {
    return (
        <>
            <Header />
            <SeguimientoContenido />
        </>
    );
}

const ESTADOS = [
    'En origen',
    'En tránsito',
    'En reparto',
    'Entregado',
];

function SeguimientoContenido() {
    const [searchParams] = useSearchParams();

    const [numeroOrden, setNumeroOrden] = useState(
        searchParams.get('orden') || ''
    );
    const [email, setEmail] = useState('');
    const [seguimiento, setSeguimiento] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [cargando, setCargando] = useState(false);

    const tituloResultado = useRef(null);

    useEffect(() => {
        if (seguimiento) {
            tituloResultado.current?.focus();
        }
    }, [seguimiento]);

    const consultarSeguimiento = async (e) => {
        e.preventDefault();

        setMensaje('');
        setSeguimiento(null);
        setCargando(true);

        try {
            const respuesta = await clienteAxios.post(
                'ventas/tracking/',
                {
                    numero_orden: numeroOrden,
                    email: email,
                }
            );

            setSeguimiento(respuesta.data);
        } catch (error) {
            setMensaje(
                error.response?.data?.error ||
                'No se pudo consultar el seguimiento del pedido.'
            );
        } finally {
            setCargando(false);
        }
    };

    const estadoActual = seguimiento?.estado_actual;
    const esRetiroLocal = seguimiento?.proveedor === 'RETIRO_LOCAL';
    const pendienteDeDespacho =
        estadoActual === 'Pendiente de despacho';

    const pendienteDeRetiro =
        estadoActual === 'Pendiente de retiro en local';

    const cancelado = estadoActual === 'Cancelado';
    const entregado = estadoActual === 'Entregado';
    const indiceEstadoActual = ESTADOS.indexOf(estadoActual);

    const camposConError = mensaje
        ? {
            'aria-invalid': true,
            'aria-describedby': 'seguimiento-error',
        }
        : {};

    return (
        <main className="seguimiento-main">
            <div className="seguimiento">
                <span className="antetitulo">Tu pedido</span>

                <h1 className="seguimiento-titulo">
                    Seguimiento de pedido
                </h1>

                <p className="seguimiento-intro">
                    Ingresa el número de orden y el correo utilizado en la compra.
                </p>

                <form
                    className="seguimiento-formulario"
                    onSubmit={consultarSeguimiento}
                >
                    <div className="seguimiento-campo">
                        <label htmlFor="seguimiento-orden">
                            Número de orden
                        </label>

                        <input
                            id="seguimiento-orden"
                            type="text"
                            inputMode="numeric"
                            value={numeroOrden}
                            onChange={(e) => setNumeroOrden(e.target.value)}
                            required
                            {...camposConError}
                        />
                    </div>

                    <div className="seguimiento-campo">
                        <label htmlFor="seguimiento-email">
                            Correo electrónico
                        </label>

                        <input
                            id="seguimiento-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            {...camposConError}
                        />
                    </div>

                    <button
                        type="submit"
                        className="boton boton-primario"
                        disabled={cargando}
                    >
                        {cargando
                            ? 'Consultando...'
                            : 'Consultar seguimiento'}
                    </button>
                </form>

                {mensaje && (
                    <p
                        id="seguimiento-error"
                        role="alert"
                        className="seguimiento-error"
                    >
                        {mensaje}
                    </p>
                )}

                {seguimiento && (
                    <section
                        className="seguimiento-resultado"
                        aria-labelledby="seguimiento-resultado-titulo"
                    >
                        <h2
                            id="seguimiento-resultado-titulo"
                            ref={tituloResultado}
                            tabIndex={-1}
                        >
                            Pedido #{seguimiento.numero_orden}
                        </h2>

                        <dl className="seguimiento-datos">
                            {!esRetiroLocal && (
                                <>
                                    <dt>Proveedor</dt>
                                    <dd className="seguimiento-proveedor">
                                        {seguimiento.proveedor}
                                    </dd>

                                    <dt>Código de seguimiento</dt>
                                    <dd>
                                        {seguimiento.codigo_seguimiento || 'Pendiente'}
                                    </dd>
                                </>
                            )}

                            <dt>Estado actual</dt>
                            <dd>{estadoActual}</dd>
                        </dl>

                        {pendienteDeDespacho && (
                            <>
                                <h3>Estado del envío</h3>

                                <div className="seguimiento-aviso">
                                    <strong>Pendiente de despacho</strong>
                                    <p>
                                        El pedido aún no ha sido entregado al
                                        proveedor logístico.
                                    </p>
                                </div>
                            </>
                        )}

                        {pendienteDeRetiro && (
                            <div className="seguimiento-aviso">
                                <strong>Pendiente de retiro en local</strong>
                                <p>
                                    Tu pedido todavía está pendiente de retiro
                                    en la tienda.
                                </p>
                            </div>
                        )}

                        {cancelado && (
                            <div className="seguimiento-aviso">
                                <strong>Pedido cancelado</strong>
                                <p>
                                    Este pedido fue cancelado.
                                </p>
                            </div>
                        )}

                        {!pendienteDeDespacho &&
                            !pendienteDeRetiro &&
                            !cancelado &&
                            !esRetiroLocal && (
                                <>
                                    <h3>Estado del envío</h3>

                                    <ol className="seguimiento-linea">
                                        {ESTADOS.map((estado, index) => {
                                            const completado =
                                                index <= indiceEstadoActual;

                                            const actual =
                                                index === indiceEstadoActual;

                                            const clases = [
                                                'seguimiento-paso',
                                                completado &&
                                                    'seguimiento-paso--hecho',
                                                actual &&
                                                    'seguimiento-paso--actual',
                                            ]
                                                .filter(Boolean)
                                                .join(' ');

                                            return (
                                                <li
                                                    key={estado}
                                                    className={clases}
                                                    aria-current={
                                                        actual ? 'step' : undefined
                                                    }
                                                >
                                                    <span
                                                        className="seguimiento-marca"
                                                        aria-hidden="true"
                                                    >
                                                        {completado && (
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="3"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                                                            </svg>
                                                        )}
                                                    </span>

                                                    <span className="seguimiento-paso-nombre">
                                                        {estado}

                                                        {completado && !actual && (
                                                            <span className="visualmente-oculto">
                                                                {' '}(completado)
                                                            </span>
                                                        )}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </>
                            )}
                    </section>
                )}
            </div>
        </main>
    );
}