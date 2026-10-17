import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import Header from './header/header';

// Orden creada sin pasar por una pasarela (ej. transferencia, RF-02.2): queda Pendiente
// hasta que la tienda confirme el pago. El carrito ya lo vació el checkout.
export default function PedidoRecibido() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ordenId = searchParams.get('orden');
  // Transferencia: datos bancarios, monto y referencia que envió el checkout. Sobreviven a una recarga
  // (historial del navegador), pero no si se abre el enlace en otra pestaña: ahí quedan en el correo.
  const instrucciones = useLocation().state?.instrucciones || null;
  // El invitado no tiene historial: se le lleva al seguimiento con su número de orden (RF-02.4)
  const usuarioAutenticado = !!localStorage.getItem('access_token');

  return (
    <div style={{ backgroundColor: 'var(--color-background, #f3f4f6)', minHeight: '100vh' }}>
      <Header />

      <section style={{ maxWidth: '600px', margin: '60px auto', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        <div aria-hidden="true" style={{ width: '80px', height: '80px', backgroundColor: '#fef3c7', color: '#b45309', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', margin: '0 auto 20px auto' }}>
          ⏳
        </div>

        <h1 style={{ color: '#1f2937', marginBottom: '10px', fontSize: '2rem' }}>¡Pedido recibido!</h1>
        <p style={{ color: '#4b5563', fontSize: '1.1rem', marginBottom: '30px' }}>
          Tu pedido quedó registrado y está <strong>pendiente de pago</strong>. Cuando la tienda confirme
          el pago, lo preparará para el envío.
        </p>

        {ordenId && (
          <div style={{ padding: '20px', backgroundColor: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '8px', marginBottom: '30px' }}>
            <p style={{ margin: 0, color: '#4b5563', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Número de Orden</p>
            <p style={{ margin: '5px 0 0 0', color: '#111827', fontSize: '2.5rem', fontWeight: 'bold' }}>#{ordenId}</p>
          </div>
        )}

        {instrucciones && (
          <div style={{ padding: '20px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '30px', textAlign: 'left' }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#1f2937' }}>Datos para transferir</h2>
            <p style={{ margin: '0 0 15px 0', color: '#374151', lineHeight: '1.5' }}>
              Transfiere <strong>${Number(instrucciones.monto).toLocaleString('es-CL')}</strong> a esta cuenta e indica
              como referencia <strong>{instrucciones.referencia}</strong>.
            </p>
            {instrucciones.vence && (
              <p style={{ margin: '0 0 15px 0', color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '6px', padding: '8px 12px', lineHeight: '1.5' }}>
                Tienes hasta el <strong>{new Date(instrucciones.vence).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}</strong> para
                transferir; después el pedido se cancela automáticamente.
              </p>
            )}
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }}>
              {instrucciones.datos.map(dato => (
                <div key={dato.etiqueta} style={{ display: 'contents' }}>
                  <dt style={{ color: '#4b5563' }}>{dato.etiqueta}</dt>
                  <dd style={{ margin: 0, fontWeight: 'bold', color: '#111827', wordBreak: 'break-word' }}>{dato.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p style={{ color: '#4b5563', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
          {instrucciones
            ? 'También te enviamos estos datos y el resumen de tu compra a tu correo. '
            : 'Te enviamos el resumen de tu compra a tu correo (si pagas por transferencia, ahí están los datos de la cuenta). '}
          Guarda tu número de orden: con él y el correo que usaste en la compra puedes consultar el estado de tu pedido en la sección de seguimiento.
        </p>

        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/catalogo')}
            style={{ padding: '12px 24px', backgroundColor: '#047857', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Seguir Comprando
          </button>
          <button
            type="button"
            onClick={() => navigate(usuarioAutenticado ? '/mis-pedidos' : `/seguimiento${ordenId ? `?orden=${encodeURIComponent(ordenId)}` : ''}`)}
            style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {usuarioAutenticado ? 'Ver mis pedidos' : 'Seguir mi pedido'}
          </button>
        </div>
      </section>
    </div>
  );
}
