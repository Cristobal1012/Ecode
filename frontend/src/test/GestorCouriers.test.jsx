
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach
} from 'vitest';

import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
  fireEvent
} from '@testing-library/react';

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

// =====================================================
// DATOS DE PRUEBA
// =====================================================

const PRODUCCION = ['ambiente', 'PRODUCCION'];

const courierChilexpress = {
  codigo: 'chilexpress',
  nombre: 'Chilexpress',
  ayuda: 'Las de producción las entrega Chilexpress.',
  configuradas: true,
  faltantes: [],
  campos: [
    {
      nombre: 'ambiente',
      etiqueta: 'Ambiente',
      secreto: false,
      opciones: ['PRUEBAS', 'PRODUCCION'],
      obligatorio: false,
      obligatorio_si: null,
      formato: ''
    },
    {
      nombre: 'cotizador',
      etiqueta: 'API key del cotizador (Rating)',
      secreto: true,
      opciones: [],
      obligatorio: true,
      obligatorio_si: null,
      formato: ''
    },
    {
      nombre: 'tcc',
      etiqueta: 'Número de TCC',
      secreto: false,
      opciones: [],
      obligatorio: true,
      obligatorio_si: PRODUCCION,
      formato: 'digitos'
    },
    {
      nombre: 'rut',
      etiqueta: 'RUT de la empresa',
      secreto: false,
      opciones: [],
      obligatorio: true,
      obligatorio_si: PRODUCCION,
      formato: 'rut'
    },
    {
      nombre: 'contenido',
      etiqueta: 'Qué vende la tienda',
      secreto: false,
      opciones: ['Vestuario', 'Otros'],
      obligatorio: false,
      obligatorio_si: null,
      formato: ''
    }
  ],
  datos: {
    ambiente: 'PRUEBAS',
    cotizador: '••••0001',
    tcc: '',
    rut: '',
    contenido: 'Otros'
  }
};

const courierStarken = {
  codigo: 'starken',
  nombre: 'Starken',
  ayuda: '',
  configuradas: false,
  faltantes: ['api_key'],
  campos: [
    {
      nombre: 'api_key',
      etiqueta: 'API Key',
      obligatorio: true
    },
    {
      nombre: 'sucursal',
      etiqueta: 'Sucursal',
      obligatorio: false
    }
  ],
  datos: {
    api_key: '',
    sucursal: ''
  }
};

const couriersIniciales = [
  courierChilexpress,
  courierStarken
];

const obtenerChilexpress = () =>
  screen.getByRole('region', { name: 'Chilexpress' });

const obtenerStarken = () =>
  screen.getByRole('region', { name: 'Starken' });

const botonGuardarChilexpress = () =>
  within(obtenerChilexpress()).getByRole('button', {
    name: 'Guardar credenciales de Chilexpress'
  });

const cargarCouriers = async (datos = couriersIniciales) => {
  clienteAxios.get.mockResolvedValueOnce({ data: datos });

  const resultado = render(<GestorCouriers />);

  await waitFor(() => {
    expect(clienteAxios.get).toHaveBeenCalledWith(
      'ventas/admin/couriers/'
    );
  });

  await waitFor(() => {
    expect(screen.queryByTestId('cargando')).not.toBeInTheDocument();
  });

  return resultado;
};

// =====================================================
// CONFIGURACIÓN
// =====================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// =====================================================
// PRUEBAS GENERALES
// =====================================================

describe('GestorCouriers', () => {

  it('debe mostrar el esqueleto mientras carga los couriers', () => {
    clienteAxios.get.mockReturnValue(new Promise(() => {}));

    render(<GestorCouriers />);

    expect(screen.getByTestId('cargando')).toBeInTheDocument();

    expect(
      screen.getByText('Cargando credenciales de los couriers...')
    ).toBeInTheDocument();

    expect(
      screen.getByTestId('esqueleto-formulario')
    ).toHaveTextContent('Campos: 3');
  });

  it('debe solicitar los couriers al backend', async () => {
    await cargarCouriers();

    expect(clienteAxios.get).toHaveBeenCalledTimes(1);

    expect(clienteAxios.get).toHaveBeenCalledWith(
      'ventas/admin/couriers/'
    );
  });

  it('debe mostrar un formulario por cada courier recibido', async () => {
    await cargarCouriers();

    expect(obtenerChilexpress()).toBeInTheDocument();
    expect(obtenerStarken()).toBeInTheDocument();
  });

  it('debe mostrar correctamente los nombres de los couriers', async () => {
    await cargarCouriers();

    expect(
      screen.getByRole('heading', { name: 'Chilexpress' })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Starken' })
    ).toBeInTheDocument();
  });

  it('debe mostrar la descripción y ayuda del courier', async () => {
    await cargarCouriers();

    const formulario = obtenerChilexpress();

    expect(
      within(formulario).getByText(
        /Configura las credenciales de tu cuenta/
      )
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

  it('debe mostrar los campos de Chilexpress', async () => {
    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    expect(
      within(formulario).getByLabelText(/^Ambiente/)
    ).toBeInTheDocument();

    expect(
      within(formulario).getByLabelText(/API key del cotizador/)
    ).toBeInTheDocument();

    expect(
      within(formulario).getByLabelText(/^Qué vende la tienda/)
    ).toBeInTheDocument();
  });

  it('debe inicializar los campos con los datos recibidos', async () => {
    await cargarCouriers([courierChilexpress]);

    const formulario = obtenerChilexpress();

    expect(
      within(formulario).getByLabelText(/^Ambiente/)
    ).toHaveValue('PRUEBAS');

    expect(
      within(formulario).getByLabelText(/API key del cotizador/)
    ).toHaveValue('••••0001');
  });

  it('debe mostrar un error si falla la carga de couriers', async () => {
    clienteAxios.get.mockRejectedValueOnce(
      new Error('Error de conexión')
    );

    render(<GestorCouriers />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las credenciales de los couriers.'
    );

    expect(
      screen.queryByTestId('cargando')
    ).not.toBeInTheDocument();
  });

});

// =====================================================
// PRUEBAS DE EDICIÓN Y GUARDADO
// =====================================================

describe('GestorCouriers - edición y guardado', () => {

  it('debe permitir modificar los campos de un courier', async () => {
    const user = userEvent.setup();

    await cargarCouriers([courierChilexpress]);

    const ambiente = within(obtenerChilexpress())
      .getByLabelText(/^Ambiente/);

    await user.selectOptions(ambiente, 'PRODUCCION');

    expect(ambiente).toHaveValue('PRODUCCION');
  });

  it('debe permitir modificar campos independientes entre couriers', async () => {
    const user = userEvent.setup();

    await cargarCouriers();

    const campoChilexpress = within(obtenerChilexpress())
      .getByLabelText(/API key del cotizador/);

    const campoStarken = within(obtenerStarken())
      .getByLabelText('API Key (obligatorio)');

    await user.clear(campoChilexpress);
    await user.type(campoChilexpress, 'nueva_clave');

    await user.type(campoStarken, 'clave123');

    expect(campoChilexpress).toHaveValue('nueva_clave');
    expect(campoStarken).toHaveValue('clave123');
  });

  it('debe enviar las credenciales mediante PUT', async () => {
    clienteAxios.put.mockResolvedValueOnce({
      data: {
        ...courierChilexpress,
        datos: {
          ...courierChilexpress.datos,
          cotizador: '••••0001'
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    await userEvent.setup().then(async user => {
      await user.click(botonGuardarChilexpress());
    });

    await waitFor(() => {
      expect(clienteAxios.put).toHaveBeenCalled();
    });
  });

  it('debe mostrar un mensaje de éxito después de guardar', async () => {
    const user = userEvent.setup();

    clienteAxios.put.mockResolvedValueOnce({
      data: courierChilexpress
    });

    await cargarCouriers([courierChilexpress]);

    await user.click(botonGuardarChilexpress());

    expect(
      await within(obtenerChilexpress()).findByRole('status')
    ).toHaveTextContent(
      'Credenciales de Chilexpress guardadas.'
    );
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

    await user.click(botonGuardarChilexpress());

    expect(
      await within(obtenerChilexpress()).findByRole('alert')
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

    await user.click(botonGuardarChilexpress());

    expect(
      await within(obtenerChilexpress()).findByRole('alert')
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
            rut: 'El RUT no es válido.'
          }
        }
      }
    });

    await cargarCouriers([courierChilexpress]);

    await user.click(botonGuardarChilexpress());

    expect(
      await within(obtenerChilexpress()).findByText(
        'El RUT no es válido.'
      )
    ).toBeInTheDocument();
  });

});

// =====================================================
// CHILEXPRESS - CONFIGURACIÓN DE AMBIENTE
// =====================================================

describe('GestorCouriers - Chilexpress RF-02.3, RNF-03', () => {

  beforeEach(() => {
    clienteAxios.get.mockResolvedValue({
      data: [courierChilexpress]
    });
  });

  it('el ambiente y el contenido se eligen de una lista y la TCC no se pide en pruebas', async () => {
    render(<GestorCouriers />);

    const ambiente = await screen.findByLabelText(/^Ambiente/);

    expect(ambiente.tagName).toBe('SELECT');

    expect(ambiente).toHaveValue('PRUEBAS');

    expect(
      within(ambiente).getByRole('option', {
        name: /Producción/
      })
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/^Qué vende la tienda/)
    ).toHaveValue('Otros');

    expect(
      screen.getByLabelText(/API key del cotizador/)
    ).toHaveValue('••••0001');
  });

  it('al elegir producción la TCC y el RUT pasan a ser obligatorios', async () => {
    render(<GestorCouriers />);

    fireEvent.change(
      await screen.findByLabelText(/^Ambiente/),
      {
        target: { value: 'PRODUCCION' }
      }
    );

    expect(
      screen.getByLabelText(/Número de TCC/)
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/RUT de la empresa/)
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/^Ambiente/)
    ).toHaveAccessibleDescription(
      /teléfono comercial, el correo de contacto/
    );
  });

  it('guarda la TCC y el RUT tal como se escriben, con la llave enmascarada sin cambios', async () => {
    clienteAxios.put.mockImplementation((url, { datos }) =>
      Promise.resolve({
        data: {
          ...courierChilexpress,
          datos
        }
      })
    );

    render(<GestorCouriers />);

    fireEvent.change(
      await screen.findByLabelText(/^Ambiente/),
      {
        target: { value: 'PRODUCCION' }
      }
    );

    fireEvent.change(
      screen.getByLabelText(/Número de TCC/),
      {
        target: { value: '12345678' }
      }
    );

    fireEvent.change(
      screen.getByLabelText(/RUT de la empresa/),
      {
        target: { value: '76.123.456-0' }
      }
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Guardar credenciales de Chilexpress'
      })
    );

    expect(
      await screen.findByRole('status')
    ).toHaveTextContent(
      'Credenciales de Chilexpress guardadas.'
    );

    expect(clienteAxios.put).toHaveBeenCalledWith(
      'ventas/admin/couriers/chilexpress/',
      {
        datos: {
          ambiente: 'PRODUCCION',
          cotizador: '••••0001',
          tcc: '12345678',
          rut: '76.123.456-0',
          contenido: 'Otros'
        }
      }
    );
  });

  it('informa los datos que faltan y el error del servidor junto al campo', async () => {
    clienteAxios.get.mockResolvedValueOnce({
      data: [{
        ...courierChilexpress,
        configuradas: false,
        faltantes: ['tcc', 'rut'],
        datos: {
          ...courierChilexpress.datos,
          ambiente: 'PRODUCCION'
        }
      }]
    });

    clienteAxios.put.mockRejectedValueOnce({
      response: {
        data: {
          datos: {
            rut: 'El RUT no es válido.'
          }
        }
      }
    });

    render(<GestorCouriers />);

    expect(
      await screen.findByText(
        /Falta Número de TCC, RUT de la empresa/
      )
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Guardar credenciales de Chilexpress'
      })
    );

    expect(
      await screen.findByText('El RUT no es válido.')
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/RUT de la empresa/)
    ).toHaveAttribute('aria-invalid', 'true');
  });

});
