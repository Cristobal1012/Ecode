import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clienteAxios from './auth/axiosConfig';

const MenuUsuario = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [nombreUsuario, setNombreUsuario] = useState('Usuario');
    const menuRef = useRef(null);
    const navigate = useNavigate();

    const token = localStorage.getItem('access_token');
    const isLoggedIn = !!token;
    
    // Obtenemos el nombre real del usuario autenticado consultando el backend
    useEffect(() => {
        if (isLoggedIn) {
            clienteAxios.get('usuarios/me/')
                .then(({ data }) => {
                    const nombreReal = data.nombre || 'Usuario';
                    setNombreUsuario(nombreReal);
                })
                .catch((error) => {
                    console.error("No se pudo obtener el perfil del usuario:", error);
                });
        }
    }, [isLoggedIn]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const cerrarSesion = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('rol');
        localStorage.removeItem('carrito_local');
        window.dispatchEvent(new Event('carritoActualizado'));
        setIsOpen(false);
        navigate('/');
    };

    if (!isLoggedIn) {
        return (
            <Link to="/login" style={{ color: '#374151', fontWeight: '500', textDecoration: 'none' }}>
                Iniciar sesión
            </Link>
        );
    }

    const hoverStyle = (e, isHover) => {
        e.currentTarget.style.backgroundColor = isHover ? '#f9fafb' : 'transparent';
    };

    return (
        <div className="menu-usuario" ref={menuRef} onKeyDown={event => { if (event.key === 'Escape') setIsOpen(false); }}>
            <button 
                type="button"
                aria-label="Menú de usuario"
                aria-expanded={isOpen}
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                }}
            >
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg style={{ width: '20px', height: '20px', color: '#1f2937' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                </div>
                <div>
                    <p className="menu-usuario-saludo" style={{ margin: 0, color: '#4b5563', fontSize: '14px', lineHeight: '1' }}>Hola, {nombreUsuario}</p>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px', lineHeight: '1.2' }}>Mi Cuenta</p>
                </div>
            </button>

            {isOpen && (
                <div className="menu-usuario-panel"
                    style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #f3f4f6',
                        zIndex: 9999
                    }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg style={{ width: '24px', height: '24px', color: '#4b5563' }} fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                </svg>
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>
                                    Bienvenido de nuevo, <span style={{ fontWeight: 'bold', color: 'black' }}>{nombreUsuario}</span>
                                </p>
                                <button 
                                    onClick={cerrarSesion}
                                    style={{ margin: 0, padding: 0, fontSize: '14px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'none' }}
                                >
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '8px', borderBottom: '1px solid #f3f4f6' }}>
                        <Link 
                            to="/mis-pedidos" 
                            onClick={() => setIsOpen(false)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: '#374151', textDecoration: 'none', borderRadius: '6px' }}
                            onMouseOver={(e) => hoverStyle(e, true)}
                            onMouseOut={(e) => hoverStyle(e, false)}
                        >
                            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Mis Pedidos
                        </Link>
                        
                        {/* NUEVO ENLACE: Mis Direcciones */}
                        <Link 
                            to="/mis-direcciones" 
                            onClick={() => setIsOpen(false)}
                            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', color: '#374151', textDecoration: 'none', borderRadius: '6px' }}
                            onMouseOver={(e) => hoverStyle(e, true)}
                            onMouseOut={(e) => hoverStyle(e, false)}
                        >
                            <svg style={{ width: '20px', height: '20px', color: '#6b7280' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Mis direcciones de envío
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MenuUsuario;
