import { useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';

// Nombres de la interfaz. Las transiciones permitidas las informa el backend
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
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalPedidos, setTotalPedidos] = useState(0);
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [filtroRevision, setFiltroRevision] = useState(false);

  const cargarPedidos = () => {
    setCargando(true);
    
    const params = new URLSearchParams({ page: paginaActual });
    if (filtroEstado !== 'Todos') params.append('estado', filtroEstado);
    if (filtroRevision) params.append('requiere_revision', 'true');

    clienteAxios.get(`ventas/admin/ordenes/?${params.toString()}`)
      .then((respuesta) => {
        
        setPedidos(respuesta.data.results);
        setTotalPedidos(respuesta.data.count); 
      })
      .catch((error) => {
        console.error("Error al cargar las órdenes:", error);
        setAviso({ tipo: 'error', texto: 'No se pudieron cargar los pedidos.' });
      })
      .finally(() => setCargando(false));
  };

  // El useEffect ahora se dispara cada vez que cambia la página o un filtro
  useEffect(() => {
    cargarPedidos();
  }, [paginaActual, filtroEstado, filtroRevision]);

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
      setTimeout(() => {
        setAviso(null);
      }, 5000);
    }
  };

    // Registra una transferencia recibida después de cancelar el pedido por vencimiento.
  const handleRegistrarPagoFueraPlazo = async (pedido) => {
    setEnCurso(pedido.id);
    setAviso(null);

    try {
      await clienteAxios.post(
        `ventas/admin/ordenes/${pedido.id}/pago-fuera-plazo/`
      );

      setAviso({
        tipo: 'exito',
        texto: `Pago fuera de plazo registrado. El pedido #${pedido.id} quedó pendiente de revisión.`,
      });
    } catch (error) {
      setAviso({
        tipo: 'error',
        texto: `No se pudo registrar el pago fuera de plazo del pedido #${pedido.id}: ${mensajeDeError(error)}`,
      });
    } finally {
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
      return <span style={{ color: 'var(--color-muted)' }}>Retiro en local</span>;
    }
    if (pedido.proveedor_logistico === 'ENTREGA_COORDINADA') {
      // La entrega la hace la tienda: la dirección para coordinarla con el comprador
      const direccion = pedido.direccion_envio_snapshot || {};
      const texto = [[direccion.calle, direccion.numero].filter(Boolean).join(' '), direccion.dpto_casa, direccion.comuna]
        .filter(Boolean).join(', ');
      return (
        <div style={{ fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--color-muted)' }}>Entrega coordinada</span>
          {texto && <div>{texto}</div>}
        </div>
      );
    }
    if (pedido.proveedor_logistico !== 'CHILEXPRESS') {
      return <span style={{ color: 'var(--color-muted)' }}>{pedido.proveedor_logistico || '—'}</span>;
    }
    return (
      <div style={{ fontSize: '0.9rem' }}>
        {pedido.error_orden_transporte ? (
          <div style={{ color: '#991b1b' }}>
            <strong>Sin OT:</strong> {pedido.error_orden_transporte}
          </div>
        ) : (
          <span style={{ color: 'var(--color-muted)' }}>Sin OT</span>
        )}
        {pedido.puede_generar_orden_transporte && (
          <div>
            <button
              type="button"
              onClick={() => handleGenerarOT(pedido)}
              disabled={enCurso === pedido.id}
              style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {pedido.error_orden_transporte ? 'Reintentar OT' : 'Generar OT'}
            </button>
          </div>
        )}
      </div>
    );
  };

  if (cargando) return <div style={{ padding: '20px' }}>Cargando panel de pedidos...</div>;

  const obtenerMensajeVacio = () => {
  if (filtroRevision) return 'No hay pedidos que requieran revisión.';

  // Verifica que el filtro no esté en su valor por defecto (ej. '' o 'TODOS')
  if (filtroEstado && filtroEstado !== 'Todos' && filtroEstado !== '') {
    const textosEstado = {
      'PENDIENTE': 'pendientes',
      'PAGADO': 'pagados',
      'EN_PREPARACION': 'en preparación',
      'EN_RUTA': 'en ruta',
      'ENTREGADO': 'entregados',
      'CANCELADO': 'cancelados'
    };
    const estadoFormateado = textosEstado[filtroEstado] || filtroEstado.toLowerCase();
    return `No hay pedidos ${estadoFormateado} en este momento.`;
  }

  return 'No hay pedidos registrados en la tienda.';
};

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

      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select 
          value={filtroEstado} 
          onChange={(e) => { setFiltroEstado(e.target.value); setPaginaActual(1); }}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
        >
          <option value="Todos">Todos los estados</option>
          {Object.entries(ETIQUETAS_ESTADO).map(([clave, valor]) => (
            <option key={clave} value={clave}>{valor}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={filtroRevision} 
            onChange={(e) => { setFiltroRevision(e.target.checked); setPaginaActual(1); }}
          />
          Requiere revisión
        </label>
        
        <span style={{ marginLeft: 'auto', fontSize: '0.9rem', color: 'var(--color-muted)' }}>
          {totalPedidos} pedido(s) encontrado(s)
        </span>
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: 'var(--color-secondary)', borderBottom: '2px solid var(--color-border)' }}>
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
                <tr key={pedido.id} style={{ borderBottom: '1px solid var(--color-border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>#{pedido.id}</td>
                  <td style={{ padding: '12px' }}>
                    {pedido.email_cliente || 'Usuario Registrado'}
                    {pedido.nombre_destinatario && (
                      // Quién recibe o retira (RF-02.3): a quién contactar para coordinar la entrega
                      <div style={{ marginTop: '4px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        Recibe: {pedido.nombre_destinatario}
                        {pedido.telefono_destinatario && (
                          <> · <a href={`tel:${pedido.telefono_destinatario}`} style={{ color: 'var(--color-primary)' }}>{pedido.telefono_destinatario}</a></>
                        )}
                      </div>
                    )}
                    {pedido.datos_empresa && (
                      // Compra como empresa: la tienda emite la factura con estos datos
                      <div style={{ marginTop: '4px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        <strong style={{ color: 'var(--color-text)' }}>Factura:</strong> {pedido.datos_empresa.razon_social} · RUT {pedido.datos_empresa.rut}
                        <div>{pedido.datos_empresa.giro} · {pedido.datos_empresa.direccion}</div>
                        <a href={`mailto:${pedido.datos_empresa.correo}`} style={{ color: 'var(--color-primary)' }}>{pedido.datos_empresa.correo}</a>
                      </div>
                    )}
                  </td>
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
                        border: '1px solid var(--color-border)',
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
                      <div style={{ marginTop: '6px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
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
                            style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'var(--color-surface)', color: '#92400e', border: '1px solid #d97706', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            Marcar como revisada
                          </button>
                        </div>
                      </div>
                                        ) : pedido.estado === 'CANCELADO' &&
                      pedido.motivo_cancelacion === 'Pago no recibido a tiempo' ? (
                      <button
                        type="button"
                        onClick={() => handleRegistrarPagoFueraPlazo(pedido)}
                        disabled={enCurso === pedido.id}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-primary)',
                          border: '1px solid var(--color-primary)',
                          borderRadius: '4px',
                          cursor: enCurso === pedido.id ? 'not-allowed' : 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        {enCurso === pedido.id
                          ? 'Registrando...'
                          : 'Registrar pago recibido fuera de plazo'}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }}>—</span>
                    )}

                  </td>
                  <td style={{ padding: '12px' }}>{celdaEnvio(pedido)}</td>
                </tr>
              );
            })}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: 'var(--color-muted)' }}>
                  {obtenerMensajeVacio()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPedidos > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px' }}>
          <button 
            type="button"
            disabled={paginaActual === 1}
            onClick={() => setPaginaActual(p => p - 1)}
            style={{ padding: '8px 12px', cursor: paginaActual === 1 ? 'not-allowed' : 'pointer' }}
          >
            Anterior
          </button>
          
          <span>Página {paginaActual} de {Math.ceil(totalPedidos / 20)}</span>
          
          <button 
            type="button"
            disabled={paginaActual >= Math.ceil(totalPedidos / 20)}
            onClick={() => setPaginaActual(p => p + 1)}
            style={{ padding: '8px 12px', cursor: paginaActual >= Math.ceil(totalPedidos / 20) ? 'not-allowed' : 'pointer' }}
          >
            Siguiente
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
