import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import GestorPedidos from '../components/GestorPedidos';
import clienteAxios from '../components/auth/axiosConfig';


vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: vi.fn(),
  }
}));

const pagina = (count, results = [{ id: 1, estado: 'PENDIENTE', requiere_revision: false, transiciones_permitidas: [] }]) =>
  ({ data: { count, results } });

describe('GestorPedidos - Interfaz de Ventas', () => {
  afterEach(cleanup);

  beforeEach(() => {
    clienteAxios.get.mockReset();
  });

  it('renderiza correctamente los filtros de estado, revisión y controles de paginación', async () => {
    // Preparamos el mock para devolver 25 pedidos
    clienteAxios.get.mockResolvedValueOnce(pagina(25));

    render(<GestorPedidos />);

    // Esperamos a que termine de cargar y muestre el texto de resultados
    await waitFor(() => {
      expect(screen.getByText(/25 pedido\(s\) encontrado\(s\)/i)).toBeInTheDocument();
    });

    // El filtro por estado tiene su etiqueta
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Requiere revisión/i)).toBeInTheDocument();

    const btnAnterior = screen.getByRole('button', { name: /Anterior/i });
    const btnSiguiente = screen.getByRole('button', { name: /Siguiente/i });

    // Al estar en la página 1, el botón Anterior debe estar deshabilitado
    expect(btnAnterior).toBeDisabled();
    // Al haber 25 pedidos (2 páginas), el botón Siguiente debe estar habilitado
    expect(btnSiguiente).not.toBeDisabled();
  });

  it('al filtrar por estado pide ese estado y los filtros siguen a la vista', async () => {
    clienteAxios.get.mockResolvedValueOnce(pagina(25)).mockResolvedValueOnce(pagina(0, []));
    render(<GestorPedidos />);
    const estado = await screen.findByRole('combobox', { name: 'Estado' });

    fireEvent.change(estado, { target: { value: 'ENVIADO' } });

    // El filtro no se desmonta mientras carga: el foco no se pierde
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBe(estado);
    expect(await screen.findByText('No hay pedidos despachados en este momento.')).toBeInTheDocument();
    expect(clienteAxios.get).toHaveBeenLastCalledWith('ventas/admin/ordenes/', { params: { pagina: 1, estado: 'ENVIADO' } });
  });

  it('una entrega coordinada sin dirección avisa que se acuerda con el comprador', async () => {
    clienteAxios.get.mockResolvedValueOnce(pagina(2, [
      { id: 1, estado: 'PAGADO', transiciones_permitidas: [], proveedor_logistico: 'ENTREGA_COORDINADA',
        direccion_envio_snapshot: {} },
      { id: 2, estado: 'PAGADO', transiciones_permitidas: [], proveedor_logistico: 'ENTREGA_COORDINADA',
        direccion_envio_snapshot: { calle: 'Los Aromos', numero: '1550', comuna: 'Ñuñoa' } },
    ]));
    render(<GestorPedidos />);

    expect(await screen.findByText('Dirección por acordar con el comprador')).toBeInTheDocument();
    expect(screen.getByText('Los Aromos 1550, Ñuñoa')).toBeInTheDocument();
  });

  it('si la página pedida ya no existe, vuelve a la anterior sin mostrar un error', async () => {
    clienteAxios.get
      .mockResolvedValueOnce(pagina(25))
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce(pagina(20));
    render(<GestorPedidos />);

    fireEvent.click(await screen.findByRole('button', { name: /Siguiente/i }));

    expect(await screen.findByText(/20 pedido\(s\) encontrado\(s\)/i)).toBeInTheDocument();
    expect(clienteAxios.get).toHaveBeenLastCalledWith('ventas/admin/ordenes/', { params: { pagina: 1 } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
