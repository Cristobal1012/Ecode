
import { useEffect, useState } from 'react';
import ReactQuill from 'react-quill-new';
import clienteAxios from './auth/axiosConfig';
import { recargarConfiguracion } from '../hooks/useConfiguracionTienda';
import { Cargando } from './carga/Esqueleto';
import { EsqueletoFormulario } from './carga/EsqueletosPanel';
import Spinner from './carga/Spinner';
import SelectorProyectosSobreMi from './SelectorProyectosSobreMi';

const CAMPOS = ['sobre_mi_activo', 'sobre_mi_nombre', 'sobre_mi_biografia'];

const formularioDe = (configuracion) => ({
  sobre_mi_activo: Boolean(configuracion?.sobre_mi_activo),
  sobre_mi_nombre: configuracion?.sobre_mi_nombre || 'Sobre mí',
  sobre_mi_biografia: configuracion?.sobre_mi_biografia || ''
});

const erroresDe = (error) => {
  const datos = error.response?.data;

  if (!datos || typeof datos !== 'object') {
    return { general: 'No se pudieron guardar los cambios.' };
  }

  const porCampo = Object.fromEntries(
    Object.entries(datos)
      .filter(([campo]) => CAMPOS.includes(campo))
      .map(([campo, mensajes]) => [campo, [].concat(mensajes).join(' ')])
  );

  return { ...porCampo, general: 'Revisa los datos marcados.' };
};

export default function GestorSobreMi() {
  const [formulario, setFormulario] = useState(formularioDe(null));
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});
  const [exito, setExito] = useState('');

  useEffect(() => {
    clienteAxios.get('configuracion/negocio/')
      .then(({ data }) => setFormulario(formularioDe(data)))
      .catch((error) => {
        console.error('Error al cargar Sobre mí:', error);
        setErrores({ general: 'No se pudo cargar la configuración de Sobre mí.' });
      })
      .finally(() => setCargando(false));
  }, []);

  const editar = (campo, valor) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined }));
    setExito('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrores({});
    setExito('');

    try {
      const { data } = await clienteAxios.patch(
        'configuracion/negocio/',
        formulario
      );

      setFormulario(formularioDe(data));
      await recargarConfiguracion();

      setExito(
        data.sobre_mi_activo
          ? 'La página Sobre mí está activada y su información fue guardada.'
          : 'La configuración fue guardada. La página Sobre mí está desactivada.'
      );
    } catch (error) {
      setErrores(erroresDe(error));
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Cargando texto="Cargando Sobre mí...">
        <EsqueletoFormulario campos={3} />
      </Cargando>
    );
  }

  return (
    <>
      <p className="texto-secundario admin-descripcion">
        Crea una página independiente para contar tu historia,
        presentar tu emprendimiento y destacar tus proyectos.
        Puedes prepararla antes de activarla.
      </p>

      {errores.general && (
        <p role="alert" className="admin-aviso admin-aviso--error">
          {errores.general}
        </p>
      )}

      {exito && (
        <p role="status" className="admin-aviso admin-aviso--exito">
          {exito}
        </p>
      )}

      <form onSubmit={guardar} className="admin-formulario">
        <label className="admin-casilla">
          <input
            type="checkbox"
            checked={formulario.sobre_mi_activo}
            onChange={(e) =>
              editar('sobre_mi_activo', e.target.checked)
            }
          />
          Mostrar la página Sobre mí en mi tienda
        </label>

        <div className="admin-campo">
          <label htmlFor="sobre-mi-nombre">
            Nombre de la página
          </label>

          <input
            id="sobre-mi-nombre"
            type="text"
            maxLength={30}
            value={formulario.sobre_mi_nombre}
            onChange={(e) =>
              editar('sobre_mi_nombre', e.target.value)
            }
            placeholder="Sobre mí"
          />

          <p className="admin-ayuda">
            Por ejemplo: Sobre mí, Nosotros, Mi historia o
            Conoce nuestro emprendimiento.
          </p>
        </div>

        <div className="admin-campo">
          <label htmlFor="sobre-mi-biografia">
            Biografía del emprendimiento
          </label>

          <div id="sobre-mi-biografia">
            <ReactQuill
              theme="snow"
              value={formulario.sobre_mi_biografia}
              onChange={(contenido) =>
                editar('sobre_mi_biografia', contenido)
              }
              placeholder="Cuenta la historia de tu emprendimiento..."
            />
          </div>

          <p className="admin-ayuda">
            Puedes utilizar títulos, negritas, listas y párrafos
            para presentar tu emprendimiento.
          </p>
        </div>

        <div>
          <button
            type="submit"
            disabled={guardando}
            className="boton boton-primario"
          >
            {guardando && <Spinner />}
            {guardando ? 'Guardando...' : 'Guardar Sobre mí'}
          </button>
        </div>
      </form>
      <hr className="admin-separador" />

      <SelectorProyectosSobreMi />
    </>
  );
}
