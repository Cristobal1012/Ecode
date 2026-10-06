import React, { useEffect, useState } from 'react';
import clienteAxios from './auth/axiosConfig';
import DashboardCard from './DashboardCard';
import RecentOrders from './RecentOrders';

export default function Dashboard({ busqueda = '', onVerTodos }) {
  const [metricas, setMetricas] = useState({
    total_historico: 0,
    total_mensual: 0,
  });

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Fechas seleccionadas por el usuario
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Fechas que realmente se están aplicando al filtro
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');

  const formatearMonto = (monto) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Number(monto) || 0);
  };

  useEffect(() => {
    const cargarDashboard = async () => {
      setCargando(true);
      setError('');

      try {
        const response = await clienteAxios.get('ventas/dashboard/metricas/', {
          params: {
            fecha_inicio: filtroFechaInicio || undefined,
            fecha_fin: filtroFechaFin || undefined,
          },
        });

        setMetricas(
          response.data.metricas || {
            total_historico: 0,
            total_mensual: 0,
          }
        );

        // Obtener las últimas órdenes entregadas por el backend
        const ordenesRecibidas = response.data.ultimas_ordenes || [];

        // Filtrar las órdenes según las fechas seleccionadas
        const ordenesFiltradas = ordenesRecibidas.filter((orden) => {
          const fechaOrden = new Date(orden.fecha_creacion);

          if (filtroFechaInicio) {
            const inicio = new Date(`${filtroFechaInicio}T00:00:00`);

            if (fechaOrden < inicio) {
              return false;
            }
          }

          if (filtroFechaFin) {
            const fin = new Date(`${filtroFechaFin}T23:59:59`);

            if (fechaOrden > fin) {
              return false;
            }
          }

          return true;
        });

        setOrdenes(ordenesFiltradas);
      } catch (error) {
        console.error('Error cargando métricas del dashboard:', error);
        setError('No fue posible cargar la información del dashboard.');
      } finally {
        setCargando(false);
      }
    };

    cargarDashboard();
  }, [filtroFechaInicio, filtroFechaFin]);

  const aplicarFiltro = () => {
    setFiltroFechaInicio(fechaInicio);
    setFiltroFechaFin(fechaFin);
  };

  const limpiarFiltro = () => {
    setFechaInicio('');
    setFechaFin('');
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
  };

  if (cargando) {
    return (
      <div style={{ padding: '20px 0' }}>
        <h2
          style={{
            margin: 0,
            color: 'var(--color-text)',
            fontSize: '1.8rem',
          }}
        >
          Dashboard
        </h2>

        <p style={{ color: '#6b7280' }}>
          Cargando información...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2
          style={{
            margin: 0,
            color: 'var(--color-text)',
            fontSize: '1.8rem',
          }}
        >
          Dashboard
        </h2>

        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Encabezado */}
      <div style={{ marginBottom: '25px' }}>
        <h2
          style={{
            margin: 0,
            color: 'var(--color-text)',
            fontSize: '1.8rem',
            fontWeight: '700',
          }}
        >
          Dashboard
        </h2>

        <p
          style={{
            margin: '6px 0 0',
            color: '#6b7280',
            fontSize: '0.95rem',
          }}
        >
          Resumen general del rendimiento de tu tienda.
        </p>
      </div>

      {/* Filtro por rango de fechas */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '15px',
          marginBottom: '25px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#374151',
            }}
          >
            Desde
          </label>

          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              color: '#374151',
              backgroundColor: '#ffffff',
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#374151',
            }}
          >
            Hasta
          </label>

          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              color: '#374151',
              backgroundColor: '#ffffff',
              fontSize: '0.9rem',
            }}
          />
        </div>

        <button
          onClick={aplicarFiltro}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: '7px',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Filtrar
        </button>

        {(fechaInicio || fechaFin) && (
          <button
            onClick={limpiarFiltro}
            style={{
              padding: '10px 18px',
              border: '1px solid #d1d5db',
              borderRadius: '7px',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Métricas */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          flexWrap: 'wrap',
          marginBottom: '30px',
        }}
      >
        <DashboardCard
          titulo="Ventas históricas"
          valor={formatearMonto(metricas.total_historico)}
          descripcion="Total acumulado de ventas pagadas"
          icono={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
          }
        />

        <DashboardCard
          titulo="Ventas del mes"
          valor={formatearMonto(metricas.total_mensual)}
          descripcion="Ventas pagadas durante el mes actual"
          icono={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        />
      </div>

      {/* Resumen */}
      <section
        style={{
          backgroundColor: '#e6f4f1',
          borderRadius: '12px',
          padding: '25px',
          marginBottom: '30px',
          border: '1px solid #cce8e1',
          textAlign: 'center',
        }}
      >
        <h3
          style={{
            margin: '0 0 8px',
            color: '#0f3a2b',
            fontSize: '1.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 20V10" />
            <path d="M12 20V4" />
            <path d="M6 20v-6" />
          </svg>

          Resumen de ventas
        </h3>

        <p
          style={{
            margin: 0,
            color: '#4a6b62',
            fontSize: '0.9rem',
          }}
        >
          La visualización histórica de ventas estará disponible próximamente.
        </p>
      </section>

      {/* Últimos pedidos */}
      <RecentOrders
        ordenes={ordenes}
        busqueda={busqueda}
      />
    </div>
  );
}
