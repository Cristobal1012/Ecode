import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import { aplicarPaleta } from '../constants/palettes';
import Header from '../components/header/header';
import './HistorialPedidos.css';

const TEMA_PREDETERMINADO = 1;

// Entregas que hace la propia tienda, sin transportista (RF-02.3)
const NOMBRES_ENTREGA = {
    RETIRO_LOCAL: 'Retiro en local',
    ENTREGA_COORDINADA: 'Entrega coordinada'
};

const diccionarioEstados = {
    'PENDIENTE': 'Pendiente',
    'PAGADO': 'Pagado',
    'EN_PREPARACION': 'En Preparación',
    'ENVIADO': 'Despachado',
    'ENTREGADO': 'Entregado',
    'CANCELADO': 'Cancelado'
};

const claseEstado = (estado) => {
    switch (estado?.toUpperCase()) {
        case 'PAGADO':
        case 'ENTREGADO':
            return 'historial-chip--exito';
        case 'PENDIENTE':
            return 'historial-chip--pendiente';
        case 'EN_PREPARACION':
            return 'historial-chip--preparacion';
        case 'ENVIADO':
            return 'historial-chip--enviado';
        default:
            return 'historial-chip--cancelado';
    }
};

// Función segura para formatear la fecha
const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    const fecha = new Date(fechaStr);
    if (isNaN(fecha.getTime())) return fechaStr;
    return fecha.toLocaleDateString('es-CL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const HistorialPedidos = () => {
    const [pedidos, setPedidos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null); // Para el diálogo de detalles de envío
    const [temaConfigurado, setTemaConfigurado] = useState(() => {
        const savedPaletteId = Number(localStorage.getItem('ecommerce_palette'));
        return savedPaletteId || TEMA_PREDETERMINADO;
    });
    const navigate = useNavigate();
    // Diálogo: el foco entra al abrirlo y vuelve al botón que lo abrió al cerrarlo
    const botonCerrar = useRef(null);
    const botonQueAbrio = useRef(null);

    // APLICAR COLORES: Sincroniza la misma paleta del administrador que usa el Catálogo
    useEffect(() => {
        aplicarPaleta(temaConfigurado);
    }, [temaConfigurado]);

    // Cargar la configuración de la tienda y el historial de pedidos
    useEffect(() => {
        clienteAxios.get('configuracion/')
            .then(({ data }) => {
                const configDb = Array.isArray(data) ? data[0] : data;
                if (configDb?.tema_seleccionado !== undefined && configDb?.tema_seleccionado !== null) {
                    const idBackend = Number(configDb.tema_seleccionado);
                    if (!isNaN(idBackend)) {
                        setTemaConfigurado(idBackend);
                        localStorage.setItem('ecommerce_palette', idBackend.toString());
                    }
                }
            })
            .catch((error) => console.error('Error cargando configuración:', error));

        const cargarHistorial = async () => {
            try {
                const response = await clienteAxios.get('ventas/mis-pedidos/');
                setPedidos(response.data);
                setCargando(false);
            } catch (error) {
                console.error("Error al cargar el historial:", error);
                setCargando(false);
            }
        };
        cargarHistorial();
    }, []);

    useEffect(() => {
        if (!pedidoSeleccionado) return undefined;
        botonCerrar.current?.focus();
        const alPresionar = (e) => {
            if (e.key === 'Escape') cerrarDetalle();
        };
        document.addEventListener('keydown', alPresionar);
        return () => document.removeEventListener('keydown', alPresionar);
    }, [pedidoSeleccionado]);

    const abrirDetalle = (orden, evento) => {
        botonQueAbrio.current = evento.currentTarget;
        setPedidoSeleccionado(orden);
    };

    function cerrarDetalle() {
        setPedidoSeleccionado(null);
        botonQueAbrio.current?.focus();
    }

    return (
        <>
            <Header />

            <main className="historial-main">
                <div className="contenedor">
                    <button type="button" className="enlace-flecha historial-volver" onClick={() => navigate('/catalogo')}>
                        <span aria-hidden="true">←</span> Volver al catálogo
                    </button>

                    <h1 className="historial-titulo">Mi historial de pedidos</h1>

                    {cargando ? (
                        <p className="historial-estado" role="status">Cargando tus pedidos...</p>
                    ) : (
                        <table className="historial-tabla">
                            <thead>
                                <tr>
                                    <th scope="col">N° Orden</th>
                                    <th scope="col">Fecha</th>
                                    <th scope="col">Total</th>
                                    <th scope="col">Estado</th>
                                    <th scope="col">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidos.length > 0 ? (
                                    pedidos.map((orden) => (
                                        <tr key={orden.id}>
                                            <td data-etiqueta="N° Orden" className="historial-orden">#{orden.id}</td>
                                            <td data-etiqueta="Fecha" className="historial-fecha">
                                                {formatearFecha(orden.fecha || orden.fecha_creacion)}
                                            </td>
                                            <td data-etiqueta="Total" className="historial-total">
                                                ${Number(orden.total_final).toLocaleString('es-CL')}
                                            </td>
                                            <td data-etiqueta="Estado">
                                                <span className={`historial-chip ${claseEstado(orden.estado)}`}>
                                                    {diccionarioEstados[orden.estado] || orden.estado}
                                                </span>
                                            </td>
                                            <td data-etiqueta="Acciones">
                                                <div className="historial-acciones">
                                                    <button
                                                        type="button"
                                                        className="historial-enlace"
                                                        onClick={() => navigate(`/seguimiento?orden=${orden.id}`)}
                                                    >
                                                        Seguimiento
                                                    </button>

                                                    {/* Opción para ver detalle de la etiqueta/envío si está pagado y usa Chilexpress */}
                                                    {orden.estado?.toUpperCase() === 'PAGADO' && (
                                                        <button
                                                            type="button"
                                                            className="historial-enlace"
                                                            onClick={(e) => abrirDetalle(orden, e)}
                                                        >
                                                            Ver detalle envío
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="historial-vacio">
                                            Aún no tienes pedidos registrados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            {/* DIÁLOGO CON LOS DATOS LOGÍSTICOS DEL ENVÍO: se cierra con Escape o haciendo clic fuera */}
            {pedidoSeleccionado && (
                <div className="historial-fondo" onClick={(e) => e.target === e.currentTarget && cerrarDetalle()}>
                    <div
                        className="historial-dialogo"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="historial-dialogo-titulo"
                    >
                        <h2 id="historial-dialogo-titulo">
                            Detalle de envío · Orden #{pedidoSeleccionado.id}
                        </h2>

                        <dl className="historial-detalle">
                            <dt>Proveedor logístico</dt>
                            <dd className="historial-proveedor">{NOMBRES_ENTREGA[pedidoSeleccionado.proveedor_logistico] || pedidoSeleccionado.proveedor_logistico || 'Chilexpress'}</dd>
                            <dt>Estado del pago</dt>
                            <dd>{diccionarioEstados[pedidoSeleccionado.estado] || pedidoSeleccionado.estado}</dd>
                            <dt>Información pasarela / OT</dt>
                            <dd className="historial-codigo">{pedidoSeleccionado.id_transaccion_pasarela || 'Generándose...'}</dd>
                        </dl>

                        {pedidoSeleccionado.direccion && (
                            <div className="historial-direccion">
                                <p>Dirección de destino</p>
                                <p>{pedidoSeleccionado.direccion.calle} #{pedidoSeleccionado.direccion.numero}, {pedidoSeleccionado.direccion.comuna}</p>
                                {pedidoSeleccionado.direccion.dpto_casa && (
                                    <p>Detalle/Dpto: {pedidoSeleccionado.direccion.dpto_casa}</p>
                                )}
                            </div>
                        )}

                        <div className="historial-dialogo-acciones">
                            <button ref={botonCerrar} type="button" className="boton boton-primario" onClick={cerrarDetalle}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default HistorialPedidos;
