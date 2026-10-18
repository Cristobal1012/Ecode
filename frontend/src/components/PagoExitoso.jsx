import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Header from '../components/header/header'; // Ajusta la ruta de tu Header si es distinta
import clienteAxios from './auth/axiosConfig';

export default function PagoExitoso() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ordenId = searchParams.get('orden');
  // El pago se aprobó pero la orden quedó para revisión del admin (ej. sin stock):
  // no se le promete el pedido ni se le muestra el motivo interno
  const enRevision = searchParams.get('revision') === '1';
  // El invitado no tiene historial: se le lleva al seguimiento con su número de orden (RF-02.4)
  const usuarioAutenticado = !!localStorage.getItem('access_token');

  useEffect(() => {
    // Limpiar el carrito local y la orden pendiente una vez que el pago fue exitoso
    localStorage.removeItem('carrito_local');
    localStorage.removeItem('orden_pendiente_pago');
    window.dispatchEvent(new Event('carritoActualizado'));
    if (usuarioAutenticado) {
      clienteAxios.post('ventas/carrito/', { items: [] }).catch(() => {});
    }
  }, [usuarioAutenticado]);

  return (
    <div style={{ backgroundColor: 'var(--color-background, #f3f4f6)', minHeight: '100vh' }}>
      <Header />
      
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        
        {/* Ícono de Check de Éxito */}
        <div style={{ width: '80px', height: '80px', backgroundColor: '#d1fae5', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 20px auto' }}>
          ✓
        </div>
        
        <h1 style={{ color: '#1f2937', marginBottom: '10px', fontSize: '2rem' }}>{enRevision ? '¡Pago recibido!' : '¡Pago Exitoso!'}</h1>
        <p style={{ color: '#4b5563', fontSize: '1.1rem', marginBottom: '30px' }}>
          {enRevision
            ? 'Recibimos tu pago. La tienda revisará tu pedido antes de prepararlo y se pondrá en contacto contigo.'
            : 'Tu compra se ha procesado correctamente.'}
        </p>

        {ordenId && (
          <div style={{ padding: '20px', backgroundColor: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '8px', marginBottom: '30px' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Número de Orden</p>
            <h2 style={{ margin: '5px 0 0 0', color: '#111827', fontSize: '2.5rem' }}>#{ordenId}</h2>
          </div>
        )}

        <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
          Te enviamos la confirmación a tu correo. Guarda tu número de orden: con él y el correo que usaste en la compra puedes consultar el estado de tu pedido en la sección de seguimiento.
        </p>

        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={() => navigate('/catalogo')}
            style={{ padding: '12px 24px', backgroundColor: '#047857', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            Seguir Comprando
          </button>
          <button 
            onClick={() => navigate(usuarioAutenticado ? '/mis-pedidos' : `/seguimiento${ordenId ? `?orden=${encodeURIComponent(ordenId)}` : ''}`)}
            style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            {usuarioAutenticado ? 'Ver mis pedidos' : 'Seguir mi pedido'}
          </button>
        </div>

      </div>
    </div>
  );
}