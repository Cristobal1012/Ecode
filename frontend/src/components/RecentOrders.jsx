export default function RecentOrders({ ordenes = [] }) {

  const obtenerColorEstado = (estado) => {
    switch (estado) {
      case 'PAGADO':
        return {
          background: '#dcfce7',
          color: '#166534',
          border: '1px solid #bbf7d0'
        };

      case 'CANCELADO':
        return {
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca'
        };

      case 'PENDIENTE':
      default:
        return {
          background: '#fef3c7',
          color: '#92400e',
          border: '1px solid #fde68a'
        };
    }
  };

  const formatearMonto = (monto) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    }).format(Number(monto) || 0);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '-';

    return new Date(fecha)
      .toLocaleDateString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      .replace(/\//g, '-');
  };

  const ordenesOrdenadas = [...ordenes].sort((a, b) => {
    return new Date(b.fecha_creacion) - new Date(a.fecha_creacion);
  });

  return (
    <section
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color: 'var(--color-text)',
              fontSize: '1.2rem'
            }}
          >
            Últimos pedidos
          </h3>

          <p
            style={{
              margin: '5px 0 0',
              color: '#6b7280',
              fontSize: '0.9rem'
            }}
          >
            Las últimas órdenes registradas en tu tienda.
          </p>
        </div>
      </div>

      {ordenesOrdenadas.length === 0 ? (
        <div
          style={{
            padding: '30px',
            textAlign: 'center',
            color: '#6b7280'
          }}
        >
          No hay pedidos registrados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '650px'
            }}
          >
            <thead>
              <tr>
                {[
                  'Pedido',
                  'Cliente',
                  'Fecha',
                  'Método de pago',
                  'Estado',
                  'Total'
                ].map((titulo) => (
                  <th
                    key={titulo}
                    style={{
                      padding: '12px',
                      textAlign: titulo === 'Total' ? 'right' : 'left',
                      borderBottom: '1px solid #e5e7eb',
                      color: '#6b7280',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ordenesOrdenadas.map((orden) => {
                const estado = obtenerColorEstado(orden.estado);

                return (
                  <tr key={orden.id}>
                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6',
                        fontWeight: '600',
                        color: 'var(--color-text)'
                      }}
                    >
                      #{String(orden.id).padStart(3, '0')}
                    </td>

                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6',
                        color: 'var(--color-text)'
                      }}
                    >
                      {orden.cliente || 'Cliente invitado'}
                    </td>

                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6',
                        color: '#6b7280'
                      }}
                    >
                      {formatearFecha(orden.fecha_creacion)}
                    </td>

                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6',
                        color: '#4b5563'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect
                            x="1"
                            y="4"
                            width="22"
                            height="16"
                            rx="2"
                            ry="2"
                          />
                          <line x1="1" y1="10" x2="23" y2="10" />
                        </svg>

                        {orden.metodo_pago || '-'}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                    >
                      <span
                        style={{
                          ...estado,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}
                      >
                        {orden.estado}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: '15px 12px',
                        borderBottom: '1px solid #f3f4f6',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: 'var(--color-text)'
                      }}
                    >
                      {formatearMonto(orden.total_final)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
