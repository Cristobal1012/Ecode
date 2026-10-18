import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import { PALETTES } from '../constants/palettes';
import Header from '../components/header/header';

const TEMA_PREDETERMINADO = 1;

const MisDirecciones = () => {
    const [direcciones, setDirecciones] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [mensajeExito, setMensajeExito] = useState('');
    
    // Estados para el formulario de nueva dirección
    const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
    const [listaComunas, setListaComunas] = useState([]);
    // Las comunas se piden una sola vez, al abrir la página
    const [cargandoComunas, setCargandoComunas] = useState(true);
    
    const [nuevaDireccion, setNuevaDireccion] = useState({
        calle: '',
        calle_numero: '',
        dpto_casa: '', // <- NUEVO CAMPO
        comuna: '',
        ciudad: '',
        region: '',
        es_predeterminado: false
    });

    const [temaConfigurado, setTemaConfigurado] = useState(() => {
        const savedPaletteId = Number(localStorage.getItem('ecommerce_palette'));
        return savedPaletteId || TEMA_PREDETERMINADO;
    });
    
    const navigate = useNavigate();

    // APLICAR COLORES ADAPTATIVOS
    useEffect(() => {
        const activePalette = PALETTES.find((p) => p.id === temaConfigurado) || PALETTES[0];
        const root = document.documentElement.style;

        if (activePalette) {
            root.setProperty('--color-primary', activePalette.colors.primary);
            root.setProperty('--color-secondary', activePalette.colors.secondary);
            root.setProperty('--color-accent', activePalette.colors.accent);
            root.setProperty('--color-background', activePalette.colors.background);
            root.setProperty('--color-text', activePalette.colors.text);
        }
    }, [temaConfigurado]);

    // Crear, marcar como principal o eliminar sube la versión y el efecto vuelve a pedir la lista
    const [versionDirecciones, setVersionDirecciones] = useState(0);
    const cargarDirecciones = () => {
        setCargando(true);
        setVersionDirecciones((version) => version + 1);
    };

    useEffect(() => {
        // Si se pide otra versión antes de que responda el servidor, la respuesta vieja se descarta
        let vigente = true;
        clienteAxios.get('ventas/direcciones/')
            .then(({ data }) => {
                if (!vigente) return;
                setDirecciones(data);
                setError('');
            })
            .catch((err) => {
                if (!vigente) return;
                console.error("Error cargando direcciones:", err);
                setError('No se pudieron cargar tus direcciones. Intenta de nuevo.');
            })
            .finally(() => {
                if (vigente) setCargando(false);
            });
        return () => { vigente = false; };
    }, [versionDirecciones]);

    // CARGAR CONFIGURACIÓN Y COMUNAS
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


        clienteAxios.get('ventas/logistica/comunas/')
            .then((response) => setListaComunas(response.data.comunas || []))
            .catch((err) => console.error("Error cargando comunas:", err))
            .finally(() => setCargandoComunas(false));
    }, []);

    const handleCrearDireccion = async (e) => {
        e.preventDefault();
        setError('');
        setMensajeExito('');
        
        try {
            await clienteAxios.post('ventas/direcciones/', nuevaDireccion);
            setMensajeExito('Dirección guardada exitosamente.');
            setMostrandoFormulario(false);
            setNuevaDireccion({ calle: '', calle_numero: '', dpto_casa: '', comuna: '', ciudad: '', region: '', es_predeterminado: false });
            cargarDirecciones();
        } catch (err) {
            setError('Hubo un error al guardar la dirección. Verifica los datos.');
            console.error(err);
        }
    };

    const marcarComoPrincipal = async (id) => {
        try {
            setError('');
            await clienteAxios.patch(`ventas/direcciones/${id}/`, { es_predeterminado: true });
            setMensajeExito('Dirección principal actualizada.');
            cargarDirecciones();
        } catch (err) {
            setError('No se pudo actualizar la dirección principal.');
            console.error(err);
        }
    };

    const eliminarDireccion = async (id) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar esta dirección?')) return;
        
        try {
            setError('');
            await clienteAxios.delete(`ventas/direcciones/${id}/`);
            setMensajeExito('Dirección eliminada correctamente.');
            cargarDirecciones();
        } catch (err) {
            setError('No se pudo eliminar la dirección.');
            console.error(err);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setNuevaDireccion({
            ...nuevaDireccion,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const inputStyle = { width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '4px' };

    return (
        <div style={{ backgroundColor: 'var(--color-background)', minHeight: '100vh', paddingBottom: '50px' }}>
            <Header />
            
            <div style={{ maxWidth: '900px', margin: '30px auto', padding: '20px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
                <button 
                    onClick={() => navigate('/catalogo')}
                    style={{ marginBottom: '20px', padding: '8px 14px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#374151' }}
                >
                    ← Volver a la Tienda
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ color: 'var(--color-primary)', fontSize: '2rem', margin: 0 }}>
                        Mis Direcciones de Envío
                    </h2>
                    {!mostrandoFormulario && (
                        <button 
                            onClick={() => setMostrandoFormulario(true)}
                            style={{ padding: '10px 15px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            + Nueva Dirección
                        </button>
                    )}
                </div>

                {error && <div style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>{error}</div>}
                {mensajeExito && <div style={{ padding: '12px', marginBottom: '20px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '6px' }}>{mensajeExito}</div>}
                
                {/* FORMULARIO NUEVA DIRECCIÓN */}
                {mostrandoFormulario && (
                    <div style={{ marginBottom: '30px', padding: '20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#374151' }}>Agregar Nueva Dirección</h3>
                        <form onSubmit={handleCrearDireccion}>
                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div style={{ flex: 3 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Calle</label>
                                    <input type="text" name="calle" value={nuevaDireccion.calle} onChange={handleChange} required style={inputStyle} placeholder="Ej: Av. Providencia" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Número</label>
                                    <input type="text" name="calle_numero" value={nuevaDireccion.calle_numero} onChange={handleChange} required style={inputStyle} placeholder="Ej: 1234" />
                                </div>
                            </div>
                            
                            {/* NUEVO CAMPO: Dpto / Casa */}
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Dpto, Casa o Referencia (Opcional)</label>
                                <input type="text" name="dpto_casa" value={nuevaDireccion.dpto_casa} onChange={handleChange} style={inputStyle} placeholder="Ej: Depto 505 / Casa 12 / Condominio Las Rosas" />
                            </div>
                            
                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Comuna</label>
                                    <select 
                                        name="comuna" value={nuevaDireccion.comuna} onChange={handleChange} 
                                        required disabled={cargandoComunas} style={{...inputStyle, backgroundColor: 'white'}}
                                    >
                                        <option value="">{cargandoComunas ? "Cargando..." : "-- Selecciona --"}</option>
                                        {listaComunas.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Ciudad</label>
                                    <input type="text" name="ciudad" value={nuevaDireccion.ciudad} onChange={handleChange} required style={inputStyle} placeholder="Ej: Santiago" />
                                </div>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#4b5563' }}>Región (Opcional)</label>
                                <input type="text" name="region" value={nuevaDireccion.region} onChange={handleChange} style={inputStyle} placeholder="Ej: Metropolitana" />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.9rem', color: '#4b5563', cursor: 'pointer' }}>
                                    <input type="checkbox" name="es_predeterminado" checked={nuevaDireccion.es_predeterminado} onChange={handleChange} style={{ marginRight: '8px', width: '16px', height: '16px' }} />
                                    Establecer como dirección principal
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setMostrandoFormulario(false)} style={{ padding: '10px 15px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Cancelar
                                </button>
                                <button type="submit" style={{ padding: '10px 15px', backgroundColor: 'var(--color-secondary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Guardar Dirección
                                </button>
                            </div>
                        </form>
                    </div>
                )}
                
                {/* LISTADO DE DIRECCIONES */}
                {cargando ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Cargando tus direcciones...</div>
                ) : direcciones.length > 0 ? (
                    <div style={{ display: 'grid', gap: '15px' }}>
                        {direcciones.map(dir => (
                            <div key={dir.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px', border: dir.es_predeterminado ? '2px solid var(--color-primary)' : '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: dir.es_predeterminado ? '#f0f9ff' : 'white' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                        {/* ACTUALIZADO: Muestra dpto_casa si existe */}
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
                                            {dir.calle} {dir.calle_numero} {dir.dpto_casa && `- ${dir.dpto_casa}`}
                                        </h3>
                                        {dir.es_predeterminado && (
                                            <span style={{ backgroundColor: 'var(--color-primary)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>Principal</span>
                                        )}
                                    </div>
                                    <p style={{ margin: '5px 0', color: '#4b5563', fontSize: '0.95rem' }}>{dir.comuna}, {dir.ciudad}</p>
                                    {dir.region && <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>{dir.region}</p>}
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                    {!dir.es_predeterminado && (
                                        <button 
                                            onClick={() => marcarComoPrincipal(dir.id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', textDecoration: 'underline' }}
                                        >
                                            Hacer principal
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => eliminarDireccion(dir.id)}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', textDecoration: 'underline' }}
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    !mostrandoFormulario && (
                        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', color: '#6b7280' }}>
                            <p style={{ marginBottom: '15px' }}>Aún no tienes direcciones guardadas.</p>
                            <button 
                                onClick={() => setMostrandoFormulario(true)}
                                style={{ padding: '10px 15px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Agregar mi primera dirección
                            </button>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default MisDirecciones;