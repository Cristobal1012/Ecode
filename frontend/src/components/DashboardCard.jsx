import React from 'react';

export default function DashboardCard({ titulo, valor, descripcion, icono }) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
        flex: 1,
        minWidth: '220px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b7280', marginBottom: '10px' }}>
        {icono}
        <p
          style={{
            margin: 0,
            fontSize: '0.9rem',
            fontWeight: '500',
          }}
        >
          {titulo}
        </p>
      </div>

      <h3
        style={{
          margin: '0 0 6px',
          color: 'var(--color-text)',
          fontSize: '2rem',
          fontWeight: '700',
        }}
      >
        {valor}
      </h3>

      <p
        style={{
          margin: 0,
          color: '#9ca3af',
          fontSize: '0.85rem',
        }}
      >
        {descripcion}
      </p>
    </div>
  );
}