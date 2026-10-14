import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useCarrito from '../hooks/useCarrito';

const CarritoCompras = () => {
    const [isOpen, setIsOpen] = useState(false);
    const carritoRef = useRef(null);
    const itemsCarrito = useCarrito();

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (carritoRef.current && !carritoRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

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
                        {itemsCarrito.length > 0 ? (
                            itemsCarrito.map((item) => (
                                <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: '#374151' }}>{item.nombre}</p>
                                        <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>Cant: {item.cantidad}</p>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#1f2937' }}>
                                        ${(item.precio * item.cantidad).toLocaleString('es-CL')}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p style={{ margin: 0, textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>Tu carrito está vacío</p>
                        )}
                    </div>

                    {itemsCarrito.length > 0 && (
                        <div style={{ padding: '16px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <span style={{ fontWeight: 'bold', color: '#374151' }}>Total:</span>
                                <span style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '18px' }}>${total.toLocaleString('es-CL')}</span>
                            </div>
                            <Link to="/checkout" onClick={() => setIsOpen(false)} style={{
                                display: 'block', width: '100%', textAlign: 'center', backgroundColor: '#2563eb',
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
