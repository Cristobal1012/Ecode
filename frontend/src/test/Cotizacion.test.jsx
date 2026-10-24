import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { configuracion } = vi.hoisted(() => ({ configuracion: { actual: null } }));

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../hooks/useConfiguracionTienda', () => ({
  default: () => configuracion.actual,
  recargarConfiguracion: vi.fn()
}));

import clienteAxios from '../components/auth/axiosConfig';
import Cotizacion from '../pages/Cotizacion';
import GestorCotizaciones from '../components/GestorCotizaciones';

const PRODUCTOS = [
  { id: 'taza', nombre: 'Taza de cerámica', activo: true, publicado: true },
  { id: 'borrador', nombre: 'Producto en borrador', activo: true, publicado: false }
];

function renderCotizacion(ruta = '/cotizar') {
  return render(<MemoryRouter initialEntries={[ruta]}><Cotizacion /></MemoryRouter>);
}

function completarContacto() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana Pérez' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.test' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+56912345678' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /acepto que la tienda use mis datos/i }));
}

const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

describe('Formulario de cotización', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configuracion.actual = { nombre_tienda: 'Tienda QA', cotizaciones_activas: true };
    clienteAxios.get.mockImplementation((url) => Promise.resolve({ data: url === 'catalogo/productos/' ? PRODUCTOS : [] }));
    clienteAxios.post.mockResolvedValue({ data: { mensaje: 'Recibimos tu solicitud.' } });
  });

  afterEach(() => cleanup());

  it('si la tienda no recibe cotizaciones lo dice y no muestra el formulario', () => {
    configuracion.actual = { cotizaciones_activas: false };
    renderCotizacion();
    expect(screen.getByText(/no está recibiendo cotizaciones/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).not.toBeInTheDocument();
  });

  it('ofrece solo los productos publicados y llega con el producto de la ficha elegido', async () => {
    renderCotizacion('/cotizar?producto=taza');

    expect(await screen.findByRole('option', { name: 'Taza de cerámica' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Producto en borrador' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Producto')).toHaveValue('taza');
  });

  it('el envío exige aceptar la Política de Privacidad, desmarcada por defecto', () => {
    renderCotizacion();
    const privacidad = screen.getByRole('checkbox', { name: /acepto que la tienda use mis datos/i });
    expect(privacidad).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeDisabled();
  });

  it('una persona envía su solicitud y ve la confirmación', async () => {
    renderCotizacion('/cotizar?producto=taza');
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(/personalización/i), { target: { value: 'Con el logo' } });
    completarContacto();
    enviar();

    expect(await screen.findByRole('status')).toHaveTextContent('Recibimos tu solicitud.');
    expect(clienteAxios.post).toHaveBeenCalledWith('ventas/cotizaciones/', expect.objectContaining({
      producto_id: 'taza', cantidad: 50, personalizacion: 'Con el logo', nombre: 'Ana Pérez',
      como_empresa: false, empresa: null, fecha_requerida: null, acepta_privacidad: true, sitio_web: ''
    }));
    // El formulario queda limpio para otra solicitud
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
  });

  it('una empresa con un RUT inválido ve el error junto al campo y no se envía', async () => {
    renderCotizacion('/cotizar?producto=taza');
    completarContacto();
    fireEvent.click(screen.getByRole('checkbox', { name: /cotizo para una empresa/i }));
    // Con los demás datos completos (si falta uno, el navegador no deja enviar y marca ese campo)
    const datos = { 'Razón social': 'Comercial Andes SpA', 'RUT de la empresa': '76.123.456-1', Giro: 'Regalos',
                    'Dirección comercial': 'Av. Providencia 1234', 'Correo para la factura': 'f@andes.test' };
    Object.entries(datos).forEach(([etiqueta, valor]) =>
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } }));
    enviar();

    expect(await screen.findByLabelText('RUT de la empresa')).toHaveAccessibleDescription(/dígito verificador/);
    expect(clienteAxios.post).not.toHaveBeenCalled();
  });

  it('muestra junto a cada campo los errores del servidor, también los de la empresa', async () => {
    clienteAxios.post.mockRejectedValue({ response: { status: 400, data: {
      telefono: 'Ingresa un teléfono chileno de 9 dígitos.',
      empresa: { giro: 'Este dato es obligatorio para la factura.' }
    } } });
    renderCotizacion('/cotizar?producto=taza');
    completarContacto();
    fireEvent.click(screen.getByRole('checkbox', { name: /cotizo para una empresa/i }));
    const datos = { 'Razón social': 'Comercial Andes SpA', 'RUT de la empresa': '76.123.456-0', Giro: 'x',
                    'Dirección comercial': 'Av. Providencia 1234', 'Correo para la factura': 'f@andes.test' };
    Object.entries(datos).forEach(([etiqueta, valor]) =>
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } }));
    enviar();

    await waitFor(() => expect(screen.getByLabelText('Teléfono'))
      .toHaveAccessibleDescription('Ingresa un teléfono chileno de 9 dígitos.'));
    expect(screen.getByLabelText('Giro')).toHaveAccessibleDescription('Este dato es obligatorio para la factura.');
  });

  it('avisa cuando se enviaron demasiadas solicitudes seguidas', async () => {
    clienteAxios.post.mockRejectedValue({ response: { status: 429, data: { detail: 'Request was throttled.' } } });
    renderCotizacion('/cotizar?producto=taza');
    completarContacto();
    enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(/muchas solicitudes seguidas/);
  });
});

describe('Panel: cotizaciones', () => {
  const COTIZACION = {
    id: 7, fecha_creacion: '2026-10-20T15:00:00Z', estado: 'NUEVA', estado_display: 'Nueva', nombre: 'Ana Pérez',
    correo: 'ana@example.test', telefono: '+56912345678', producto_id: 'taza', producto_nombre: 'Taza de cerámica',
    descripcion: '', cantidad: 50, personalizacion: 'Con el logo', fecha_requerida: '2026-11-05',
    datos_empresa: { razon_social: 'Comercial Andes SpA', rut: '76.123.456-0', giro: 'Regalos',
                     direccion: 'Av. Providencia 1234', correo: 'facturas@andes.test' }
  };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('muestra cada solicitud con sus datos y la de la empresa', async () => {
    clienteAxios.get.mockResolvedValue({ data: [COTIZACION] });
    render(<GestorCotizaciones />);

    expect(await screen.findByRole('heading', { name: '#7 · Taza de cerámica' })).toBeInTheDocument();
    expect(screen.getByText('05-11-2026')).toBeInTheDocument();
    expect(screen.getByText(/RUT 76.123.456-0/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ana@example.test' })).toHaveAttribute('href', 'mailto:ana@example.test');
  });

  it('la tienda cambia el estado y lo ve confirmado', async () => {
    clienteAxios.get.mockResolvedValue({ data: [COTIZACION] });
    clienteAxios.patch.mockResolvedValue({ data: { ...COTIZACION, estado: 'RESPONDIDA', estado_display: 'Respondida' } });
    render(<GestorCotizaciones />);

    fireEvent.change(await screen.findByLabelText('Estado de la cotización #7'), { target: { value: 'RESPONDIDA' } });

    expect(await screen.findByRole('status')).toHaveTextContent('La cotización #7 quedó como Respondida.');
    expect(clienteAxios.patch).toHaveBeenCalledWith('ventas/admin/cotizaciones/7/', { estado: 'RESPONDIDA' });
    expect(screen.getByLabelText('Estado de la cotización #7')).toHaveValue('RESPONDIDA');
  });

  it('sin solicitudes lo dice', async () => {
    clienteAxios.get.mockResolvedValue({ data: [] });
    render(<GestorCotizaciones />);
    expect(await screen.findByText('Todavía no hay solicitudes de cotización.')).toBeInTheDocument();
  });
});
