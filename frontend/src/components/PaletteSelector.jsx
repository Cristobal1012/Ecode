import React, { useState, useEffect } from 'react';
import clienteAxios from "./auth/axiosConfig";
import { PALETTES } from '../constants/palettes';

const applyColorsToRoot = (colors) => {
  // ... tu función se mantiene igual
  if (!colors) return;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-background', colors.background);
  root.style.setProperty('--color-text', colors.text);
};

export default function PaletteSelector() {
  const [selectedId, setSelectedId] = useState(() => {
     // ... tu estado inicial se mantiene igual
    const saved = localStorage.getItem('ecommerce_palette');
    const initialId = saved ? Number(saved) : 1;
    const initialPalette = PALETTES.find((p) => p.id === initialId) || PALETTES[0];
    applyColorsToRoot(initialPalette.colors);
    return initialId;
  });

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // 1. fetchTema LIMPIO usando clienteAxios
  useEffect(() => {
    const fetchTema = async () => {
      try {
        // Tu cliente ya tiene el baseURL http://localhost:8000/api/
        const response = await clienteAxios.get('configuracion/');
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        if (config && config.tema_seleccionado !== undefined) {
          const temaId = Number(config.tema_seleccionado);
          setSelectedId(temaId);
          localStorage.setItem('ecommerce_palette', temaId.toString());
          const palette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
          applyColorsToRoot(palette.colors);
        }
      } catch (error) {
        console.error('Error al sincronizar configuración con backend:', error);
      }
    };

    fetchTema();
  }, []);

  const handleSelect = (palette) => {
      // ... se mantiene igual
    setSelectedId(palette.id);
    applyColorsToRoot(palette.colors);
    localStorage.setItem('ecommerce_palette', palette.id.toString());
    window.dispatchEvent(
      new CustomEvent('themeChanged', { detail: { temaId: palette.id } })
    );
  };

  // 2. handleSave LIMPIO usando clienteAxios
  const handleSave = async () => {
    setLoading(true);
    setFeedback(null);
    // Ya no necesitas sacar el token a mano ni armar los headers, Axios lo hace por ti

    try {
      await clienteAxios.patch('configuracion/negocio/', { 
        tema_seleccionado: String(selectedId) 
      });

      localStorage.setItem('ecommerce_palette', selectedId.toString());
      setFeedback({ type: 'success', message: 'Configuración guardada exitosamente en el servidor.' });

      window.dispatchEvent(
        new CustomEvent('themeChanged', { detail: { temaId: selectedId } })
      );
    } catch (error) {
      console.error('Error al guardar paleta en backend:', error);
      localStorage.setItem('ecommerce_palette', selectedId.toString());
      setFeedback({
        type: 'warning',
        message: 'Guardado localmente. Error de sincronización con el servidor.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '850px',
      // Alineado a la izquierda como el resto de la vista Configuración del panel
      margin: '2rem 0',
      backgroundColor: 'var(--color-background, #fff)', 
      color: 'var(--color-text, #333)',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
      transition: 'all 0.3s ease'
    }}>
      <h2 style={{ marginBottom: '1.5rem', color: 'var(--color-primary, #000)' }}>
        Selector de Paleta de Colores
      </h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {PALETTES.map((palette) => {
          const isSelected = selectedId === palette.id;
          return (
            <div
              key={palette.id}
              onClick={() => handleSelect(palette)}
              style={{
                border: isSelected ? '2px solid var(--color-primary, #000)' : '1px solid #ccc',
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                backgroundColor: isSelected ? '#ffffff' : '#fafafa',
                boxShadow: isSelected ? '0 0 10px rgba(0,0,0,0.15)' : 'none',
                transform: isSelected ? 'scale(1.02)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0' }}>{palette.name}</h4>
              <div style={{ display: 'flex', gap: '6px' }}>
                {Object.values(palette.colors).map((c, i) => (
                  <div 
                    key={i} 
                    style={{ 
                      width: 24, 
                      height: 24, 
                      backgroundColor: c, 
                      borderRadius: 4, 
                      border: '1px solid rgba(0,0,0,0.1)' 
                    }} 
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button 
          onClick={handleSave} 
          disabled={loading} 
          style={{
            padding: '0.7rem 1.4rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            backgroundColor: 'var(--color-primary, #2E7D32)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '1rem',
            transition: 'background-color 0.2s ease'
          }}
        >
          {loading ? 'Guardando...' : 'Guardar Preferencia'}
        </button>
      </div>

      {feedback && (
        <p style={{ 
          marginTop: '1.2rem', 
          color: feedback.type === 'success' ? 'var(--color-primary, #2E7D32)' : '#E65100', 
          fontWeight: 'bold' 
        }}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}