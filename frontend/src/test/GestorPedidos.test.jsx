import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GestorPedidos from '../components/GestorPedidos';
import clienteAxios from '../components/auth/axiosConfig';


vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: vi.fn(),
  }
}));

describe('GestorPedidos - Interfaz de Ventas', () => {
  it('renderiza correctamente los filtros de estado, revisión y controles de paginación', async () => {
    // Preparamos el mock para devolver 25 pedidos 
    clienteAxios.get.mockResolvedValueOnce({
      data: {
        count: 25,
        results: [
          { id: 1, estado: 'PENDIENTE', requiere_revision: false, transiciones_permitidas: [] }
        ]
      }
    });

    
    render(<GestorPedidos />);

    // Esperamos a que termine de cargar y muestre el texto de resultados
    await waitFor(() => {
      expect(screen.getByText(/25 pedido\(s\) encontrado\(s\)/i)).toBeInTheDocument();
    });

    //  Verificar la existencia del filtro por estados
    const selectEstado = screen.getAllByRole('combobox')[0];
    expect(selectEstado).toBeInTheDocument();

    //  Verificar la existencia del filtro "Requiere revisión"
    const checkboxRevision = screen.getByLabelText(/Requiere revisión/i);
    expect(checkboxRevision).toBeInTheDocument();

    // Verificar que los botones de paginación se renderizan y su estado inicial
    const btnAnterior = screen.getByRole('button', { name: /Anterior/i });
    const btnSiguiente = screen.getByRole('button', { name: /Siguiente/i });
    
    expect(btnAnterior).toBeInTheDocument();
    expect(btnSiguiente).toBeInTheDocument();
    
    // Al estar en la página 1, el botón Anterior debe estar deshabilitado
    expect(btnAnterior).toBeDisabled();
    // Al haber 25 pedidos (2 páginas), el botón Siguiente debe estar habilitado
    expect(btnSiguiente).not.toBeDisabled();
  });
});