import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clienteAxios from '../components/auth/axiosConfig';
import AuthLayout from '../components/auth/AuthLayout';
import { leerEnlaceRestablecimiento, olvidarEnlaceRestablecimiento } from '../utils/enlaceRestablecimiento';

const CAMPOS = [
  { nombre: 'password', etiqueta: 'Nueva contraseña' },
  { nombre: 'password2', etiqueta: 'Repite la nueva contraseña' },
];

// El backend responde { enlace: [...] } si el enlace no sirve, o { campo: [mensajes] } si la contraseña no es válida
const leerErrores = (error) => {
  const data = error.response?.data;
  if (!error.response) {
    return { general: 'No pudimos conectar con la tienda. Revisa tu conexión e inténtalo de nuevo.', campos: {} };
  }
  if (error.response.status === 429) {
    return { general: 'Hiciste muchos intentos seguidos. Espera un rato e inténtalo de nuevo.', campos: {} };
  }
  if (error.response.status !== 400 || !data || typeof data !== 'object') {
    return { general: 'No pudimos cambiar tu contraseña. Inténtalo de nuevo.', campos: {} };
  }
  if (data.enlace) return { enlaceInvalido: true };
  const campos = {};
  CAMPOS.forEach(({ nombre }) => {
    if (data[nombre]) campos[nombre] = [].concat(data[nombre]).join(' ');
  });
  return { general: 'Revisa los datos marcados.', campos };
};

// Elige la nueva contraseña con el enlace del correo (main.jsx ya sacó uid y token de la URL)
export default function RestablecerContrasena() {
  const id = useId();
  const navigate = useNavigate();
  const [enlace] = useState(leerEnlaceRestablecimiento);
  const [formData, setFormData] = useState({ password: '', password2: '' });
  const [errores, setErrores] = useState({ general: '', campos: {}, enlaceInvalido: !enlace });
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.password2) {
      setErrores({ general: 'Revisa los datos marcados.', campos: { password2: 'Las contraseñas no coinciden.' } });
      return;
    }
    setErrores({ general: '', campos: {} });
    setEnviando(true);
    try {
      await clienteAxios.post('usuarios/contrasena/restablecer/', { ...enlace, ...formData });
      olvidarEnlaceRestablecimiento();
      navigate('/login', { state: { aviso: { texto: 'Tu contraseña se cambió. Ya puedes iniciar sesión.' } } });
    } catch (error) {
      const leidos = leerErrores(error);
      if (leidos.enlaceInvalido) olvidarEnlaceRestablecimiento();
      setErrores({ general: '', campos: {}, ...leidos });
      setEnviando(false);
    }
  };

  if (errores.enlaceInvalido) {
    return (
      <AuthLayout>
        <div className="auth-tarjeta">
          <span className="antetitulo">Mi cuenta</span>
          <h1 className="auth-titulo">Nueva contraseña</h1>
          <p role="alert" className="auth-aviso auth-aviso--error">
            El enlace no es válido o ya venció. Los enlaces duran 1 hora y sirven una sola vez.
          </p>
          <Link to="/recuperar-contrasena" className="boton boton-primario auth-enviar">Pedir un enlace nuevo</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-tarjeta">
        <span className="antetitulo">Mi cuenta</span>
        <h1 className="auth-titulo">Nueva contraseña</h1>

        {errores.general && <p role="alert" className="auth-aviso auth-aviso--error">{errores.general}</p>}

        <form onSubmit={handleSubmit} className="auth-formulario">
          {CAMPOS.map(({ nombre, etiqueta }) => {
            const mensaje = errores.campos[nombre];
            const idCampo = `${id}-${nombre}`;
            const describe = [nombre === 'password' ? `${id}-ayuda` : '', mensaje ? `${idCampo}-error` : '']
              .filter(Boolean).join(' ');
            return (
              <div className="auth-campo" key={nombre}>
                <label htmlFor={idCampo}>{etiqueta}</label>
                <input
                  id={idCampo}
                  type="password"
                  name={nombre}
                  autoComplete="new-password"
                  value={formData[nombre]}
                  onChange={(e) => setFormData({ ...formData, [nombre]: e.target.value })}
                  required
                  aria-invalid={mensaje ? true : undefined}
                  aria-describedby={describe || undefined}
                />
                {nombre === 'password' && (
                  <p id={`${id}-ayuda`} className="auth-campo-ayuda">
                    Al menos 8 caracteres, que no sean solo números ni una contraseña común.
                  </p>
                )}
                {mensaje && <p id={`${idCampo}-error`} className="auth-campo-error">{mensaje}</p>}
              </div>
            );
          })}
          <button type="submit" className="boton boton-primario auth-enviar" disabled={enviando}>
            {enviando ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
