import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Importamos useNavigate
import PaletteSelector from '../components/PaletteSelector';
import clienteAxios from '../components/auth/axiosConfig'; 
import { PALETTES } from '../constants/palettes';

export default function Admin() {
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const navigate = useNavigate(); // 2. Inicializamos el hook de navegación

  useEffect(() => {
    const savedPaletteId = Number(localStorage.getItem('ecommerce_palette')) || 1;
    const activePalette = PALETTES.find((p) => p.id === savedPaletteId) || PALETTES[0];

    const applyColors = (colors) => {
      if (!colors) return;
      const root = document.documentElement;
      root.style.setProperty('--color-primary', colors.primary);
      root.style.setProperty('--color-secondary', colors.secondary);
      root.style.setProperty('--color-accent', colors.accent);
      root.style.setProperty('--color-background', colors.background);
      root.style.setProperty('--color-text', colors.text);
    };

    applyColors(activePalette.colors);

    const fetchTema = async () => {
      try {
        const response = await clienteAxios.get('configuracion/negocio/');
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        if (config && config.tema_seleccionado !== undefined) {
          const temaId = Number(config.tema_seleccionado);
          localStorage.setItem('ecommerce_palette', temaId.toString());
          const palette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
          applyColors(palette.colors);
        }
      } catch (error) {
        console.error('Error al sincronizar colores en el panel Admin:', error);
      }
    };

    fetchTema();

    const handleThemeChanged = (e) => {
      const temaId = e.detail.temaId;
      const newPalette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
      applyColors(newPalette.colors);
    };

    window.addEventListener('themeChanged', handleThemeChanged);
    return () => window.removeEventListener('themeChanged', handleThemeChanged);
  }, []);

  const renderizarContenido = () => {
    switch (vistaActiva) {
      case 'dashboard':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Dashboard</h2>
            <p style={{ color: 'var(--color-text)' }}>Aquí irán los gráficos y métricas principales de tu e-commerce.</p>
          </div>
        );
      case 'inventario':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Inventario</h2>
            <p style={{ color: 'var(--color-text)' }}>Aquí estará la tabla para crear, editar y eliminar productos.</p>
          </div>
        );
      case 'ventas':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Ventas</h2>
            <p style={{ color: 'var(--color-text)' }}>Aquí podrás ver el historial de pedidos y su estado.</p>
          </div>
        );
      case 'configuracion':
        return (
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', color: 'var(--color-primary)' }}>Configuración</h2>
            <PaletteSelector />
          </div>
        );
      default:
        return <h2 style={{ color: 'var(--color-text)' }}>Bienvenido al Panel</h2>;
    }
  };

  const getEstiloBoton = (activo) => ({
    width: '100%',
    padding: '15px 20px',
    background: activo ? 'var(--color-secondary)' : 'transparent',
    color: activo ? '#ffffff' : 'rgba(255,255,255,0.7)',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.2s',
    fontWeight: activo ? 'bold' : 'normal',
    borderLeft: activo ? '4px solid var(--color-accent)' : '4px solid transparent',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-background)', fontFamily: 'sans-serif' }}>
      
      <aside style={{ width: '250px', backgroundColor: 'var(--color-primary)', display: 'flex', flexDirection: 'column', paddingTop: '20px', transition: 'background-color 0.3s' }}>
        <h1 style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '40px', padding: '0 20px', color: '#ffffff' }}>
          Panel de administración
        </h1>
        
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={() => setVistaActiva('dashboard')} style={getEstiloBoton(vistaActiva === 'dashboard')}>
            Dashboard
          </button>
          <button onClick={() => setVistaActiva('inventario')} style={getEstiloBoton(vistaActiva === 'inventario')}>
            Inventario
          </button>
          <button onClick={() => setVistaActiva('ventas')} style={getEstiloBoton(vistaActiva === 'ventas')}>
            Ventas
          </button>
          <button onClick={() => setVistaActiva('configuracion')} style={getEstiloBoton(vistaActiva === 'configuracion')}>
            Configuración
          </button>

          {/* 3. Separador visual sutil */}
          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '15px 20px' }}></div>

          {/* 4. Botón de navegación externa al catálogo */}
          <button 
            onClick={() => navigate('/catalogo')} 
            style={{...getEstiloBoton(false), display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
          >
            <span>Ver Catálogo</span>
            <span style={{ fontSize: '1.2rem' }}>↗</span>
          </button>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '40px', transition: 'background-color 0.3s' }}>
        <div style={{ 
          background: '#ffffff', 
          padding: '30px', 
          borderRadius: '8px', 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
          minHeight: '80vh',
          borderTop: '6px solid var(--color-primary)',
          transition: 'border-color 0.3s'
        }}>
          {renderizarContenido()}
        </div>
      </main>
    </div>
  );
}