import React from 'react';

export default function AdminSidebar({
  vistaActiva,
  setVistaActiva,
  setMostrandoFormulario,
  setProductoAEditar,
  navigate
}) {

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
    borderLeft: activo
      ? '4px solid var(--color-accent)'
      : '4px solid transparent',
  });

  return (
    <aside
      style={{
        width: '250px',
        backgroundColor: 'var(--color-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'background-color 0.3s'
      }}
    >
      <div>
        <div
          style={{
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: '10px' }}
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>

          <h1
            style={{
              fontSize: '1.2rem',
              margin: 0,
              color: '#ffffff',
              lineHeight: '1.2',
              textAlign: 'center'
            }}
          >
            Panel de<br />
            administración
          </h1>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Dashboard */}
          <button
            onClick={() => setVistaActiva('dashboard')}
            style={{ ...getEstiloBoton(vistaActiva === 'dashboard'), display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            Dashboard
          </button>

          {/* Inventario */}
          <button
            onClick={() => {
              setVistaActiva('inventario');
              setMostrandoFormulario(false);
              setProductoAEditar(null);
            }}
            style={{ ...getEstiloBoton(vistaActiva === 'inventario'), display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Inventario
          </button>

          {/* Ventas */}
          <button
            onClick={() => setVistaActiva('ventas')}
            style={{ ...getEstiloBoton(vistaActiva === 'ventas'), display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Ventas
          </button>

          {/* Configuración */}
          <button
            onClick={() => setVistaActiva('configuracion')}
            style={{ ...getEstiloBoton(vistaActiva === 'configuracion'), display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Configuración
          </button>

          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '15px 20px' }} />

          {/* Ver catálogo */}
          <button
            onClick={() => navigate('/catalogo')}
            style={{ ...getEstiloBoton(false), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>Ver Catálogo</span>
            <span style={{ fontSize: '1.2rem' }}>↗</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}