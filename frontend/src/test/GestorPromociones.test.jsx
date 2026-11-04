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
