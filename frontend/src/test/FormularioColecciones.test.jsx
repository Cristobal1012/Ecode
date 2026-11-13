import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FormularioProducto from '../components/FormularioProducto';
import clienteAxios from '../components/auth/axiosConfig';

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../components/GaleriaImagenes', () => ({ default: () => <div /> }));

const producto = { id: 'colecciones', nombre: 'Obra', descripcion: 'Prueba', categoria: 'Arte',
  publicado: true, variantes: [{ sku: 'COL', precio: 10000, stock: 2 }] };

beforeEach(() => {
  vi.clearAllMocks();
  clienteAxios.get.mockImplementation(url => Promise.resolve({ data: url === 'catalogo/filtros/'
    ? { colecciones: ['Cyber', 'iPhone'] }
    : [producto, { ...producto, publicado: false, colecciones: ['Solo borrador'] },
      { ...producto, activo: false, colecciones: ['Solo inactivo'] },
      { ...producto, colecciones: ['Cyber', 'cyber', 'iphone'] }] }));
  clienteAxios.put.mockResolvedValue({ data: producto });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mostrar() {
  return render(<FormularioProducto productoAEditar={producto} alGuardar={vi.fn()} alCancelar={vi.fn()} />);
}

it('usa las opciones publicadas normalizadas por el dominio, conservando iPhone', async () => {
  mostrar();
  await waitFor(() => expect(clienteAxios.get).toHaveBeenCalledWith('catalogo/filtros/'));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Colecciones (Opcional)' }), { key: 'ArrowDown' });
  const lista = await screen.findByRole('listbox');
  expect(within(lista).getAllByRole('option')).toHaveLength(2);
  expect(screen.getByRole('option', { name: 'Cyber' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'iPhone' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'cyber' })).not.toBeInTheDocument();
  expect(screen.queryByText('Solo borrador')).not.toBeInTheDocument();
  expect(screen.queryByText('Solo inactivo')).not.toBeInTheDocument();
});

it('no extrae opciones del inventario si el servidor no tiene colecciones publicadas', async () => {
  clienteAxios.get.mockImplementation(url => Promise.resolve({ data: url === 'catalogo/filtros/'
    ? { colecciones: [] }
    : [{ ...producto, colecciones: ['Solo borrador'], publicado: false }] }));
  mostrar();
  await waitFor(() => expect(clienteAxios.get).toHaveBeenCalledWith('catalogo/filtros/'));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Colecciones (Opcional)' }), { key: 'ArrowDown' });
  expect(screen.queryByRole('option', { name: 'Solo borrador' })).not.toBeInTheDocument();
});

it('permite seleccionar una existente y crear una nueva sin duplicar variantes de nombre', async () => {
  const { container } = mostrar();
  const input = screen.getByRole('combobox', { name: 'Colecciones (Opcional)' });
  await waitFor(() => expect(clienteAxios.get).toHaveBeenCalledWith('catalogo/filtros/'));
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'iPhone' }));
  fireEvent.change(input, { target: { value: ' cyber ' } });
  expect(screen.queryByText('Crear colección " cyber "')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: 'Navidad' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Crear colección "Navidad"' }));
  fireEvent.submit(container.querySelector('form'));
  await waitFor(() => expect(clienteAxios.put).toHaveBeenCalledWith('catalogo/productos/colecciones/',
    expect.objectContaining({ colecciones: ['iPhone', 'Navidad'] })));
});

it('reconoce una colección ya seleccionada aunque su escritura difiera de la opción global', async () => {
  render(<FormularioProducto productoAEditar={{ ...producto, colecciones: ['cyber'] }}
    alGuardar={vi.fn()} alCancelar={vi.fn()} />);
  await waitFor(() => expect(clienteAxios.get).toHaveBeenCalledWith('catalogo/filtros/'));
  const input = screen.getByRole('combobox', { name: 'Colecciones (Opcional)' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(await screen.findByRole('option', { name: 'iPhone' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Cyber' })).not.toBeInTheDocument();
  expect(screen.getByText('cyber')).toBeInTheDocument();
});
