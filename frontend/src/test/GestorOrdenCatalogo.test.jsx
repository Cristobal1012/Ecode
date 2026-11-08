import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GestorOrdenCatalogo from '../components/GestorOrdenCatalogo';
const { get, patch, recargar } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), recargar: vi.fn() }));
vi.mock('../components/auth/axiosConfig', () => ({ default: { get, patch } }));
vi.mock('../hooks/useConfiguracionTienda', () => ({ recargarConfiguracion: recargar }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async url => ({ data: url === 'configuracion/negocio/' ? { orden_catalogo: 'destacados', orden_categorias: [] } : [
    { categoria: 'Zeta', publicado: false }, { categoria: 'Alfa', publicado: true }, { categoria: 'Oculta', activo: false }
  ] }));
  patch.mockImplementation(async (_, datos) => ({ data: datos }));
  recargar.mockResolvedValue({});
});
it('incluye borradores, reordena con foco y persiste solo sus preferencias', async () => {
  render(<GestorOrdenCatalogo />);
  const selector = await screen.findByLabelText('Orden inicial del catálogo');
  expect(screen.queryByText('Oculta')).not.toBeInTheDocument();
  fireEvent.change(selector, { target: { value: 'precio-desc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Subir Zeta' }));
  expect(screen.getByRole('status')).toHaveTextContent('Zeta: posición 1');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Bajar Zeta' })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
  await screen.findByText('Orden del catálogo y categorías guardado.');
  expect(patch).toHaveBeenCalledWith('configuracion/negocio/', { orden_catalogo: 'precio-desc', orden_categorias: ['Zeta'] });
  expect(recargar).toHaveBeenCalledOnce();
});
it('restablece en borrador y presenta los errores del servidor', async () => {
  patch.mockRejectedValue({ response: { data: { orden_categorias: ['Categorías inválidas.'] } } });
  render(<GestorOrdenCatalogo />);
  await screen.findByLabelText('Orden inicial del catálogo');
  fireEvent.click(screen.getByRole('button', { name: 'Restablecer valores predeterminados' }));
  expect(patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar orden' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Categorías inválidas.');
  expect(patch).toHaveBeenCalledWith('configuracion/negocio/', { orden_catalogo: 'destacados', orden_categorias: [] });
});
