import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { getMock, validarMock, guardarMock, headerMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  validarMock: vi.fn(),
  guardarMock: vi.fn(),
  headerMock: vi.fn(),
}));

vi.mock('../components/auth/axiosConfig', () => ({
  default: {
    get: getMock,
  },
}));

vi.mock('../components/header/header', () => ({
  default: () => <header>Header de prueba</header>,
}));

vi.mock('../components/carrito', () => ({
  validarCarrito: validarMock,
  guardarCarrito: guardarMock,
}));

vi.mock('../utils/precios', () => ({
  obtenerDatosPrecioYStock: vi.fn((variantes) => {
    const disponibles = (variantes || []).filter(
      (variante) => Number(variante.stock) > 0,
    );

    if (disponibles.length === 0) {
      return {
        agotado: true,
        textoPrecio: '',
        precioTachado: '',
        tieneOferta: false,
      };
    }

    const precios = disponibles.map((variante) =>
      Number(
        variante.precio_oferta > 0 &&
          Number(variante.precio_oferta) < Number(variante.precio)
          ? variante.precio_oferta
          : variante.precio,
      ),
    );

    return {
      agotado: false,
      textoPrecio: `$${Math.min(...precios).toLocaleString('es-CL')}`,
      precioTachado: '',
      tieneOferta: false,
    };
  }),
}));

// El selector real se prueba en sus propios tests.
// Aquí simulamos su integración con DetalleProducto.
vi.mock('../components/VariantSelector', () => ({
  default: ({ producto, onAgregarAlCarrito }) => (
    <div data-testid="selector-variantes">
      <span>Selector de {producto.nombre}</span>
      <button
        type="button"
        onClick={async () => {
          const resultado = await onAgregarAlCarrito(
            producto.variantes[0],
            1,
          );
          headerMock(resultado);
        }}
      >
        Probar agregar al carrito
      </button>
    </div>
  ),
}));

import DetalleProducto from '../pages/DetalleProducto';

const productoEjemplo = {
  id: 'producto-1',
  nombre: 'Polera Ecode',
  categoria: 'Ropa',
  descripcion: 'Polera de algodón',
  imagenes: ['/polera-1.jpg', '/polera-2.jpg', '/polera-3.jpg'],
  atributos_globales: {
    material: 'Algodón',
    origen: 'Chile',
  },
  meta_titulo: 'Polera Ecode SEO',
  meta_descripcion: 'Descripción SEO de la polera',
  variantes: [
    {
      sku: 'POL-001',
      precio: 15000,
      precio_oferta: 12000,
      stock: 5,
      atributos_variables: { talla: 'M' },
    },
  ],
};

function renderDetalle(id = 'producto-1') {
  return render(
    <MemoryRouter initialEntries={[`/producto/${id}`]}>
      <Routes>
        <Route path="/producto/:id" element={<DetalleProducto />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DetalleProducto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    getMock.mockResolvedValue({
      data: structuredClone(productoEjemplo),
    });

    validarMock.mockResolvedValue({
      items: [
        {
          disponible: 4,
          problema: false,
          precio: 12000,
        },
      ],
    });

    guardarMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    document.title = '';
    document
      .querySelector('meta[name="description"]')
      ?.remove();
  });

  it('muestra el estado de carga inicialmente', () => {
    getMock.mockReturnValue(new Promise(() => {}));

    renderDetalle();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Cargando producto...',
    );
  });

  it('solicita el producto usando el id de la URL', async () => {
    renderDetalle('producto-25');

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    expect(getMock).toHaveBeenCalledWith(
      'catalogo/productos/producto-25/',
    );
  });

  it('muestra el nombre, categoría y descripción', async () => {
    renderDetalle();

    expect(
      await screen.findByRole('heading', { name: 'Polera Ecode' }),
    ).toBeInTheDocument();

    // "Ropa" aparece en la navegación y en la categoría.
    expect(screen.getAllByText('Ropa')).toHaveLength(2);
    expect(screen.getByText('Polera de algodón')).toBeInTheDocument();
  });

  it('muestra un enlace para volver al catálogo si falla la petición', async () => {
    getMock.mockRejectedValue(new Error('Error de red'));

    renderDetalle();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo encontrar el producto.',
    );

    expect(
      screen.getByRole('link', { name: /volver al catálogo/i }),
    ).toHaveAttribute('href', '/catalogo');
  });

  it('actualiza el título y la descripción SEO', async () => {
    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    await waitFor(() => {
      expect(document.title).toBe('Polera Ecode SEO');
      expect(
        document.querySelector('meta[name="description"]')?.content,
      ).toBe('Descripción SEO de la polera');
    });
  });

  it('usa el nombre y descripción del producto si no hay metadatos SEO', async () => {
    getMock.mockResolvedValue({
      data: {
        ...structuredClone(productoEjemplo),
        meta_titulo: ' ',
        meta_descripcion: '',
      },
    });

    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    await waitFor(() => {
      expect(document.title).toBe('Polera Ecode');
      expect(
        document.querySelector('meta[name="description"]')?.content,
      ).toBe('Polera de algodón');
    });
  });

  it('muestra la imagen principal y las miniaturas', async () => {
    renderDetalle();

    const imagen = await screen.findByRole('img', {
      name: 'Polera Ecode, imagen 1 de 3',
    });

    expect(imagen).toHaveAttribute('src', '/polera-1.jpg');

    expect(
      screen.getByRole('button', { name: 'Ver imagen 2' }),
    ).toBeInTheDocument();
  });

  it('avanza a la siguiente imagen', async () => {
    renderDetalle();

    await screen.findByRole('img', {
      name: 'Polera Ecode, imagen 1 de 3',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Imagen siguiente' }));

    expect(
      screen.getByRole('img', { name: 'Polera Ecode, imagen 2 de 3' }),
    ).toHaveAttribute('src', '/polera-2.jpg');
  });

  it('vuelve a la última imagen al retroceder desde la primera', async () => {
    renderDetalle();

    await screen.findByRole('img', {
      name: 'Polera Ecode, imagen 1 de 3',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Imagen anterior' }));

    expect(
      screen.getByRole('img', { name: 'Polera Ecode, imagen 3 de 3' }),
    ).toHaveAttribute('src', '/polera-3.jpg');
  });

  it('permite seleccionar una imagen mediante su miniatura', async () => {
    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen 2' }));

    expect(
      screen.getByRole('img', { name: 'Polera Ecode, imagen 2 de 3' }),
    ).toHaveAttribute('src', '/polera-2.jpg');

    expect(
      screen.getByRole('button', { name: 'Ver imagen 2' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('muestra una alternativa cuando el producto no tiene imágenes', async () => {
    getMock.mockResolvedValue({
      data: {
        ...structuredClone(productoEjemplo),
        imagenes: [],
      },
    });

    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    expect(screen.getByText('Sin imagen disponible')).toBeInTheDocument();
  });

  it('muestra los atributos globales de la ficha técnica', async () => {
    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    expect(screen.getByText('material')).toBeInTheDocument();
    expect(screen.getByText('Algodón')).toBeInTheDocument();
    expect(screen.getByText('Chile')).toBeInTheDocument();
  });

  it('muestra el selector de variantes del producto', async () => {
    renderDetalle();

    expect(
      await screen.findByTestId('selector-variantes'),
    ).toHaveTextContent('Selector de Polera Ecode');
  });

  it('muestra un precio para un producto con stock', async () => {
    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    expect(screen.getByText('$12.000')).toBeInTheDocument();
  });

  it('muestra el estado sin stock cuando todas las variantes están agotadas', async () => {
    getMock.mockResolvedValue({
      data: {
        ...structuredClone(productoEjemplo),
        variantes: [
          {
            ...productoEjemplo.variantes[0],
            stock: 0,
          },
        ],
      },
    });

    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    expect(screen.getByText('Sin stock')).toBeInTheDocument();
  });

  it('agrega al carrito cuando la validación de stock es correcta', async () => {
    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Probar agregar al carrito' }),
    );

    await waitFor(() => {
      expect(validarMock).toHaveBeenCalledTimes(1);
      expect(guardarMock).toHaveBeenCalledTimes(1);
    });

    expect(guardarMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'producto-1',
        sku: 'POL-001',
        cantidad: 1,
        precio: 12000,
      }),
    ]);

    expect(headerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        mensaje: expect.stringContaining('Agregaste 1'),
      }),
    );
  });

  it('muestra un error cuando falla la validación del stock', async () => {
    validarMock.mockRejectedValue(new Error('Sin conexión'));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderDetalle();

    await screen.findByRole('heading', { name: 'Polera Ecode' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Probar agregar al carrito' }),
    );

    await waitFor(() => {
      expect(headerMock).toHaveBeenCalledWith({
        ok: false,
        mensaje: 'No pudimos verificar el stock. Intenta nuevamente.',
      });
    });

    expect(guardarMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
