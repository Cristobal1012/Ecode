import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/header/header'; // Ajusta la ruta de tu Header

export default function PagoCancelado() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ordenId = searchParams.get('orden');

  return (
    <div style={{ backgroundColor: 'var(--color-background, #f3f4f6)', minHeight: '100vh' }}>
      <Header />
      
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        
        {/* Ícono de X de Cancelado/Rechazado */}
        <div style={{ width: '80px', height: '80px', backgroundColor: '#fee2e2', color: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 20px auto' }}>
          ✕
        </div>
        
        <h1 style={{ color: '#1f2937', marginBottom: '10px', fontSize: '2rem' }}>Pago Cancelado</h1>
        <p style={{ color: '#4b5563', fontSize: '1.1rem', marginBottom: '30px' }}>
          Has anulado el proceso de pago o la transacción fue rechazada.
        </p>

        {ordenId && (
          <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '20px' }}>
            Orden #{ordenId}
          </p>
        )}

        <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
          No te preocupes, <strong>no se ha realizado ningún cargo en tu cuenta</strong>. 
          Tus productos siguen seguros en tu carrito por si deseas intentar la compra nuevamente con otro medio de pago.
        </p>

        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={() => navigate('/checkout')}
            style={{ padding: '12px 24px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            Volver al checkout
          </button>
          <button 
            onClick={() => navigate('/catalogo')}
            style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            Ir al Catálogo
          </button>
        </div>

      </div>
    </div>
  );
}