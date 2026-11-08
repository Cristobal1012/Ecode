import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GestorCouriers from '../components/GestorCouriers';
import clienteAxios from '../components/auth/axiosConfig';

vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}));

vi.mock('../components/carga/Esqueleto', () => ({
  Cargando: ({ texto, children }) => (
    <div data-testid="cargando">
      <span>{texto}</span>
      {children}
    </div>
  )
}));

vi.mock('../components/carga/EsqueletosPanel', () => ({
  EsqueletoFormulario: ({ campos }) => (
    <div data-testid="esqueleto-formulario">
      Campos: {campos}
    </div>
  )
}));

vi.mock('../components/carga/Spinner', () => ({
  default: () => <span data-testid="spinner" />
}));

const courierChilexpress = {
  codigo: 'chilexpress',
  nombre: 'Chilexpress',
  ayuda: 'Configura las credenciales de tu cuenta.',
  configuradas: true,
  faltantes: [],
  campos: [
    { nombre: 'usuario', etiqueta: 'Usuario', obligatorio: true },
    { nombre: 'password', etiqueta: 'Contraseña', obligatorio: true },
    { nombre: 'codigo_cliente', etiqueta: 'Código de cliente', obligatorio: false }
  ],
  datos: {
    usuario: '****1234',
    password: '****5678',
    codigo_cliente: ''
  }
};

const courierStarken = {
  codigo: 'starken',
  nombre: 'Starken',
  ayuda: '',
  configuradas: false,
  faltantes: ['api_key'],
  campos: [
    { nombre: 'api_key', etiqueta: 'API Key', obligatorio: true },
    { nombre: 'sucursal', etiqueta: 'Sucursal', obligatorio: false }
  ],
  datos: {
    api_key: '',
    sucursal: ''
  }
};

const couriersIniciales = [courierChilexpress, courierStarken];
const obtenerChilexpress = () => screen.getByRole('region', { name: 'Chilexpress' });
const obtenerStarken = () => screen.getByRole('region', { name: 'Starken' });

const botonGuardarChilexpress = () =>
  within(obtenerChilexpress()).getByRole('button', {
    name: 'Guardar credenciales de Chilexpress'
  });

const cargarCouriers = async (datos = couriersIniciales) => {
  clienteAxios.get.mockResolvedValueOnce({ data: datos });

  const resultado = render(<GestorCouriers />);

  await waitFor(() => {
    expect(clienteAxios.get).toHaveBeenCalledWith('ventas/admin/couriers/');
  });

  await waitFor(() => {
    expect(screen.queryByTestId('cargando')).not.toBeInTheDocument();
  });

  return resultado;
};

afterEach(() => {
    cleanup();
});

describe('GestorCouriers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('debe mostrar el esqueleto mientras carga los couriers', () => {
    clienteAxios.get.mockReturnValue(new Promise(() => {}));

    render(<GestorCouriers />);

    expect(screen.getByTestId('cargando')).toBeInTheDocument();
    expect(screen.getByText('Cargando credenciales de los couriers...')).toBeInTheDocument();
    expect(screen.getByTestId('esqueleto-formulario')).toHaveTextContent('Campos: 3');
  });

  it('debe solicitar los couriers al backend', async () => {
    await cargarCouriers();

    expect(clienteAxios.get).toHaveBeenCalledTimes(1);
    expect(clienteAxios.get).toHaveBeenCalledWith('ventas/admin/couriers/');
  });

  it('debe mostrar un formulario por cada courier recibido', async () => {
    await cargarCouriers();

    expect(screen.getByRole('region', { name: 'Chilexpress' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Starken' })).toBeInTheDocument();
  });

  it('debe mostrar correctamente los nombres de los couriers', async () => {
    await cargarCouriers();

    expect(screen.getByRole('heading', { name: 'Chilexpress' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Starken' })).toBeInTheDocument();
  });

  it('debe mostrar la descripción y ayuda del courier', async () => {
    await cargarCouriers();

    //Se acota al formulario de Chilexpress: "Se guardan cifradas" aparece en todos los couriers
    const formulario = obtenerChilexpress();

    expect(
      within(formulario).getByText(/Configura las credenciales de tu cuenta/)
    ).toBeInTheDocument();

    expect(
      within(formulario).getByText(/Se guardan cifradas/)
    ).toBeInTheDocument();
  });

  it('debe mostrar un mensaje cuando el courier está configurado', async () => {
    await cargarCouriers([courierChilexpress]);

    expect(
      screen.getByText(/Configurado: el checkout puede cotizar con Chilexpress/)
    ).toBeInTheDocument();
  });

  it('debe mostrar un mensaje cuando faltan credenciales', async () => {
    await cargarCouriers([courierStarken]);

    expect(screen.getByText(/Falta API Key/)).toBeInTheDocument();
    expect(
      screen.getByText(/sin ella el checkout no ofrece Starken/)
    ).toBeInTheDocument();
  });

  it('debe mostrar los campos obligatorios y opcionales', async () => {
    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    expect(
      within(formulario).getByLabelText('Usuario (obligatorio)')
    ).toBeInTheDocument();

    expect(
      within(formulario).getByLabelText('Contraseña (obligatorio)')
    ).toBeInTheDocument();

    expect(
      within(formulario).getByLabelText('Código de cliente (opcional)')
    ).toBeInTheDocument();
  });

  it('debe inicializar los campos con los datos recibidos', async () => {
    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    expect(within(formulario).getByLabelText('Usuario (obligatorio)')).toHaveValue('****1234');
    expect(within(formulario).getByLabelText('Contraseña (obligatorio)')).toHaveValue('****5678');
    expect(within(formulario).getByLabelText('Código de cliente (opcional)')).toHaveValue('');
  });

  it('debe mostrar un error si falla la carga de couriers', async () => {
    clienteAxios.get.mockRejectedValueOnce(new Error('Error de conexión'));

    render(<GestorCouriers />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las credenciales de los couriers.'
    );

    expect(screen.queryByTestId('cargando')).not.toBeInTheDocument();
  });

  it('debe permitir modificar los campos de un courier', async () => {
    const user = userEvent.setup();

    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress()).getByLabelText('Usuario (obligatorio)');

    await user.clear(usuario);
    await user.type(usuario, 'nuevo_usuario');

    expect(usuario).toHaveValue('nuevo_usuario');
  });

  it('debe permitir modificar campos independientes entre couriers', async () => {
    const user = userEvent.setup();

    await cargarCouriers();

    const campoChilexpress = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    const campoStarken = within(obtenerStarken())
      .getByLabelText('API Key (obligatorio)');

    // Al enfocar, el campo se selecciona entero (onFocus -> select()),
    // por eso se limpia explícitamente antes de escribir
    await user.clear(campoChilexpress);
    await user.type(campoChilexpress, 'nuevo_usuario');
    await user.type(campoStarken, 'clave123');

    expect(campoChilexpress).toHaveValue('nuevo_usuario');
    expect(campoStarken).toHaveValue('clave123');
  });

  it('debe seleccionar el contenido del campo al enfocarlo', async () => {
    const user = userEvent.setup();

    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    const select = vi.spyOn(usuario, 'select');

    await user.click(usuario);

    expect(select).toHaveBeenCalled();
  });

  it('debe desactivar el autocompletado y la corrección ortográfica', async () => {
    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    expect(usuario).toHaveAttribute('autocomplete', 'off');
    expect(usuario).toHaveAttribute('spellcheck', 'false');
  });

  it('debe enviar las credenciales mediante PUT', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockResolvedValueOnce({
      data: {
        ...courierChilexpress,
        datos: {
          usuario: 'nuevo_usuario',
          password: '****5678',
          codigo_cliente: ''
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    await user.clear(usuario);
    await user.type(usuario, 'nuevo_usuario');

    await user.click(botonGuardarChilexpress());

    await waitFor(() => {
      expect(clienteAxios.put).toHaveBeenCalledWith(
        'ventas/admin/couriers/chilexpress/',
        {
          datos: {
            usuario: 'nuevo_usuario',
            password: '****5678',
            codigo_cliente: ''
          }
        }
      );
    });
  });

  it('debe actualizar los campos con la respuesta del servidor', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockResolvedValueOnce({
      data: {
        ...courierChilexpress,
        datos: {
          usuario: '****9999',
          password: '****5678',
          codigo_cliente: '12345'
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    await user.click(botonGuardarChilexpress());

    await waitFor(() => {
      expect(
        within(formulario).getByLabelText('Usuario (obligatorio)')
      ).toHaveValue('****9999');

      expect(
        within(formulario).getByLabelText('Código de cliente (opcional)')
      ).toHaveValue('12345');
    });
  });

  it('debe mostrar un mensaje de éxito después de guardar', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockResolvedValueOnce({
      data: courierChilexpress
    });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    await user.click(botonGuardarChilexpress());

    expect(
      await within(formulario).findByRole('status')
    ).toHaveTextContent('Credenciales de Chilexpress guardadas.');
  });

  it('debe mostrar el spinner y deshabilitar el botón mientras guarda', async () => {
    const user = userEvent.setup();

    let resolver;

    clienteAxios.put.mockReturnValueOnce(
      new Promise(resolve => {
        resolver = resolve;
      })
    );

    await cargarCouriers([courierChilexpress]);

    const boton = botonGuardarChilexpress();

    await user.click(boton);

    expect(boton).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(boton).toHaveTextContent('Guardando...');

    resolver({ data: courierChilexpress });

    await waitFor(() => {
      expect(boton).toBeEnabled();
    });
  });

  it('debe mostrar el error general devuelto por el backend', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Las credenciales no son válidas.',
          datos: {}
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    await user.click(botonGuardarChilexpress());

    expect(
      await within(formulario).findByRole('alert')
    ).toHaveTextContent('Las credenciales no son válidas.');
  });

  it('debe mostrar un mensaje genérico cuando el backend no devuelve detail', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockRejectedValueOnce({
      response: {
        data: {}
      }
    });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    await user.click(botonGuardarChilexpress());

    expect(
      await within(formulario).findByRole('alert')
    ).toHaveTextContent(
      'No se pudieron guardar las credenciales. Revisa los campos marcados.'
    );
  });

  it('debe mostrar los errores del backend junto a sus campos', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockRejectedValueOnce({
      response: {
        data: {
          detail: 'Revisa los datos.',
          datos: {
            usuario: 'El usuario no es válido.',
            password: 'La contraseña es obligatoria.'
          }
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    await user.click(botonGuardarChilexpress());

    expect(
      await within(formulario).findByText('El usuario no es válido.')
    ).toBeInTheDocument();

    expect(
      within(formulario).getByText('La contraseña es obligatoria.')
    ).toBeInTheDocument();

    expect(
      within(formulario).getByLabelText('Usuario (obligatorio)')
    ).toHaveAttribute('aria-invalid', 'true');

    expect(
      within(formulario).getByLabelText('Contraseña (obligatorio)')
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('debe asociar las ayudas y errores mediante aria-describedby', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockRejectedValueOnce({
      response: {
        data: {
          datos: {
            usuario: 'Usuario incorrecto.'
          }
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    await user.click(botonGuardarChilexpress());

    await waitFor(() => {
      expect(usuario).toHaveAttribute(
        'aria-describedby',
        'courier-chilexpress-usuario-ayuda courier-chilexpress-usuario-error'
      );
    });
  });

  it('debe permitir volver a guardar después de un error', async () => {
    const user = userEvent.setup();

    clienteAxios.put
      .mockRejectedValueOnce({
        response: {
          data: {
            detail: 'Error temporal.'
          }
        }
      })
      .mockResolvedValueOnce({
        data: courierChilexpress
      });

    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();
    const boton = botonGuardarChilexpress();

    await user.click(boton);

    expect(
      await within(formulario).findByRole('alert')
    ).toHaveTextContent('Error temporal.');

    await user.click(boton);

    expect(
      await within(formulario).findByRole('status')
    ).toHaveTextContent('Credenciales de Chilexpress guardadas.');

    expect(clienteAxios.put).toHaveBeenCalledTimes(2);
  });

  it('debe permitir eliminar una credencial dejando el campo vacío', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockResolvedValueOnce({
      data: {
        ...courierChilexpress,
        datos: {
          usuario: '',
          password: '****5678',
          codigo_cliente: ''
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    const usuario = within(obtenerChilexpress())
      .getByLabelText('Usuario (obligatorio)');

    await user.clear(usuario);

    await user.click(botonGuardarChilexpress());

    await waitFor(() => {
      expect(clienteAxios.put).toHaveBeenCalledWith(
        'ventas/admin/couriers/chilexpress/',
        {
          datos: {
            usuario: '',
            password: '****5678',
            codigo_cliente: ''
          }
        }
      );
    });
  });

  it('debe mostrar un contenedor vacío cuando no existen couriers', async () => {
    const { container } = await cargarCouriers([]);

    expect(container.querySelectorAll('section')).toHaveLength(0);
  });
});
