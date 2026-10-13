import { useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';

// Nombres de la interfaz. Las transiciones permitidas las informa el backend (AGENTS.md §9)
const ETIQUETAS_ESTADO = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  EN_PREPARACION: 'En Preparación',
  ENVIADO: 'Despachado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado'
};

const ESTILOS_AVISO = {
  error: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b' },
  exito: { backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }
};

const mensajeDeError = (error) => {
  const data = error.response?.data;
  return data?.estado?.[0] || data?.detail || 'Error inesperado. Inténtalo nuevamente.';
};

export default function GestorPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  // { tipo: 'error' | 'exito', texto }
  const [aviso, setAviso] = useState(null);
  // Id del pedido que se está actualizando, para no enviar dos cambios a la vez
  const [enCurso, setEnCurso] = useState(null);

  const cargarPedidos = () => clienteAxios.get('ventas/admin/ordenes/')
    .then((respuesta) => setPedidos(respuesta.data))
    .catch((error) => {
      console.error("Error al cargar las órdenes:", error);
      setAviso({ tipo: 'error', texto: 'No se pudieron cargar los pedidos.' });
    })
    .finally(() => setCargando(false));

  useEffect(() => {
    cargarPedidos();
  }, []);

  const handleCambioEstado = async (pedido, nuevoEstado) => {
    if (nuevoEstado === 'CANCELADO' && !window.confirm(
      `¿Cancelar el pedido #${pedido.id}? No se puede deshacer y el stock descontado vuelve al catálogo.`
    )) return;

    setEnCurso(pedido.id);
    setAviso(null);
    try {
      const { data } = await clienteAxios.patch(`ventas/admin/ordenes/${pedido.id}/estado/`, {
        estado: nuevoEstado
      });
      setAviso(data.requiere_revision
        ? { tipo: 'error', texto: `Pedido #${pedido.id} quedó ${ETIQUETAS_ESTADO[data.estado]}, pero requiere revisión: ${data.motivo_revision}.` }
        : { tipo: 'exito', texto: `Pedido #${pedido.id} actualizado a ${ETIQUETAS_ESTADO[data.estado]}.` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: `No se pudo actualizar el pedido #${pedido.id}: ${mensajeDeError(error)}` });
    } finally {
      // Las transiciones disponibles dependen del nuevo estado
      await cargarPedidos();
      setEnCurso(null);
    }
  };

  const handleResolverRevision = async (pedido) => {
    if (!window.confirm(
      `¿Ya resolviste el pedido #${pedido.id}? (por ejemplo, reembolsaste al comprador o conseguiste el producto)`
    )) return;

    setEnCurso(pedido.id);
    setAviso(null);
    try {
      await clienteAxios.post(`ventas/admin/ordenes/${pedido.id}/revision/resolver/`);
      setAviso({ tipo: 'exito', texto: `Revisión del pedido #${pedido.id} marcada como resuelta.` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: `No se pudo resolver la revisión del pedido #${pedido.id}: ${mensajeDeError(error)}` });
    } finally {
      await cargarPedidos();
      setEnCurso(null);
    }
  };

  // RF-02.3: si Chilexpress falló al confirmarse el pago, el admin reintenta la orden de transporte
  const handleGenerarOT = async (pedido) => {
    setEnCurso(pedido.id);
    setAviso(null);
    try {
      const { data } = await clienteAxios.post(`ventas/admin/ordenes/${pedido.id}/orden-transporte/`);
      setAviso({ tipo: 'exito', texto: `Orden de transporte ${data.numero_seguimiento_tracking} generada para el pedido #${pedido.id}.` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: `No se pudo generar la orden de transporte del pedido #${pedido.id}: ${mensajeDeError(error)}` });
    } finally {
      await cargarPedidos();
      setEnCurso(null);
    }
  };

  const celdaEnvio = (pedido) => {
    if (pedido.numero_seguimiento_tracking) {
      return <span>OT {pedido.numero_seguimiento_tracking}</span>;
    }
    if (pedido.proveedor_logistico === 'RETIRO_LOCAL') {
      return <span style={{ color: '#4b5563' }}>Retiro en local</span>;
    }
    if (pedido.proveedor_logistico !== 'CHILEXPRESS') {
      return <span style={{ color: '#4b5563' }}>{pedido.proveedor_logistico || '—'}</span>;
    }
    return (
      <div style={{ fontSize: '0.9rem' }}>
        {pedido.error_orden_transporte ? (
          <div style={{ color: '#991b1b' }}>
            <strong>Sin OT:</strong> {pedido.error_orden_transporte}
          </div>
        ) : (
          <span style={{ color: '#4b5563' }}>Sin OT</span>
        )}
        {pedido.puede_generar_orden_transporte && (
          <div>
            <button
              type="button"
              onClick={() => handleGenerarOT(pedido)}
              disabled={enCurso === pedido.id}
              style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fff', color: '#1d4ed8', border: '1px solid #1d4ed8', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {pedido.error_orden_transporte ? 'Reintentar OT' : 'Generar OT'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (cargando) return <div style={{ padding: '20px' }}>Cargando panel de pedidos...</div>;

  return (
    <div>
      {aviso && (
        <div
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          style={{ ...ESTILOS_AVISO[aviso.tipo], padding: '12px 16px', borderRadius: '6px', marginBottom: '16px' }}
        >
          {aviso.texto}
        </div>
      )}

      <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '12px' }}>Nº Orden</th>
              <th style={{ padding: '12px' }}>Cliente</th>
              <th style={{ padding: '12px' }}>Total</th>
              <th style={{ padding: '12px' }}>Estado Actual</th>
              <th style={{ padding: '12px' }}>Revisión</th>
              <th style={{ padding: '12px' }}>Envío</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map(pedido => {
              const transiciones = pedido.transiciones_permitidas || [];
              return (
                <tr key={pedido.id} style={{ borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>#{pedido.id}</td>
                  <td style={{ padding: '12px' }}>{pedido.email_cliente || 'Usuario Registrado'}</td>
                  <td style={{ padding: '12px' }}>${Number(pedido.total_final).toLocaleString('es-CL')}</td>
                  <td style={{ padding: '12px' }}>
                    <select
                      aria-label={`Estado del pedido #${pedido.id}`}
                      value={pedido.estado}
                      onChange={(e) => handleCambioEstado(pedido, e.target.value)}
                      disabled={transiciones.length === 0 || enCurso === pedido.id}
                      style={{
                        padding: '6px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        cursor: transiciones.length === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <option value={pedido.estado}>{ETIQUETAS_ESTADO[pedido.estado] || pedido.estado}</option>
                      {transiciones.map(estado => (
                        <option key={estado} value={estado}>
                          {ETIQUETAS_ESTADO[estado] || estado}
                        </option>
                      ))}
                    </select>
                    {pedido.estado === 'CANCELADO' && pedido.motivo_cancelacion && (
                      <div style={{ marginTop: '6px', fontSize: '0.85rem', color: '#4b5563' }}>
                        {pedido.motivo_cancelacion}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {pedido.requiere_revision ? (
                      <div style={{ backgroundColor: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', borderRadius: '6px', padding: '8px 10px', fontSize: '0.9rem' }}>
                        <strong>Requiere revisión:</strong> {pedido.motivo_revision}
                        <div>
                          <button
                            type="button"
                            onClick={() => handleResolverRevision(pedido)}
                            disabled={enCurso === pedido.id}
                            style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#fff', color: '#92400e', border: '1px solid #d97706', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Marcar como revisada
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: '#6b7280' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>{celdaEnvio(pedido)}</td>
                </tr>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                  No hay pedidos registrados en la tienda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
