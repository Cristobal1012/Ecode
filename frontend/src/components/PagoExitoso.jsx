import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Header from '../components/header/header'; // Ajusta la ruta de tu Header si es distinta

export default function PagoExitoso() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ordenId = searchParams.get('orden');

  useEffect(() => {
    // Limpiar el carrito local una vez que el pago fue exitoso
    localStorage.removeItem('carrito_local');
    window.dispatchEvent(new Event('carritoActualizado'));
  }, []);

  return (
    <div style={{ backgroundColor: 'var(--color-background, #f3f4f6)', minHeight: '100vh' }}>
      <Header />
      
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '40px', backgroundColor: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        
        {/* Ícono de Check de Éxito */}
        <div style={{ width: '80px', height: '80px', backgroundColor: '#d1fae5', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', margin: '0 auto 20px auto' }}>
          ✓
        </div>
        
        <h1 style={{ color: '#1f2937', marginBottom: '10px', fontSize: '2rem' }}>¡Pago Exitoso!</h1>
        <p style={{ color: '#4b5563', fontSize: '1.1rem', marginBottom: '30px' }}>
          Tu compra se ha procesado correctamente.
        </p>

        {ordenId && (
          <div style={{ padding: '20px', backgroundColor: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: '8px', marginBottom: '30px' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Número de Orden</p>
            <h2 style={{ margin: '5px 0 0 0', color: '#111827', fontSize: '2.5rem' }}>#{ordenId}</h2>
          </div>
        )}

        <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
          Hemos enviado un comprobante a tu correo electrónico con los detalles de tu compra y la información de seguimiento.
        </p>

        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={() => navigate('/catalogo')}
            style={{ padding: '12px 24px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            Seguir Comprando
          </button>
          <button 
            onClick={() => navigate('/mis-pedidos')}
            style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}
          >
            Ver mis pedidos
          </button>
        </div>

      </div>
    </div>
  );
}