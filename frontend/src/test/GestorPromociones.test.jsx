import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import clienteAxios from '../components/auth/axiosConfig';
import GestorPromociones from '../components/GestorPromociones';

describe('GestorPromociones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clienteAxios.get.mockResolvedValue({ data: [] });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => cleanup());

  it('el código queda en mayúsculas y sin espacios mientras se escribe', () => {
    render(<GestorPromociones />);
    const codigo = screen.getByLabelText('Código de Descuento');

    fireEvent.change(codigo, { target: { value: 'verano 20' } });

    expect(codigo).toHaveValue('VERANO20');
    expect(codigo).toHaveAttribute('maxLength', '50');
  });

  it('un porcentaje se limita a 100 y el umbral de envío gratis a montos positivos', () => {
    render(<GestorPromociones />);

    expect(screen.getByLabelText('Valor del Descuento')).toHaveAttribute('max', '100');
    expect(screen.getByLabelText('Umbral Envío Gratis ($)')).toHaveAttribute('min', '1');
    fireEvent.change(screen.getByLabelText('Tipo de Descuento'), { target: { value: 'MONTO_FIJO' } });
    expect(screen.getByLabelText('Valor del Descuento')).not.toHaveAttribute('max');
  });

  it('un código automático con compra mínima se envía con sus campos y sin límite de usos', async () => {
    clienteAxios.post.mockImplementation((_, datos) => Promise.resolve({ data: { id: 1, usos: 0, ...datos } }));
    render(<GestorPromociones />);

    fireEvent.change(screen.getByLabelText('Código de Descuento'), { target: { value: 'sobre30' } });
    fireEvent.change(screen.getByLabelText('Valor del Descuento'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aplicar automáticamente' }));
    expect(screen.getByLabelText('Compra mínima ($)')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Compra mínima ($)'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Promoción' }));

    await waitFor(() => expect(clienteAxios.post).toHaveBeenCalledWith('ventas/promociones/', expect.objectContaining({
      codigo: 'SOBRE30', automatica: true, monto_minimo: '30000', usos_maximos: null })));
    expect(await screen.findByText('0 (sin límite)')).toBeInTheDocument();
  });

  it('si el servidor rechaza el código, dice por qué', async () => {
    clienteAxios.post.mockRejectedValue({ response: { status: 400, data: {
      valor_descuento: ['Un descuento en porcentaje puede ser de hasta 100.'] } } });
    render(<GestorPromociones />);

    fireEvent.change(screen.getByLabelText('Código de Descuento'), { target: { value: 'TODO' } });
    fireEvent.change(screen.getByLabelText('Valor del Descuento'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Promoción' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
      'No se pudo guardar el código:\nUn descuento en porcentaje puede ser de hasta 100.'));
  });
});
