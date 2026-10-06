import React, { useEffect, useState } from 'react';
import clienteAxios from './auth/axiosConfig';
import DashboardCard from './DashboardCard';
import RecentOrders from './RecentOrders';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export default function Dashboard({ busqueda = '', onVerTodos }) {
  const [metricas, setMetricas] = useState({
    total_historico: 0,
    total_mensual: 0,
  });

  const [historico, setHistorico] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');

  const formatearMonto = (monto) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(Number(monto) || 0);
  };

  const formatearFecha = (fecha) => {
    const [anio, mes, dia] = fecha.split('-');

    return `${dia}/${mes}`;
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
        const historicoRecibido = response.data.historico || [];

        setHistorico(
          historicoRecibido.map((registro) => ({
            ...registro,
            fechaFormateada: formatearFecha(registro.fecha),
          }))
        );

        const ordenesRecibidas = response.data.ultimas_ordenes || [];
        setOrdenes(ordenesRecibidas);

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
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '25px',
          marginBottom: '30px',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3
          style={{
            margin: '0 0 5px',
            color: 'var(--color-text)',
            fontSize: '1.2rem',
          }}
        >
          Histórico de ventas
        </h3>

        <p
          style={{
            margin: '0 0 25px',
            color: '#6b7280',
            fontSize: '0.9rem',
          }}
        >
          Evolución de las ventas pagadas según el período seleccionado.
        </p>

        {historico.length > 0 ? (
          <div style={{ width: '100%', height: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={historico}
                margin={{
                  top: 10,
                  right: 20,
                  left: 10,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                />

                <XAxis
                  dataKey="fechaFormateada"
                  tick={{
                    fill: '#6b7280',
                    fontSize: 12,
                  }}
                />

                <YAxis
                  tick={{
                    fill: '#6b7280',
                    fontSize: 12,
                  }}
                  tickFormatter={(valor) => formatearMonto(valor)}
                />

                <Tooltip
                  formatter={(valor) => [
                    formatearMonto(valor),
                    'Ventas',
                  ]}
                  labelFormatter={(fecha) => `Fecha: ${fecha}`}
                />

                <Line
                  type="monotone"
                  dataKey="ventas"
                  name="Ventas"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{
                    r: 4,
                    fill: 'var(--color-primary)',
                  }}
                  activeDot={{
                    r: 6,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            style={{
              padding: '50px 20px',
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            No existen ventas pagadas para el período seleccionado.
          </div>
        )}
      </section>

      {/* Últimos pedidos */}
      <RecentOrders
        ordenes={ordenes}
        busqueda={busqueda}
      />
    </div>
  );
}