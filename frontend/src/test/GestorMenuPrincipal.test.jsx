import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GestorMenuPrincipal from '../components/GestorMenuPrincipal';
const { get, patch, recargar } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), recargar: vi.fn() }));
vi.mock('../components/auth/axiosConfig', () => ({ default: { get, patch } }));
vi.mock('../hooks/useConfiguracionTienda', () => ({ recargarConfiguracion: recargar }));

describe('editor de menú', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ data: { nombre_tienda: 'Tienda', blog_nombre: 'Trabajos' } });
    patch.mockImplementation(async (_, datos) => ({ data: datos }));
    recargar.mockResolvedValue({});
  });
  it('etiqueta campos, anuncia movimientos, conserva foco y guarda solo el menú', async () => {
    render(<GestorMenuPrincipal />);
    const campo = await screen.findByLabelText('Catálogo');
    expect(campo).toHaveAttribute('maxLength', '30');
    expect(screen.getByRole('button', { name: 'Subir Inicio' })).toBeDisabled();
    fireEvent.change(campo, { target: { value: 'Productos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir Catálogo' }));
    expect(screen.getByRole('status')).toHaveTextContent('posición 1 de 5');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bajar Catálogo' })).toHaveFocus());
    expect(within(screen.getAllByRole('listitem')[0]).getByLabelText('Catálogo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar menú' }));
    await screen.findByText('Menú guardado.');
    expect(patch).toHaveBeenCalledWith('configuracion/negocio/', { menu_principal: { orden: ['catalogo', 'inicio', 'nosotros', 'sobre_mi', 'cotizar'], nombres: { catalogo: 'Productos' } } });
    expect(recargar).toHaveBeenCalledOnce();
  });
  it('restablece en borrador y mantiene los errores de guardado visibles', async () => {
    patch.mockRejectedValue({ response: { data: { menu_principal: ['Nombre inválido.'] } } });
    render(<GestorMenuPrincipal />);
    await screen.findByLabelText('Inicio');
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer valores predeterminados' }));
    expect(patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar menú' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nombre inválido.');
    expect(patch).toHaveBeenCalledWith('configuracion/negocio/', { menu_principal: {} });
  });
});
