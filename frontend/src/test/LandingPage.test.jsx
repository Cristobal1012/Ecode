import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { getMock, patchMock } = vi.hoisted(() => ({ getMock: vi.fn(), patchMock: vi.fn() }));

vi.mock('../components/auth/axiosConfig', () => ({ default: { get: getMock, patch: patchMock } }));
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

describe('LandingPage en modo edición (RF-01.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    patchMock.mockResolvedValue({ data: {} });
    // jsdom no implementa las vistas previas de archivos
    URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => cleanup());

  async function entrarComoAdmin() {
    localStorage.setItem('rol', 'ADMIN');
    responder();
    await renderLanding();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar página' }));
  }

  it('solo el admin ve el botón para editar la página', async () => {
    localStorage.setItem('rol', 'COMPRADOR');
    responder();
    await renderLanding();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Editar página' })).not.toBeInTheDocument();
  });

  it('guarda solo los textos que cambiaron y avisa que están publicados', async () => {
    await entrarComoAdmin();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Arte para tus paredes' } });
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledWith(
      'configuracion/negocio/', { texto_bienvenida: 'Arte para tus paredes' }));
    expect(await screen.findByText(/Cambios guardados/)).toBeInTheDocument();
  });

  it('una imagen nueva viaja en multipart junto con los textos; quitar una imagen es un null', async () => {
    await entrarComoAdmin();
    const archivo = new File(['png'], 'portada.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Texto del botón'), { target: { value: 'Ver obras' } });
    fireEvent.change(screen.getByLabelText('Subir imagen de portada'), { target: { files: [archivo] } });
    fireEvent.change(screen.getByLabelText('Subir logo'), { target: { files: [archivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar logo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(2));
    const [, formulario, opciones] = patchMock.mock.calls[0];
    expect(formulario).toBeInstanceOf(FormData);
    expect(formulario.get('banner')).toBe(archivo);
    expect(formulario.get('texto_boton_ingreso')).toBe('Ver obras');
    // El navegador pone el multipart con su boundary (axios fija JSON por defecto)
    expect(opciones).toEqual({ headers: { 'Content-Type': undefined } });
    expect(patchMock.mock.calls[1]).toEqual(['configuracion/negocio/', { logo: null }]);
  });

  it('no guarda si un campo obligatorio queda vacío', async () => {
    await entrarComoAdmin();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findAllByText(/No puede quedar vacío/)).not.toHaveLength(0);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rechaza archivos que no son JPEG, PNG o WebP antes de enviarlos', async () => {
    await entrarComoAdmin();
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });

    fireEvent.change(screen.getByLabelText('Subir logo'), { target: { files: [svg] } });

    expect(await screen.findAllByText('Solo se admiten imágenes JPEG, PNG o WebP.')).not.toHaveLength(0);
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
  });

  it('descartar vuelve a los textos publicados', async () => {
    await entrarComoAdmin();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Otro título' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.getByLabelText('Título')).toHaveValue('Objetos con alma');
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
  });
});
