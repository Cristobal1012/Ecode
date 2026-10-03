import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import { PALETTES } from '../constants/palettes';
import Header from '../components/header/header';

const TEMA_PREDETERMINADO = 1;

const HistorialPedidos = () => {
    const [pedidos, setPedidos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [temaConfigurado, setTemaConfigurado] = useState(() => {
        const savedPaletteId = Number(localStorage.getItem('ecommerce_palette'));
        return savedPaletteId || TEMA_PREDETERMINADO;
    });
    const navigate = useNavigate();

    // APLICAR COLORES: Sincroniza la misma paleta del administrador que usa el Catálogo
    useEffect(() => {
        const activePalette = PALETTES.find((p) => p.id === temaConfigurado) || PALETTES[0];
        const root = document.documentElement.style;

        if (activePalette) {
            root.setProperty('--color-primary', activePalette.colors.primary);
            root.setProperty('--color-secondary', activePalette.colors.secondary);
            root.setProperty('--color-accent', activePalette.colors.accent);
            root.setProperty('--color-background', activePalette.colors.background);
            root.setProperty('--color-text', activePalette.colors.text);

            root.setProperty('--catalogo-primary', activePalette.colors.primary);
            root.setProperty('--catalogo-background', activePalette.colors.background);
            root.setProperty('--catalogo-text', activePalette.colors.text);
            
            root.setProperty('--catalogo-on-primary', '#ffffff');
            root.setProperty('--catalogo-surface', '#ffffff');
            root.setProperty('--catalogo-muted-text', '#6b7280');
            root.setProperty('--catalogo-border', '#e5e7eb');
        }
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

    // Función segura para formatear la fecha
    const formatearFecha = (fechaStr) => {
        if (!fechaStr) return 'Fecha no disponible';
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return fechaStr; // Si de plano no es válida, devuelve el texto crudo
        return fecha.toLocaleDateString('es-CL', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    // Función auxiliar para dar estilo visual al estado del pedido
    const obtenerEstiloEstado = (estado) => {
        switch (estado?.toUpperCase()) {
            case 'PAGADO':
            case 'ENTREGADO':
                return { backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' };
            case 'PENDIENTE':
                return { backgroundColor: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' };
            case 'EN_PREPARACION':
                return { backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' };
            case 'ENVIADO':
                return { backgroundColor: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe' };
            default:
                return { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
        }
    };

    return (
        <div style={{ backgroundColor: 'var(--color-background)', minHeight: '100vh', paddingBottom: '50px' }}>
            <Header />
            
            <div style={{ maxWidth: '900px', margin: '30px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                <button 
                    onClick={() => navigate('/catalogo')}
                    style={{ marginBottom: '20px', padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    ← Volver al Catálogo
                </button>

                <h2 style={{ color: 'var(--color-primary)', fontSize: '2rem', marginBottom: '20px' }}>
                    Mi Historial de Pedidos
                </h2>
                
                {cargando ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Cargando tus pedidos...</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#374151' }}>
                                    <th style={{ padding: '12px' }}>N° Orden</th>
                                    <th style={{ padding: '12px' }}>Fecha</th>
                                    <th style={{ padding: '12px' }}>Total</th>
                                    <th style={{ padding: '12px' }}>Estado</th>
                                    <th style={{ padding: '12px' }}>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pedidos.length > 0 ? (
                                    pedidos.map((orden) => (
                                        <tr key={orden.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                            <td style={{ padding: '12px', fontWeight: 'bold', color: '#1f2937' }}>#{orden.id}</td>
                                            <td style={{ padding: '12px', color: '#4b5563' }}>
                                                {/* Usamos orden.fecha o orden.fecha_creacion dependiendo de lo que devuelva la API */}
                                                {formatearFecha(orden.fecha || orden.fecha_creacion)}
                                            </td>
                                            <td style={{ padding: '12px', fontWeight: '500', color: '#1f2937' }}>
                                                ${Number(orden.total_final).toLocaleString('es-CL')}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{ 
                                                    padding: '4px 10px', 
                                                    borderRadius: '12px', 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: 'bold',
                                                    display: 'inline-block',
                                                    ...obtenerEstiloEstado(orden.estado)
                                                }}>
                                                    {orden.estado}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <button 
                                                    onClick={() => navigate(`/seguimiento?orden=${orden.id}`)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline', padding: 0 }}
                                                >
                                                    Ver Seguimiento
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>
                                            Aún no tienes pedidos registrados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistorialPedidos;