import React, { useState, useEffect } from 'react';
import axios from 'axios';

const PALETTES = [
  {
    id: 1,
    name: 'Eco Natural',
    colors: {
      primary: '#2E7D32',
      secondary: '#81C784',
      accent: '#FFB74D',
      background: '#F1F8E9',
      text: '#1B5E20'
    }
  },
  {
    id: 2,
    name: 'Dark Emerald',
    colors: {
      primary: '#004D40',
      secondary: '#00796B',
      accent: '#80CBC4',
      background: '#E0F2F1',
      text: '#00251A'
    }
  },
  {
    id: 3,
    name: 'Ocean Breeze',
    colors: {
      primary: '#1565C0',
      secondary: '#64B5F6',
      accent: '#FFD54F',
      background: '#E3F2FD',
      text: '#0D47A1'
    }
  },
  {
    id: 4,
    name: 'Warm Amber',
    colors: {
      primary: '#D84315',
      secondary: '#FF8A65',
      accent: '#FFE082',
      background: '#FBE9E7',
      text: '#4E342E'
    }
  }
];

export default function PaletteSelector() {
  const [selectedId, setSelectedId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const applyColorsToRoot = (colors) => {
    if (!colors) return;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-text', colors.text);
  };

  // 1. Al cargar la pantalla, consultar a Django cuál tema está guardado
  useEffect(() => {
    const fetchTema = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/configuracion/');
        // Django puede devolver un objeto o una lista según la vista
        const config = Array.isArray(response.data) ? response.data[0] : response.data;
        const temaId = Number(config?.tema_seleccionado) || 1;

        setSelectedId(temaId);
        const palette = PALETTES.find((p) => p.id === temaId) || PALETTES[0];
        applyColorsToRoot(palette.colors);
      } catch (error) {
        console.error('Error al obtener la configuración del backend:', error);
        // Fallback local si falla la red
        const saved = Number(localStorage.getItem('ecommerce_palette')) || 1;
        setSelectedId(saved);
        const palette = PALETTES.find((p) => p.id === saved) || PALETTES[0];
        applyColorsToRoot(palette.colors);
      }
    };

    fetchTema();
  }, []);

  const handleSelect = (palette) => {
    setSelectedId(palette.id);
    applyColorsToRoot(palette.colors);
  };

  const handleSave = async () => {
    setLoading(true);
    setFeedback(null);
    const token = localStorage.getItem('access_token');

    try {
      await axios.patch(
        'http://127.0.0.1:8000/api/configuracion/',
        { tema_seleccionado: String(selectedId) },
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        }
      );

      localStorage.setItem('ecommerce_palette', selectedId.toString());
      setFeedback({ type: 'success', message: 'Configuración guardada exitosamente en el servidor.' });
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
      margin: '2rem auto', 
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