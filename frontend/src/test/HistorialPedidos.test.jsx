import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: vi.fn() } }));
vi.mock('../components/header/header', () => ({ default: () => null }));

import clienteAxios from '../components/auth/axiosConfig';
import HistorialPedidos from '../pages/HistorialPedidos';
import { leerTokensDeEnlace, olvidarTokensDeEnlace } from '../utils/enlacesConToken';

const pedido = (id, estado, extra = {}) => ({
  id, estado, fecha: '2026-10-20T12:00:00Z', total_final: 15000, detalles: [], token_resena: null,
  resena_enviada: false, ...extra
});

describe('Mis pedidos: reseñas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clienteAxios.get.mockImplementation((url) => Promise.resolve({ data: url === 'ventas/mis-pedidos/' ? [
      pedido(12, 'ENTREGADO', { token_resena: 'abc:def/123' }),
      pedido(11, 'ENTREGADO', { resena_enviada: true }),
      pedido(10, 'ENVIADO')
    ] : {} }));
  });

  afterEach(() => cleanup());

  it('un pedido que se puede reseñar lleva al formulario con su enlace firmado, sin dejarlo en la URL', async () => {
    render(<MemoryRouter><HistorialPedidos /></MemoryRouter>);

    const enlace = await screen.findByRole('link', { name: 'Dejar reseña del pedido #12' });
    expect(enlace).toHaveAttribute('href', '/resena');
    fireEvent.click(enlace);
    expect(leerTokensDeEnlace('/resena')).toEqual({ t: 'abc:def/123' });
    olvidarTokensDeEnlace('/resena');
  });

  it('un pedido ya reseñado lo dice y uno en camino no ofrece nada', async () => {
    render(<MemoryRouter><HistorialPedidos /></MemoryRouter>);

    const fila = (await screen.findByText('#11')).closest('tr');
    expect(within(fila).getByText('Reseña enviada')).toBeInTheDocument();
    expect(within(fila).queryByRole('link', { name: /Dejar reseña/ })).not.toBeInTheDocument();
    const enCamino = screen.getByText('#10').closest('tr');
    expect(within(enCamino).queryByRole('link', { name: /Dejar reseña/ })).not.toBeInTheDocument();
    expect(within(enCamino).queryByText('Reseña enviada')).not.toBeInTheDocument();
  });
});
