import { useSearchParams, useNavigate } from 'react-router-dom';
import Header from './header/header';

// Orden creada sin pasar por una pasarela (ej. transferencia, RF-02.2): queda Pendiente
// hasta que la tienda confirme el pago. El carrito ya lo vació el checkout.
export default function PedidoRecibido() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ordenId = searchParams.get('orden');
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

        <p style={{ color: '#4b5563', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
          {/* TODO(PENDIENTE): cuando exista el envío de correos (RF-04.2), avisar aquí que se envió el resumen */}
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
