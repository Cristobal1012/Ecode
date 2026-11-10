import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

import clienteAxios from '../components/auth/axiosConfig';
import GestorCouriers from '../components/GestorCouriers';

const PRODUCCION = ['ambiente', 'PRODUCCION'];

// Como lo devuelve ventas/admin/couriers/ (courier_para_panel)
const CHILEXPRESS = {
  codigo: 'CHILEXPRESS',
  nombre: 'Chilexpress',
  ayuda: 'Las de producción las entrega Chilexpress.',
  configuradas: true,
  faltantes: [],
  campos: [
    { nombre: 'ambiente', etiqueta: 'Ambiente', secreto: false, opciones: ['PRUEBAS', 'PRODUCCION'], obligatorio: false, obligatorio_si: null, formato: '' },
    { nombre: 'cotizador', etiqueta: 'API key del cotizador (Rating)', secreto: true, opciones: [], obligatorio: true, obligatorio_si: null, formato: '' },
    { nombre: 'tcc', etiqueta: 'Número de TCC', secreto: false, opciones: [], obligatorio: true, obligatorio_si: PRODUCCION, formato: 'digitos' },
    { nombre: 'rut', etiqueta: 'RUT de la empresa', secreto: false, opciones: [], obligatorio: true, obligatorio_si: PRODUCCION, formato: 'rut' },
    { nombre: 'contenido', etiqueta: 'Qué vende la tienda', secreto: false, opciones: ['Vestuario', 'Otros'], obligatorio: false, obligatorio_si: null, formato: '' }
  ],
  datos: { ambiente: 'PRUEBAS', cotizador: '••••0001', tcc: '', rut: '', contenido: 'Otros' }
};

describe('GestorCouriers (RF-02.3, RNF-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clienteAxios.get.mockResolvedValue({ data: [CHILEXPRESS] });
  });

  afterEach(() => cleanup());

  it('el ambiente y el contenido se eligen de una lista y la TCC no se pide en pruebas', async () => {
    render(<GestorCouriers />);

    const ambiente = await screen.findByLabelText(/^Ambiente/);
    expect(ambiente.tagName).toBe('SELECT');
    expect(ambiente).toHaveValue('PRUEBAS');
    expect(within(ambiente).getByRole('option', { name: /Producción/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Qué vende la tienda/)).toHaveValue('Otros');
    expect(screen.getByLabelText('Número de TCC (solo en producción)')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('API key del cotizador (Rating) (obligatorio)')).toHaveValue('••••0001');
  });

  it('al elegir producción la TCC y el RUT pasan a ser obligatorios y avisa qué datos usa la tienda', async () => {
    render(<GestorCouriers />);

    fireEvent.change(await screen.findByLabelText(/^Ambiente/), { target: { value: 'PRODUCCION' } });

    expect(screen.getByLabelText('Número de TCC (obligatorio)')).toBeInTheDocument();
    expect(screen.getByLabelText('RUT de la empresa (obligatorio)')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Ambiente/)).toHaveAccessibleDescription(/teléfono comercial, el correo de contacto/);
  });

  it('guarda la TCC y el RUT tal como se escriben, con la llave enmascarada sin cambios', async () => {
    clienteAxios.put.mockImplementation((_, { datos }) => Promise.resolve({ data: { ...CHILEXPRESS, datos } }));
    render(<GestorCouriers />);

    fireEvent.change(await screen.findByLabelText(/^Ambiente/), { target: { value: 'PRODUCCION' } });
    fireEvent.change(screen.getByLabelText(/^Número de TCC/), { target: { value: '12345678' } });
    fireEvent.change(screen.getByLabelText(/^RUT de la empresa/), { target: { value: '76.123.456-0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales de Chilexpress' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Credenciales de Chilexpress guardadas.');
    expect(clienteAxios.put).toHaveBeenCalledWith('ventas/admin/couriers/CHILEXPRESS/', {
      datos: { ambiente: 'PRODUCCION', cotizador: '••••0001', tcc: '12345678', rut: '76.123.456-0', contenido: 'Otros' }
    });
  });

  it('informa los datos que faltan y el error del servidor junto al campo', async () => {
    clienteAxios.get.mockResolvedValue({ data: [{
      ...CHILEXPRESS, configuradas: false, faltantes: ['tcc', 'rut'], datos: { ...CHILEXPRESS.datos, ambiente: 'PRODUCCION' }
    }] });
    clienteAxios.put.mockRejectedValue({ response: { data: { datos: { rut: 'El RUT no es válido.' } } } });
    render(<GestorCouriers />);

    expect(await screen.findByText(/Falta Número de TCC, RUT de la empresa: sin esos datos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar credenciales de Chilexpress' }));

    expect(await screen.findByText('El RUT no es válido.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^RUT de la empresa/)).toHaveAttribute('aria-invalid', 'true');
  });
});
