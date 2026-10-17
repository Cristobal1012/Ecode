import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { getMock, postMock, ajustarMock, guardarMock, validarMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  ajustarMock: vi.fn(),
  guardarMock: vi.fn(),
  validarMock: vi.fn(),
}));

vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}));

vi.mock('../components/carrito', async (importOriginal) => ({
  ...await importOriginal(),
  ajustarCarrito: ajustarMock,
  guardarCarrito: guardarMock,
  validarCarrito: validarMock,
}));

import Checkout from '../components/Checkout';

const producto = {
  id: 'producto-1',
  sku: 'SKU-001',
  nombre: 'Teclado mecánico',
  precio: 15000,
  cantidad: 1,
  peso_kg: 1,
  alto_cm: 10,
  ancho_cm: 10,
  largo_cm: 10,
};

function prepararRespuestas({ pasarelas = ['TRANSFERENCIA'], retiroLocal = true } = {}) {
  getMock.mockImplementation((url) => {
    if (url === 'configuracion/') {
      return Promise.resolve({
        data: {
          pasarelas_activas: pasarelas,
          retiro_en_local_activo: retiroLocal,
          calle_origen: 'Av. Principal',
          numero_origen: '123',
          comuna_origen: 'Santiago',
          region_origen: 'Metropolitana',
        },
      });
    }

    if (url === 'ventas/logistica/comunas/') {
      return Promise.resolve({ data: { comunas: ['Santiago'] } });
    }

    if (url === 'ventas/checkout/reglas/') {
      return Promise.resolve({ data: { modo_autenticacion: 'INVITADO' } });
    }

    if (url === 'ventas/paginas-legales/') {
      return Promise.resolve({ data: ['TERMINOS', 'PRIVACIDAD'].map((tipo_pagina) => ({ tipo_pagina })) });
    }

    return Promise.resolve({ data: [] });
  });

  postMock.mockResolvedValue({ data: {} });
  validarMock.mockResolvedValue([producto]);
  ajustarMock.mockReturnValue({ items: [producto], avisos: [] });
  guardarMock.mockImplementation(async (items) => {
    const { guardarCarrito } = await vi.importActual('../components/carrito');
    return guardarCarrito(items);
  });
}

function renderCheckout({ conProducto = true } = {}) {
  if (conProducto) {
    localStorage.setItem('carrito_local', JSON.stringify([producto]));
  }

  return render(
    <MemoryRouter>
      <Checkout />
    </MemoryRouter>
  );
}

function completarDestinatario() {
  fireEvent.change(screen.getByLabelText(/nombre de quien recibe/i), {
    target: { value: 'Comprador QA' },
  });
  fireEvent.change(screen.getByLabelText(/teléfono de contacto/i), {
    target: { value: '+56912345678' },
  });
}

describe('Checkout', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.removeItem('access_token');
    prepararRespuestas();
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra el checkbox legal desmarcado por defecto', async () => {
    renderCheckout();

    const checkbox = await screen.findByRole('checkbox', {
      name: /acepto los/i,
    });

    expect(checkbox).not.toBeChecked();
  });

  it('mantiene deshabilitado el botón de pago mientras no se acepten los términos', async () => {
    renderCheckout();

    const botonPago = await screen.findByRole('button', {
      name: 'Pagar con Transferencia bancaria',
    });

    // Seleccionamos retiro en local para disponer de una opción de entrega válida.
    fireEvent.click(screen.getByRole('radio', { name: /retiro en local/i }));
    completarDestinatario();

    expect(botonPago).toBeDisabled();

    const checkbox = screen.getByRole('checkbox', { name: /acepto los/i });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(botonPago).toBeEnabled();
    });
  });

  it('permite marcar y desmarcar el checkbox legal', async () => {
    renderCheckout();

    const checkbox = await screen.findByRole('checkbox', {
      name: /acepto los/i,
    });

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('mantiene deshabilitado el pago cuando el carrito está vacío', async () => {
    renderCheckout({ conProducto: false });

    const botonPago = await screen.findByRole('button', {
      name: 'Pagar con Transferencia bancaria',
    });

    const checkbox = screen.getByRole('checkbox', { name: /acepto los/i });
    fireEvent.click(checkbox);

    expect(botonPago).toBeDisabled();
  });

  it('muestra los enlaces a las páginas legales cuando están publicadas', async () => {
    renderCheckout();

    expect(
      await screen.findByRole('link', { name: /términos y condiciones/i })
    ).toHaveAttribute('href', '/legal/terminos');

    expect(
      screen.getByRole('link', { name: /política de privacidad/i })
    ).toHaveAttribute('href', '/legal/privacidad');
  });


  it('deshabilita nuevamente el pago si se desmarcan los términos', async () => {
    renderCheckout();

    const botonPago = await screen.findByRole('button', {
        name: 'Pagar con Transferencia bancaria',
    });

    // Elegimos una opción de entrega válida.
    fireEvent.click(
        screen.getByRole('radio', { name: /retiro en local/i })
    );

    const checkbox = screen.getByRole('checkbox', {
        name: /acepto los/i,
    });

    // Aceptamos los términos.
    completarDestinatario();
    fireEvent.click(checkbox);
    await waitFor(() => expect(botonPago).toBeEnabled());

    // Retiramos la aceptación.
    fireEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(botonPago).toBeDisabled();
  });

  it('no envía la compra cuando los términos no han sido aceptados', async () => {
    renderCheckout();

    const botonPago = await screen.findByRole('button', {
        name: 'Pagar con Transferencia bancaria',
    });

    fireEvent.click(
        screen.getByRole('radio', { name: /retiro en local/i })
    );

    const checkbox = screen.getByRole('checkbox', {
        name: /acepto los/i,
    });

    expect(checkbox).not.toBeChecked();
    expect(botonPago).toBeDisabled();

    // Intentamos hacer clic aunque el botón esté deshabilitado.
    fireEvent.click(botonPago);

    expect(postMock).not.toHaveBeenCalledWith(
        'ventas/checkout/',
        expect.anything()
    );
  });

  it('envía acepta_terminos como true al confirmar la compra', async () => {
    renderCheckout();

    const botonPago = await screen.findByRole('button', {
        name: 'Pagar con Transferencia bancaria',
    });

    fireEvent.click(
        screen.getByRole('radio', { name: /retiro en local/i })
    );

    const checkbox = screen.getByRole('checkbox', {
        name: /acepto los/i,
    });

    fireEvent.click(checkbox);

    fireEvent.change(screen.getByLabelText(/nombre de quien recibe/i), {
      target: { value: 'Comprador QA' },
    });
    fireEvent.change(screen.getByLabelText(/teléfono de contacto/i), {
      target: { value: '+56912345678' },
    });
    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'qa@example.test' },
    });

    await waitFor(() => expect(botonPago).toBeEnabled());

    fireEvent.click(botonPago);

    await waitFor(() => {
        expect(postMock).toHaveBeenCalledWith(
        'ventas/checkout/',
        expect.objectContaining({
            acepta_terminos: true,
        })
        );
    });
  });

  ///////////////////////////
  it('muestra todos los medios de pago configurados', async () => {
    prepararRespuestas({
        pasarelas: ['TRANSFERENCIA', 'TRANSBANK'],
    });

    renderCheckout();

    expect(
        await screen.findByRole('button', {
            name: 'Pagar con Transferencia bancaria',
        })
    ).toBeInTheDocument();

    expect(
        screen.getByRole('button', {
            name: 'Pagar con Webpay (Transbank)',
        })
    ).toBeInTheDocument();
  });

  it('muestra un mensaje si no hay medios de pago configurados', async () => {
    prepararRespuestas({ pasarelas: [] });

    renderCheckout();

    expect(
        await screen.findByText(
            'No hay métodos de pago configurados en la tienda.'
        )
    ).toBeInTheDocument();

    expect(
        screen.queryByRole('button', {
            name: /pagar con/i,
        })
    ).not.toBeInTheDocument();
  });

  it('muestra correctamente el subtotal de varios productos', async () => {
    const segundoProducto = {
        ...producto,
        id: 'producto-2',
        sku: 'SKU-002',
        nombre: 'Mouse inalámbrico',
        precio: 10000,
        cantidad: 1,
    };

    localStorage.setItem(
        'carrito_local',
        JSON.stringify([producto, segundoProducto])
    );

    render(
        <MemoryRouter>
            <Checkout />
        </MemoryRouter>
    );

    expect(
        await screen.findByText('Teclado mecánico (x1)')
    ).toBeInTheDocument();

    expect(
        screen.getByText('Mouse inalámbrico (x1)')
    ).toBeInTheDocument();

    // $15.000 + $10.000 = $25.000
    const subtotalLabel = screen.getByText('Subtotal:');
    const subtotalContainer = subtotalLabel.parentElement;

    expect(subtotalContainer).toHaveTextContent('$25.000');
  });

  it('mantiene el checkout disponible si falla la carga de páginas legales', async () => {
    getMock.mockImplementation((url) => {
        if (url === 'ventas/paginas-legales/') {
            return Promise.reject(new Error('Error de conexión'));
        }

        if (url === 'configuracion/') {
            return Promise.resolve({
                data: {
                    pasarelas_activas: ['TRANSFERENCIA'],
                    retiro_en_local_activo: true,
                    calle_origen: 'Av. Principal',
                    numero_origen: '123',
                    comuna_origen: 'Santiago',
                    region_origen: 'Metropolitana',
                },
            });
        }

        if (url === 'ventas/logistica/comunas/') {
            return Promise.resolve({
                data: { comunas: ['Santiago'] },
            });
        }

        if (url === 'ventas/checkout/reglas/') {
            return Promise.resolve({
                data: { modo_autenticacion: 'INVITADO' },
            });
        }

        return Promise.resolve({ data: [] });
    });

    renderCheckout();

    expect(
        await screen.findByRole('checkbox', {
            name: /acepto los/i,
        })
    ).toBeInTheDocument();

    // Sin páginas publicadas, los textos legales siguen apareciendo,
    // pero no deben convertirse en enlaces.
    expect(
        screen.queryByRole('link', {
            name: /términos y condiciones/i,
        })
    ).not.toBeInTheDocument();

    expect(
        screen.queryByRole('link', {
            name: /política de privacidad/i,
        })
    ).not.toBeInTheDocument();
  });

  it('muestra un error si no se pueden cargar las reglas del checkout', async () => {
    getMock.mockImplementation((url) => {
        if (url === 'ventas/checkout/reglas/') {
            return Promise.reject(new Error('Error de conexión'));
        }

        if (url === 'configuracion/') {
            return Promise.resolve({
                data: {
                    pasarelas_activas: ['TRANSFERENCIA'],
                    retiro_en_local_activo: true,
                },
            });
        }

        if (url === 'ventas/logistica/comunas/') {
            return Promise.resolve({
                data: { comunas: ['Santiago'] },
            });
        }

        if (url === 'ventas/paginas-legales/') {
            return Promise.resolve({ data: [] });
        }

        return Promise.resolve({ data: [] });
    });

    renderCheckout();

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudieron cargar las opciones de compra.'
    );

    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });

  it('solicita una cotización y muestra el costo de envío devuelto por el backend', async () => {
    postMock.mockImplementation((url) => {
        if (url === 'ventas/logistica/cotizar/') {
            return Promise.resolve({
                data: {
                    proveedor: 'CHILEXPRESS',
                    tiempo_estimado: '2 días',
                    precio: 3500,
                },
            });
        }

        return Promise.resolve({ data: {} });
    });

    renderCheckout();

    // Esperamos a que las comunas estén cargadas.
    await screen.findByRole('option', { name: 'Santiago' });

    const selectorComuna = screen.getByLabelText('Comuna');

    fireEvent.change(selectorComuna, {
        target: { value: 'Santiago' },
    });

    // Verificamos que se envíe la comuna en mayúsculas
    // y que se calculen las dimensiones del paquete.
    await waitFor(() => {
        expect(postMock).toHaveBeenCalledWith(
            'ventas/logistica/cotizar/',
            {
                destino: 'SANTIAGO',
                peso: 1,
                alto: 10,
                ancho: 10,
                largo: 10,
            },
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    // Verificamos que se muestre la respuesta del backend.
    expect(
        await screen.findByText('Chilexpress - 2 días')
    ).toBeInTheDocument();

    expect(screen.getAllByText('$3.500')).toHaveLength(2);
  });

  it('muestra un mensaje cuando falla la cotización del envío', async () => {
    postMock.mockImplementation((url) => {
        if (url === 'ventas/logistica/cotizar/') {
            return Promise.reject(new Error('Error de conexión'));
        }

        return Promise.resolve({ data: {} });
    });

    renderCheckout();

    await screen.findByRole('option', { name: 'Santiago' });

    fireEvent.change(screen.getByLabelText('Comuna'), {
        target: { value: 'Santiago' },
    });

    expect(
        await screen.findByText(
            'No se pudo calcular el costo de envío.'
        )
    ).toBeInTheDocument();

    expect(
        screen.queryByText('Chilexpress - 2 días')
    ).not.toBeInTheDocument();
  });

  it('sincroniza el resumen y el contador al cambiar cantidades desde el encabezado', async () => {
    renderCheckout();
    await screen.findByRole('checkbox', { name: /acepto los/i });
    validarMock.mockResolvedValue({
      items: [{ producto_mongo_id: producto.id, variante_sku: producto.sku,
        disponible: 5, precio: producto.precio, problema: null }],
    });

    fireEvent.click(screen.getByRole('radio', { name: /retiro en local/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Carrito de compras, 1 producto' }));
    fireEvent.click(screen.getByRole('button', { name: /aumentar cantidad de teclado/i }));

    expect(await screen.findByText('Teclado mecánico (x2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carrito de compras, 2 productos' })).toBeInTheDocument();
    expect(screen.getByText('Subtotal:').parentElement).toHaveTextContent('$30.000');

    fireEvent.click(screen.getByRole('button', { name: /quitar teclado.*del carrito/i }));
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Carrito de compras, 0 productos',
    })).toBeInTheDocument());
    expect(screen.getByText('No hay productos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar con Transferencia bancaria' })).toBeDisabled();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

});
