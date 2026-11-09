import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TarjetaProducto from '../components/TarjetaProducto';
import ProductCardList from '../components/ProductCardList';
import FormularioProducto from '../components/FormularioProducto';
import clienteAxios from '../components/auth/axiosConfig';

vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('Colección privada (SCRUM-197)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('TarjetaProducto', () => {
    const obraPrivada = {
      id: 'obra-001',
      nombre: 'Pintura En Óleo',
      categoria: 'Arte',
      coleccion_privada: true,
      version_a_la_venta: 'print-001',
      version_a_la_venta_disponible: true,
      texto_boton_version: 'Comprar lámina',
      variantes: [{ sku: 'OLEO-1', precio: 500000, stock: 0 }],
    };

    it('muestra "Colección privada" en vez de precio y no muestra "Agotado" ni "Sin stock"', () => {
      render(
        <MemoryRouter>
          <TarjetaProducto producto={obraPrivada} />
        </MemoryRouter>
      );

      expect(screen.getByText('Colección privada')).toBeInTheDocument();
      expect(screen.queryByText('Agotado')).not.toBeInTheDocument();
      expect(screen.queryByText('Sin stock')).not.toBeInTheDocument();
      expect(screen.queryByText('$500.000')).not.toBeInTheDocument();
    });

    it('muestra el botón con texto personalizado y navega a la versión a la venta al hacer clic', () => {
      render(
        <MemoryRouter>
          <TarjetaProducto producto={obraPrivada} />
        </MemoryRouter>
      );

      const boton = screen.getByRole('button', { name: 'Comprar lámina' });
      expect(boton).toBeInTheDocument();

      fireEvent.click(boton);
      expect(mockedNavigate).toHaveBeenCalledWith('/catalogo/producto/print-001');
    });

    it('oculta el botón si la versión a la venta no está disponible', () => {
      render(
        <MemoryRouter>
          <TarjetaProducto producto={{ ...obraPrivada, version_a_la_venta_disponible: false }} />
        </MemoryRouter>
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByText('Colección privada')).toBeInTheDocument();
    });
  });

  describe('ProductCardList (layout lista)', () => {
    const obraPrivada = {
      id: 'obra-001',
      nombre: 'Pintura En Óleo',
      categoria: 'Arte',
      coleccion_privada: true,
      version_a_la_venta: 'print-001',
      version_a_la_venta_disponible: true,
      texto_boton_version: 'Disponible en print',
      variantes: [{ sku: 'OLEO-1', precio: 500000, stock: 0 }],
    };

    it('muestra "Colección privada" y botón de versión en la lista', () => {
      render(
        <MemoryRouter>
          <ProductCardList producto={obraPrivada} />
        </MemoryRouter>
      );

      expect(screen.getByText('Colección privada')).toBeInTheDocument();
      expect(screen.queryByText('Agotado')).not.toBeInTheDocument();
      expect(screen.queryByText('Sin stock')).not.toBeInTheDocument();

      const boton = screen.getByRole('button', { name: 'Disponible en print' });
      expect(boton).toBeInTheDocument();
      fireEvent.click(boton);
      expect(mockedNavigate).toHaveBeenCalledWith('/catalogo/producto/print-001');
    });
  });

  describe('FormularioProducto (Admin)', () => {
    const catalogo = [
      { id: 'prod-actual', nombre: 'Obra Principal', coleccion_privada: false, publicado: true },
      { id: 'print-1', nombre: 'Lámina Print A3', coleccion_privada: false, publicado: true },
      { id: 'privada-otra', nombre: 'Otra Obra Privada', coleccion_privada: true, publicado: true },
    ];

    it('permite activar colección privada, seleccionar versión y personalizar texto', async () => {
      clienteAxios.get.mockResolvedValueOnce({ data: catalogo });

      render(
        <MemoryRouter>
          <FormularioProducto
            productoAEditar={{
              id: 'prod-actual',
              nombre: 'Obra Principal',
              categoria: 'Arte',
              publicado: true,
              coleccion_privada: false,
              variantes: [{ sku: 'OBRA-1', precio: 10000, stock: 1 }],
            }}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(clienteAxios.get).toHaveBeenCalledWith('catalogo/productos/?todos=true');
      });

      const checkbox = screen.getByRole('checkbox', { name: /No está a la venta/i });
      expect(checkbox).not.toBeChecked();

      // No debe mostrar campos de versión aún
      expect(screen.queryByLabelText(/Versión a la venta/i)).not.toBeInTheDocument();

      // Activar colección privada
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      // Ahora aparecen los campos
      const selectVersion = screen.getByLabelText(/Versión a la venta/i);
      expect(selectVersion).toBeInTheDocument();

      // Debe incluir 'Lámina Print A3', pero NO a sí misma ('Obra Principal') ni a 'Otra Obra Privada'
      expect(screen.getByRole('option', { name: /Lámina Print A3/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Obra Principal/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Otra Obra Privada/i })).not.toBeInTheDocument();

      // Seleccionar la lámina print
      fireEvent.change(selectVersion, { target: { value: 'print-1' } });

      // Debe aparecer el campo para el texto del botón con el valor por defecto
      const inputTextoBoton = screen.getByLabelText(/Texto del botón/i);
      expect(inputTextoBoton).toHaveValue('Disponible en print');

      // Modificar el texto
      fireEvent.change(inputTextoBoton, { target: { value: 'Comprar print A3' } });
      expect(inputTextoBoton).toHaveValue('Comprar print A3');
    });
  });
});
