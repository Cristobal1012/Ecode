import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { guardarCarrito, validarCarrito } from './carrito';

const CarritoCompras = () => {
    const [isOpen, setIsOpen] = useState(false);
    const carritoRef = useRef(null);
    const [itemsCarrito, setItemsCarrito] = useState([]); // Estado dinámico
    const [aviso, setAviso] = useState('');
    const [tipoAviso, setTipoAviso] = useState('status');
    const [actualizando, setActualizando] = useState(false);

    useEffect(() => {
        // Función para leer los datos actuales
        const cargarCarrito = () => {
            const carritoGuardado = localStorage.getItem('carrito_local');
            if (carritoGuardado) {
                setItemsCarrito(JSON.parse(carritoGuardado));
            } else {
                setItemsCarrito([]);
            }
        };

        // Carga inicial
        cargarCarrito();

        // Escucha un evento para actualizarse al instante si iniciamos/cerramos sesión o agregamos algo
        window.addEventListener('carritoActualizado', cargarCarrito);

        const handleClickOutside = (event) => {
            if (carritoRef.current && !carritoRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            window.removeEventListener('carritoActualizado', cargarCarrito);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const mostrarAviso = (mensaje, tipo = 'status') => {
        setAviso(mensaje);
        setTipoAviso(tipo);
    };

    const cambiarCantidad = async (item, incremento) => {
        if (actualizando) return;

        const cantidadNueva = Number(item.cantidad) + incremento;
        if (cantidadNueva < 1) return;

        if (incremento < 0) {
            const nuevoCarrito = itemsCarrito.map(actual =>
                actual.id === item.id && actual.sku === item.sku
                    ? { ...actual, cantidad: cantidadNueva }
                    : actual
            );

            setItemsCarrito(nuevoCarrito);
            await guardarCarrito(nuevoCarrito);
            mostrarAviso('Cantidad actualizada.');
            return;
        }

        setActualizando(true);
        setAviso('');

        try {
            const candidato = itemsCarrito.map(actual =>
                actual.id === item.id && actual.sku === item.sku
                    ? { ...actual, cantidad: cantidadNueva }
                    : actual
            );

            const revision = await validarCarrito(candidato);
            const revisada = revision.items?.find(
                linea =>
                    linea.producto_mongo_id === item.id &&
                    linea.variante_sku === item.sku
            );

            if (!revisada) {
                mostrarAviso('No pudimos comprobar el stock. Inténtalo nuevamente.', 'alert');
                return;
            }

            if (revisada.problema || revisada.disponible < cantidadNueva) {
                mostrarAviso(
                    revisada.problema === 'STOCK_INSUFICIENTE'
                        ? `Solo quedan ${revisada.disponible} unidades.`
                        : revisada.mensaje || 'No se pudo aumentar la cantidad.',
                    'alert'
                );
                return;
            }

            const carritoNuevo = candidato.map(actual =>
                actual.id === item.id && actual.sku === item.sku
                    ? { ...actual, precio: revisada.precio ?? actual.precio }
                    : actual
            );

            setItemsCarrito(carritoNuevo);
            await guardarCarrito(carritoNuevo);
            mostrarAviso('Cantidad actualizada.');
        } catch (error) {
            console.error('Error al actualizar el carrito:', error);
            mostrarAviso('No pudimos comprobar el stock. Inténtalo nuevamente.', 'alert');
        } finally {
            setActualizando(false);
        }
    };

    const quitarProducto = async (item) => {
        if (actualizando) return;

        const nuevoCarrito = itemsCarrito.filter(
            actual => !(actual.id === item.id && actual.sku === item.sku)
        );

        setItemsCarrito(nuevoCarrito);
        await guardarCarrito(nuevoCarrito);
        mostrarAviso('Producto quitado del carrito.');
    };

    const total = itemsCarrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const cantidadTotal = itemsCarrito.reduce((acc, item) => acc + item.cantidad, 0);

    return (
        <div style={{ position: 'relative' }} ref={carritoRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-label={`Carrito de compras, ${cantidadTotal} ${cantidadTotal === 1 ? 'producto' : 'productos'}`}
                aria-expanded={isOpen}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '8px', backgroundColor: 'transparent', border: 'none',
                    cursor: 'pointer', position: 'relative'
                }}
            >
                <svg aria-hidden="true" style={{ width: '28px', height: '28px', color: '#1f2937' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>

                {cantidadTotal > 0 && (
                    <span aria-hidden="true" style={{
                        position: 'absolute', top: '0px', right: '0px', backgroundColor: '#ef4444',
                        color: 'white', fontSize: '12px', fontWeight: 'bold', width: '18px',
                        height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {cantidadTotal}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', right: '0', marginTop: '8px', width: '320px',
                    backgroundColor: 'white', borderRadius: '8px',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #f3f4f6', zIndex: 9999
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb', borderRadius: '8px 8px 0 0' }}>
                        <h3 style={{ margin: 0, fontWeight: 'bold', color: '#1f2937' }}>Mi Carrito</h3>
                    </div>

                    <div style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                        {aviso && (
                            <p role={tipoAviso} style={{ color: tipoAviso === 'alert' ? '#b91c1c' : '#166534' }}>
                                {aviso}
                            </p>
                        )}

                        {itemsCarrito.length > 0 ? (
                            itemsCarrito.map(item => (
                                <div
                                    key={`${item.id}-${item.sku}`}
                                    style={{
                                        marginBottom: '12px',
                                        paddingBottom: '12px',
                                        borderBottom: '1px solid #f3f4f6'
                                    }}
                                >
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                                        {item.nombre}
                                    </p>

                                    <p style={{ margin: '6px 0', fontSize: '14px', fontWeight: 'bold' }}>
                                        ${(Number(item.precio) * item.cantidad).toLocaleString('es-CL')}
                                    </p>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => cambiarCantidad(item, -1)}
                                            disabled={item.cantidad <= 1 || actualizando}
                                            aria-label={`Disminuir cantidad de ${item.nombre}`}
                                            style={{ minWidth: '32px', minHeight: '32px', cursor: 'pointer' }}
                                        >
                                            −
                                        </button>

                                        <span aria-label={`Cantidad: ${item.cantidad}`}>
                                            {item.cantidad}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => cambiarCantidad(item, 1)}
                                            disabled={actualizando}
                                            aria-label={`Aumentar cantidad de ${item.nombre}`}
                                            style={{ minWidth: '32px', minHeight: '32px', cursor: 'pointer' }}
                                        >
                                            +
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => quitarProducto(item)}
                                            disabled={actualizando}
                                            aria-label={`Quitar ${item.nombre} del carrito`}
                                            style={{
                                                minHeight: '32px',
                                                cursor: 'pointer',
                                                color: '#b91c1c',
                                                background: 'transparent',
                                                border: 'none',
                                                textDecoration: 'underline'
                                            }}
                                        >
                                            Quitar
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                                Tu carrito está vacío
                            </p>
                        )}
                    </div>

                    {itemsCarrito.length > 0 && (
                        <div style={{ padding: '16px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <span style={{ fontWeight: 'bold', color: '#374151' }}>Total:</span>
                                <span style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '18px' }}>${total.toLocaleString('es-CL')}</span>
                            </div>
                            <Link to="/checkout" onClick={() => setIsOpen(false)} style={{
                                display: 'block', width: '100%', textAlign: 'center', backgroundColor: 'var(--color-primary)',
                                color: 'white', padding: '10px 0', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold'
                            }}>
                                Ir a Pagar
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CarritoCompras;