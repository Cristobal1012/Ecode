import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: getMock } }));
vi.mock('../components/MenuUsuario', () => ({ default: () => null }));
vi.mock('../components/CarritoCompras', () => ({ default: () => null }));

const CONFIGURACION = { nombre_tienda: 'Taller Maché', nosotros_texto: 'Desde 2015 en Valparaíso.' };

function responder(configuracion) {
  getMock.mockImplementation((url) => Promise.resolve({ data: url === 'configuracion/' ? configuracion : [] }));
}

async function renderTienda() {
  // La configuración se guarda entre montajes: cada test parte con el módulo limpio
  vi.resetModules();
  const [{ default: Header }, { default: Footer }] = await Promise.all([
    import('../components/header/header'),
    import('../components/footer')
  ]);
  return render(<MemoryRouter><Header /><Footer /></MemoryRouter>);
}

const menu = () => screen.findByRole('navigation', { name: 'Navegación de la tienda' });
const columnaTienda = () => screen.findByRole('navigation', { name: 'Tienda' });

describe('Enlace al blog en el header y el footer', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => cleanup());

  it('con el blog activo, el enlace lleva a /blog con el nombre que eligió el admin', async () => {
    responder({ ...CONFIGURACION, blog_activo: true, blog_nombre: 'Portafolio' });
    await renderTienda();

    expect(await within(await menu()).findByRole('link', { name: 'Portafolio' })).toHaveAttribute('href', '/blog');
    expect(within(await menu()).queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
    expect(within(await columnaTienda()).getByRole('link', { name: 'Portafolio' })).toHaveAttribute('href', '/blog');
  });

  it('con el blog apagado, "Nosotros" sigue llevando a la sección de la landing', async () => {
    responder({ ...CONFIGURACION, blog_activo: false, blog_nombre: 'Portafolio' });
    await renderTienda();

    expect(await within(await menu()).findByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '/#nosotros');
    expect(screen.queryByRole('link', { name: 'Portafolio' })).not.toBeInTheDocument();
  });

  it('con el blog apagado y sin texto de Nosotros, no hay enlace', async () => {
    responder({ ...CONFIGURACION, nosotros_texto: '', blog_activo: false });
    await renderTienda();

    await within(await menu()).findByRole('link', { name: 'Catálogo' });
    expect(screen.queryByRole('link', { name: 'Nosotros' })).not.toBeInTheDocument();
  });

  it('el blog activo aparece aunque la landing no tenga texto de Nosotros', async () => {
    responder({ ...CONFIGURACION, nosotros_texto: '', blog_activo: true, blog_nombre: 'Nosotros' });
    await renderTienda();

    expect(await within(await menu()).findByRole('link', { name: 'Nosotros' })).toHaveAttribute('href', '/blog');
  });
});
