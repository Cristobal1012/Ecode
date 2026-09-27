import React, { useState } from 'react';
// Ajusté la ruta según la captura de tu estructura de carpetas
import PaletteSelector from '../components/PaletteSelector'; 

export default function Admin() {
  // Estado para controlar qué pestaña está activa
  const [vistaActiva, setVistaActiva] = useState('dashboard');

  // Función para renderizar el contenido dinámico según la selección
  const renderizarContenido = () => {
    switch (vistaActiva) {
      case 'dashboard':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Dashboard</h2>
            <p>Aquí irán los gráficos y métricas principales de tu e-commerce.</p>
          </div>
        );
      case 'inventario':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Inventario</h2>
            <p>Aquí estará la tabla para crear, editar y eliminar productos.</p>
          </div>
        );
      case 'ventas':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Ventas</h2>
            <p>Aquí podrás ver el historial de pedidos y su estado.</p>
          </div>
        );
      case 'configuracion':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Configuración</h2>
            {/* El selector de paleta ahora vive exclusivamente aquí */}
            <PaletteSelector />
          </div>
        );
      default:
        return <h2>Bienvenido al Panel</h2>;
    }
  };

  // Objeto de estilos para limpiar el código de los botones
  const getEstiloBoton = (activo) => ({
    width: '100%',
    padding: '15px 20px',
    background: activo ? '#374151' : 'transparent',
    color: 'white',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'background 0.2s',
    fontWeight: activo ? 'bold' : 'normal',
    borderLeft: activo ? '4px solid #3b82f6' : '4px solid transparent',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'sans-serif' }}>
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside style={{ width: '250px', backgroundColor: '#1f2937', color: 'white', display: 'flex', flexDirection: 'column', paddingTop: '20px' }}>
        <h1 style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '40px', padding: '0 20px' }}>
          Admin Panel
        </h1>
        
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          <button 
            onClick={() => setVistaActiva('dashboard')} 
            style={getEstiloBoton(vistaActiva === 'dashboard')}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setVistaActiva('inventario')} 
            style={getEstiloBoton(vistaActiva === 'inventario')}
          >
            Inventario
          </button>
          <button 
            onClick={() => setVistaActiva('ventas')} 
            style={getEstiloBoton(vistaActiva === 'ventas')}
          >
            Ventas
          </button>
          <button 
            onClick={() => setVistaActiva('configuracion')} 
            style={getEstiloBoton(vistaActiva === 'configuracion')}
          >
            Configuración
          </button>
        </nav>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, padding: '40px' }}>
        <div style={{ 
          background: 'white', 
          padding: '30px', 
          borderRadius: '8px', 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
          minHeight: '80vh' 
        }}>
          {renderizarContenido()}
        </div>
      </main>
      
    </div>
  );
}