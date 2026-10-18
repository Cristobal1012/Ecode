import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: getMock } }));
vi.mock('../components/MenuUsuario', () => ({ default: () => null }));
vi.mock('../components/CarritoCompras', () => ({ default: () => null }));

const producto = (id, nombre, extra = {}) => ({
  id, nombre, categoria: 'Arte', imagenes: [],
  variantes: [{ sku: `${id}-1`, precio: 20000, stock: 3 }], ...extra,
});

const CONFIGURACION = {
  nombre_tienda: 'Taller Maché',
  subtitulo_bienvenida: 'Hecho a mano',
  texto_bienvenida: 'Objetos con alma',
  texto_landing: 'Piezas únicas de papel maché.',
  texto_boton_ingreso: 'Ver piezas',
  nosotros_titulo: 'Un taller familiar',
  nosotros_texto: 'Desde 2015 en Valparaíso.',
};

function responder({ configuracion = CONFIGURACION, vitrina } = {}) {
  getMock.mockImplementation((url) => {
    if (url === 'configuracion/') return Promise.resolve({ data: configuracion });
    if (url === 'catalogo/vitrina/') {
      return Promise.resolve({ data: vitrina || {
        mas_vendidos: [producto('a', 'Jarrón'), producto('b', 'Lámpara', {
          variantes: [{ sku: 'b-1', precio: 30000, precio_oferta: 25000, stock: 2 }] })],
        recientes: [producto('c', 'Móvil', { variantes: [{ sku: 'c-1', precio: 9000, stock: 0 }] })],
      } });
    }
    return Promise.resolve({ data: [] });
  });
}

async function renderLanding() {
  // La configuración se guarda entre montajes: cada test parte con el módulo limpio
  vi.resetModules();
  const { default: LandingPage } = await import('../pages/LandingPage');
  return render(<MemoryRouter><LandingPage /></MemoryRouter>);
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it('muestra los textos de la portada que edita el admin y el botón lleva al catálogo', async () => {
    responder();
    await renderLanding();

    expect(await screen.findByRole('heading', { level: 1, name: 'Objetos con alma' })).toBeInTheDocument();
    expect(screen.getByText('Hecho a mano')).toBeInTheDocument();
    expect(screen.getByText('Piezas únicas de papel maché.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver piezas/i })).toHaveAttribute('href', '/catalogo');
  });

  it('muestra los más vendidos y los últimos agregados con precio, oferta y agotado', async () => {
    responder();
    await renderLanding();

    const vendidos = await screen.findByRole('region', { name: 'Más vendidos' });
    expect(within(vendidos).getByRole('link', { name: /jarrón/i })).toHaveAttribute('href', '/catalogo/producto/a');
    expect(within(vendidos).getByText('$25.000')).toBeInTheDocument();
    expect(within(vendidos).getByText('$30.000')).toBeInTheDocument();

    const recientes = screen.getByRole('region', { name: 'Últimos agregados' });
    expect(within(recientes).getByText('Agotado')).toBeInTheDocument();
  });

  it('muestra la sección Nosotros solo si tiene texto', async () => {
    responder();
    await renderLanding();
    expect(await screen.findByRole('region', { name: 'Un taller familiar' })).toBeInTheDocument();

    cleanup();
    responder({ configuracion: { ...CONFIGURACION, nosotros_texto: '' } });
    await renderLanding();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Un taller familiar' })).not.toBeInTheDocument();
  });

  it('sin productos no muestra las secciones de productos', async () => {
    responder({ vitrina: { mas_vendidos: [], recientes: [] } });
    await renderLanding();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Más vendidos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Últimos agregados' })).not.toBeInTheDocument();
  });

  it('el header muestra el logo de la Universidad junto al nombre del negocio (RN-01)', async () => {
    responder();
    await renderLanding();

    expect(await screen.findByText('Taller Maché')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Logo de la Universidad Autónoma' })).toBeInTheDocument();
  });
});
