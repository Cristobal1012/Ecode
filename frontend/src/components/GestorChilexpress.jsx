import { useState, useEffect } from 'react';
import clienteAxios from './auth/axiosConfig';
import { Cargando } from './carga/Esqueleto';
import { EsqueletoFormulario } from './carga/EsqueletosPanel';
import Spinner from './carga/Spinner';

const ESTILOS_AVISO = {
  error: { backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b' },
  exito: { backgroundColor: '#f0fdf4', border: '1px solid #86efac', color: '#166534' },
  incompleto: { backgroundColor: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e' }
};

const estiloCampo = { width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid var(--color-control-border)', borderRadius: '4px' };
const estiloEtiqueta = { display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px', color: 'var(--color-text)' };

// RNF-03: el admin carga las llaves de las APIs de Chilexpress; llegan enmascaradas y, si se devuelven
// sin cambios, el backend conserva las anteriores.
export default function GestorChilexpress() {
  const [config, setConfig] = useState(null);
  const [datos, setDatos] = useState({});
  const [errorCarga, setErrorCarga] = useState('');
  const [guardando, setGuardando] = useState(false);
  // { tipo, texto, errores }
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    clienteAxios.get('ventas/admin/chilexpress/')
      .then(({ data }) => {
        setConfig(data);
        setDatos({ ...data.datos });
      })
      .catch((error) => {
        console.error('Error al cargar las credenciales de Chilexpress:', error);
        setErrorCarga('No se pudieron cargar las credenciales de Chilexpress.');
      });
  }, []);

  const handleGuardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const { data } = await clienteAxios.put('ventas/admin/chilexpress/', { datos });
      setConfig(data);
      setDatos({ ...data.datos });
      setAviso({ tipo: 'exito', texto: 'Credenciales de Chilexpress guardadas.' });
    } catch (error) {
      setAviso({
        tipo: 'error',
        texto: error.response?.data?.detail || 'No se pudieron guardar las credenciales. Revisa los campos marcados.',
        errores: error.response?.data?.datos || {}
      });
    } finally {
      setGuardando(false);
    }
  };

  if (errorCarga) return <p role="alert" style={{ ...ESTILOS_AVISO.error, padding: '10px 12px', borderRadius: '6px' }}>{errorCarga}</p>;
  if (!config) return <Cargando texto="Cargando credenciales de Chilexpress..."><EsqueletoFormulario campos={3} /></Cargando>;

  const etiquetas = Object.fromEntries(config.campos.map(c => [c.nombre, c.etiqueta]));
  const errores = aviso?.errores || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '640px' }}>
      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.95rem' }}>
        Con estas llaves la tienda cotiza el despacho, muestra las sucursales y genera la orden de transporte.
        Se obtienen en el portal de desarrolladores de Chilexpress; si dejas vacías las de coberturas o envíos, se usa la
        del cotizador. Se guardan cifradas y aquí solo se muestran sus últimos caracteres.
      </p>

      {config.configuradas
        ? <p style={{ ...ESTILOS_AVISO.exito, padding: '8px 12px', borderRadius: '6px', margin: 0 }}>Configurado: el checkout puede cotizar con Chilexpress.</p>
        : (
          <p style={{ ...ESTILOS_AVISO.incompleto, padding: '8px 12px', borderRadius: '6px', margin: 0 }}>
            Falta {config.faltantes.map(f => etiquetas[f]).join(', ')}: sin ella el checkout no puede cotizar el despacho.
          </p>
        )}

      {config.campos.map(campo => {
        const id = `chilexpress-${campo.nombre}`;
        const idAyuda = `${id}-ayuda`;
        const idError = `${id}-error`;
        return (
          <div key={campo.nombre}>
            <label htmlFor={id} style={estiloEtiqueta}>
              {campo.etiqueta}{campo.obligatorio ? ' (obligatorio)' : ' (opcional)'}
            </label>
            <input
              id={id}
              type="text"
              value={datos[campo.nombre] || ''}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDatos(actual => ({ ...actual, [campo.nombre]: e.target.value }))}
              // La llave enmascarada se selecciona entera para reemplazarla de una vez
              onFocus={(e) => e.target.select()}
              aria-invalid={Boolean(errores[campo.nombre])}
              aria-describedby={[idAyuda, errores[campo.nombre] ? idError : ''].filter(Boolean).join(' ')}
              style={estiloCampo}
            />
            <p id={idAyuda} style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
              Por seguridad solo se muestran los últimos caracteres. Escribe una nueva para reemplazarla o deja el campo vacío para borrarla.
            </p>
            {errores[campo.nombre] && (
              <p id={idError} style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#991b1b' }}>{errores[campo.nombre]}</p>
            )}
          </div>
        );
      })}

      {aviso && (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          style={{ ...ESTILOS_AVISO[aviso.tipo], padding: '8px 12px', borderRadius: '6px', margin: 0 }}
        >
          {aviso.texto}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handleGuardar}
          disabled={guardando}
          style={{ padding: '10px 18px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: guardando ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
        >
          {guardando && <Spinner />}{guardando ? 'Guardando...' : 'Guardar credenciales de Chilexpress'}
        </button>
      </div>
    </div>
  );
}
