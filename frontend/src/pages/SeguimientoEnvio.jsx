import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom'; 
import clienteAxios from '../components/auth/axiosConfig';

export default function SeguimientoEnvio() {
    const [searchParams] = useSearchParams(); 
    
    // 3. Modificamos el estado inicial para que lea la URL (?orden=123)
    const [numeroOrden, setNumeroOrden] = useState(searchParams.get('orden') || '');
    
    const [email, setEmail] = useState('');
    const [seguimiento, setSeguimiento] = useState(null);
    const [mensaje, setMensaje] = useState('');

    const estados = [
        'En origen',
        'En tránsito',
        'En reparto',
        'Entregado'
    ];

    const consultarSeguimiento = async (e) => {
        e.preventDefault();

        setMensaje('');
        setSeguimiento(null);

        try {
            const respuesta = await clienteAxios.post(
                'ventas/tracking/',
                {
                    numero_orden: numeroOrden,
                    email: email
                }
            );

            setSeguimiento(respuesta.data);
        } catch (error) {
            setMensaje(
                error.response?.data?.error ||
                'No se pudo consultar el seguimiento del pedido.'
            );
        }
    };

    const estadoActual = seguimiento?.estado_actual;
    const pendienteDeDespacho =
        estadoActual === 'Pendiente de despacho';

    const indiceEstadoActual = estados.indexOf(estadoActual);

    return (
        <main
            style={{
                maxWidth: '700px',
                margin: '40px auto',
                padding: '20px',
                fontFamily: 'sans-serif'
            }}
        >
            <h1>Seguimiento de pedido</h1>

            <p>
                Ingresa el número de orden y el correo utilizado en la compra.
            </p>

            <form onSubmit={consultarSeguimiento}>
                <div style={{ marginBottom: '15px' }}>
                    <label>Número de orden</label>
                    <input
                        type="text"
                        value={numeroOrden}
                        onChange={(e) => setNumeroOrden(e.target.value)}
                        required
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px',
                            marginTop: '5px'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label>Correo electrónico</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        style={{
                            display: 'block',
                            width: '100%',
                            padding: '10px',
                            marginTop: '5px'
                        }}
                    />
                </div>

                <button type="submit">
                    Consultar seguimiento
                </button>
            </form>

            {mensaje && (
                <p style={{ color: 'red', marginTop: '20px' }}>
                    {mensaje}
                </p>
            )}

            {seguimiento && (
                <div style={{ marginTop: '40px' }}>
                    <h2>Pedido #{seguimiento.numero_orden}</h2>

                    <p>
                        <strong>Proveedor:</strong>{' '}
                        {seguimiento.proveedor}
                    </p>

                    <p>
                        <strong>Código de seguimiento:</strong>{' '}
                        {seguimiento.codigo_seguimiento || 'Pendiente'}
                    </p>

                    <p>
                        <strong>Estado actual:</strong>{' '}
                        {seguimiento.estado_actual}
                    </p>

                    <h3 style={{ marginTop: '30px' }}>
                        Estado del envío
                    </h3>

                    {pendienteDeDespacho ? (
                        <div
                            style={{
                                marginTop: '20px',
                                padding: '15px',
                                border: '1px solid #ccc',
                                borderRadius: '8px'
                            }}
                        >
                            <strong>Pendiente de despacho</strong>

                            <p style={{ marginBottom: 0 }}>
                                El pedido aún no ha sido entregado
                                al proveedor logístico.
                            </p>
                        </div>
                    ) : (
                        <div style={{ marginTop: '20px' }}>
                            {estados.map((estado, index) => {
                                const completado =
                                    index <= indiceEstadoActual;

                                const esUltimo =
                                    index === estados.length - 1;

                                return (
                                    <div
                                        key={estado}
                                        style={{
                                            display: 'flex',
                                            minHeight: esUltimo
                                                ? '40px'
                                                : '70px'
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                marginRight: '15px'
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: '25px',
                                                    height: '25px',
                                                    borderRadius: '50%',
                                                    backgroundColor:
                                                        completado
                                                            ? 'green'
                                                            : '#ccc',
                                                    color: 'white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '14px',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {completado ? '✓' : ''}
                                            </div>

                                            {!esUltimo && (
                                                <div
                                                    style={{
                                                        width: '3px',
                                                        flex: 1,
                                                        backgroundColor:
                                                            index <
                                                            indiceEstadoActual
                                                                ? 'green'
                                                                : '#ccc',
                                                        marginTop: '4px'
                                                    }}
                                                />
                                            )}
                                        </div>

                                        <span
                                            style={{
                                                fontWeight:
                                                    estado === estadoActual
                                                        ? 'bold'
                                                        : 'normal',
                                                paddingTop: '3px'
                                            }}
                                        >
                                            {estado}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
