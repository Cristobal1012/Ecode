import { useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function GestorPoliticas() {
  const [titulo, setTitulo] = useState('Términos y Condiciones');
  const [contenido, setContenido] = useState('');

  const handleGuardar = async () => {
    // falta conectar con el endpoint 
    console.log("Guardando página:", titulo);
    console.log("Contenido HTML:", contenido);
    
    alert(`Página "${titulo}" guardada y lista para publicar.`);
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <h2 style={{ marginBottom: '20px', color: 'var(--color-primary)' }}>Gestión de Páginas Legales</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: 'var(--color-text)' }}>
          Selecciona la página a editar:
        </label>
        <select 
          value={titulo} 
          onChange={(e) => setTitulo(e.target.value)}
          style={{ 
            padding: '10px', 
            width: '100%', 
            maxWidth: '400px', 
            borderRadius: '4px', 
            border: '1px solid #ccc',
            fontSize: '1rem'
          }}
        >
          <option value="Términos y Condiciones">Términos y Condiciones</option>
          <option value="Políticas de Privacidad">Políticas de Privacidad</option>
          <option value="Políticas de Reembolso">Políticas de Reembolso</option>
        </select>
      </div>

      
      <div style={{ marginBottom: '20px', height: '350px' }}>
        <ReactQuill 
          theme="snow" 
          value={contenido} 
          onChange={setContenido} 
          style={{ height: '300px' }}
        />
      </div>

      <button 
        onClick={handleGuardar}
        style={{ 
          padding: '12px 24px', 
          backgroundColor: 'var(--color-accent)', 
          color: '#fff', 
          border: 'none', 
          borderRadius: '4px', 
          cursor: 'pointer',
          fontWeight: 'bold',
          marginTop: '40px',
          fontSize: '1rem',
          transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.target.style.opacity = '0.9'}
        onMouseOut={(e) => e.target.style.opacity = '1'}
      >
        Guardar y Publicar
      </button>
    </div>
  );
}