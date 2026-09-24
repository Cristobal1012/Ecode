import React from 'react';
import PaletteSelector from '../components/PaletteSelector';

export default function Admin() {
  return (
    <main style={{ minHeight: '80vh', padding: '2rem 1rem', background: '#f3f4f6' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
          Panel de Administración
        </h1>
        <PaletteSelector />
      </div>
    </main>
  );
}