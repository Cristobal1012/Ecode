import { useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';

export default function GestorPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Opciones exactas solicitadas en los criterios de aceptación
  const opcionesEstado = [
  { valor: 'PENDIENTE', etiqueta: 'Pendiente' },
  { valor: 'PAGADO', etiqueta: 'Pagado' },
  { valor: 'EN_PREPARACION', etiqueta: 'En Preparación' }, // Sin espacio, con guion bajo y sin tilde
  { valor: 'ENVIADO', etiqueta: 'Despachado' }, // Cambiado al estándar de backend más común
  { valor: 'ENTREGADO', etiqueta: 'Entregado' },
  { valor: 'CANCELADO', etiqueta: 'Cancelado' }
];

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cargarPedidos = async () => {
    try {
      // Usamos la nueva ruta que trajiste en el merge
      const respuesta = await clienteAxios.get('ventas/admin/ordenes/');
      setPedidos(respuesta.data);
    } catch (error) {
      console.error("Error al cargar las órdenes:", error);
    } finally {
      setCargando(false);
    }
  };

  const handleCambioEstado = async (idPedido, nuevoEstado) => {
    try {
      // Usamos la ruta PATCH dinámica con el ID del pedido
      await clienteAxios.patch(`ventas/admin/ordenes/${idPedido}/estado/`, {
        estado: nuevoEstado
      });
      
      // Actualizamos el estado local para que la tabla refleje el cambio sin recargar
      setPedidos(pedidos.map(pedido => 
        pedido.id === idPedido ? { ...pedido, estado: nuevoEstado } : pedido
      ));
      
    } catch (error) {
      console.error("Error al actualizar el estado:", error);
      alert("Hubo un error al actualizar el estado del pedido.");
    }
  };

  if (cargando) return <div style={{ padding: '20px' }}>Cargando panel de pedidos...</div>;

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
          <tr>
            <th style={{ padding: '12px' }}>Nº Orden</th>
            <th style={{ padding: '12px' }}>Cliente</th>
            <th style={{ padding: '12px' }}>Total</th>
            <th style={{ padding: '12px' }}>Estado Actual</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map(pedido => (
            <tr key={pedido.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '12px', fontWeight: 'bold' }}>#{pedido.id}</td>
              <td style={{ padding: '12px' }}>{pedido.email_invitado || 'Usuario Registrado'}</td>
              <td style={{ padding: '12px' }}>${Number(pedido.total_final).toLocaleString('es-CL')}</td>
              <td style={{ padding: '12px' }}>
                <select
                  value={pedido.estado ? pedido.estado.toUpperCase() : 'PENDIENTE'} 
                  onChange={(e) => handleCambioEstado(pedido.id, e.target.value)}
                  style={{
                    padding: '6px',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    cursor: 'pointer'
                  }}
                >
                  {opcionesEstado.map(opcion => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {pedidos.length === 0 && (
            <tr>
              <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                No hay pedidos registrados en la tienda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}