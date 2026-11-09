import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
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

function LandingConFooter({ LandingPage, Footer }) {
  const [marcaTemporal, setMarcaTemporal] = useState(null);

  return (
    <MemoryRouter>
      <LandingPage onMarcaTemporal={setMarcaTemporal} />
      <Footer marcaTemporal={marcaTemporal} />
    </MemoryRouter>
  );
}

async function renderLandingConFooter() {
  vi.resetModules();

  const [{ default: LandingPage }, { default: Footer }] = await Promise.all([
    import('../pages/LandingPage'),
    import('../components/footer')
  ]);

  return render(
    <LandingConFooter LandingPage={LandingPage} Footer={Footer} />
  );
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

  it('muestra la sección de Instagram solo con usuario, con sus fotos y el botón al perfil', async () => {
    responder({ configuracion: { ...CONFIGURACION, instagram_usuario: 'taller.mache',
      instagram_foto_1: 'http://localhost:8000/media/negocio/instagram/uno.jpg', instagram_foto_2: null } });
    const { container } = await renderLanding();

    const seccion = await screen.findByRole('region', { name: '@taller.mache' });
    const boton = within(seccion).getByRole('link', { name: /Seguir en Instagram/ });
    expect(boton).toHaveAttribute('href', 'https://www.instagram.com/taller.mache/');
    expect(boton).toHaveAttribute('rel', 'noopener noreferrer');
    // Solo las fotos cargadas, fuera del árbol accesible: el enlace accesible es el botón
    const fotos = container.querySelectorAll('#instagram img');
    expect(fotos).toHaveLength(1);
    expect(fotos[0].closest('[aria-hidden="true"]')).not.toBeNull();

    cleanup();
    responder();
    await renderLanding();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: /Instagram|@/ })).not.toBeInTheDocument();
  });

  it('sin productos no muestra las secciones de productos', async () => {
    responder({ vitrina: { mas_vendidos: [], recientes: [] } });
    await renderLanding();

    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Más vendidos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Últimos agregados' })).not.toBeInTheDocument();
  });

  it('muestra los destacados elegidos en lugar de "Más vendidos", con su enlace y el precio de los productos', async () => {
    responder({
      configuracion: { ...CONFIGURACION, vitrina_modo: 'DESTACADOS', blog_activo: true, blog_nombre: 'Portafolio' },
      vitrina: {
        mas_vendidos: [], recientes: [producto('c', 'Móvil')], destacados_titulo: 'Obras elegidas',
        destacados: [
          { tipo: 'PUBLICACION', id: '7', nombre: 'Mural en Cerro Alegre', imagen: 'http://localhost/mural.jpg',
            enlace: '/blog/mural-cerro-alegre' },
          { tipo: 'PRODUCTO', id: 'a', nombre: 'Retrato', categoria: 'Óleos', imagen: null, enlace: '/catalogo/producto/a',
            variantes: [{ sku: 'a-1', precio: 30000, precio_oferta: 25000, stock: 1 }] },
        ],
      },
    });
    const { container } = await renderLanding();

    const seccion = await screen.findByRole('region', { name: 'Obras elegidas' });
    expect(screen.queryByRole('region', { name: 'Más vendidos' })).not.toBeInTheDocument();
    const tarjetas = within(seccion).getAllByRole('listitem');
    expect(tarjetas).toHaveLength(2);
    // En el orden que eligió el admin, cada una lleva a la publicación o a la ficha del producto
    expect(within(tarjetas[0]).getByRole('link', { name: /Mural en Cerro Alegre/ }))
      .toHaveAttribute('href', '/blog/mural-cerro-alegre');
    expect(within(tarjetas[0]).getByText('Portafolio')).toBeInTheDocument();
    expect(within(tarjetas[1]).getByRole('link', { name: /Retrato/ })).toHaveAttribute('href', '/catalogo/producto/a');
    expect(within(tarjetas[1]).getByText('Óleos')).toBeInTheDocument();
    expect(within(tarjetas[1]).getByText('$25.000')).toBeInTheDocument();
    expect(within(tarjetas[1]).getByText('$30.000')).toBeInTheDocument();
    // La foto es decorativa (el nombre está en la tarjeta) y reserva su lugar
    const foto = container.querySelector('#destacados img');
    expect(foto).toHaveAttribute('alt', '');
    expect(foto).toHaveAttribute('loading', 'lazy');
    // "Últimos agregados" no cambia
    expect(screen.getByRole('region', { name: 'Últimos agregados' })).toBeInTheDocument();
  });

  it('si no queda ningún destacado visible muestra "Más vendidos", para que la landing no quede con un hueco', async () => {
    responder({ configuracion: { ...CONFIGURACION, vitrina_modo: 'DESTACADOS', destacados_titulo: 'Obras' } });
    await renderLanding();

    expect(await screen.findByRole('region', { name: 'Más vendidos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Obras' })).not.toBeInTheDocument();
  });

  it('mientras llega la vitrina usa el título guardado de los destacados', async () => {
    responder({ configuracion: { ...CONFIGURACION, vitrina_modo: 'DESTACADOS', destacados_titulo: 'Obras' } });
    const respuesta = getMock.getMockImplementation();
    getMock.mockImplementation((url) => (url === 'catalogo/vitrina/' ? new Promise(() => {}) : respuesta(url)));
    await renderLanding();

    const seccion = await screen.findByRole('region', { name: 'Obras' });
    expect(within(seccion).getByText('Cargando destacados...')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Más vendidos' })).not.toBeInTheDocument();
  });

  it('el header muestra el logo de la Universidad junto al nombre del negocio (RN-01)', async () => {
    responder();
    await renderLanding();

    expect(await screen.findByText('Taller Maché')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Logo de la Universidad Autónoma' })).toBeInTheDocument();
  });

  it('con el logo en el footer se ve ahí más grande y el header queda con el de la tienda (RN-01)', async () => {
    responder({ configuracion: { ...CONFIGURACION, ubicacion_logo_universidad: 'FOOTER' } });
    await renderLandingConFooter();

    const footer = await screen.findByRole('contentinfo');
    await waitFor(() => expect(within(footer).getByRole('img', { name: 'Logo de la Universidad Autónoma' }))
      .toHaveClass('footer-logo-universidad'));
    expect(within(footer).getByText('Taller Maché')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('img', { name: 'Logo de la Universidad Autónoma' }))
      .not.toBeInTheDocument();
    // Nunca desaparece: está en un solo lugar
    expect(screen.getAllByRole('img', { name: 'Logo de la Universidad Autónoma' })).toHaveLength(1);
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

  it('actualiza el nombre y el copyright del footer al editar y los restaura al descartar', 
  async () => {
    localStorage.setItem('rol', 'ADMIN');
    responder();

    await renderLandingConFooter();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar página' }));

    const footer = await screen.findByRole('contentinfo');
    const campoNombre = screen.getByLabelText('Nombre de la tienda');
    const anio = new Date().getFullYear();

    fireEvent.change(campoNombre, {
      target: { value: 'Mi nueva tienda' }
    });

    await waitFor(() => {
      expect(footer).toHaveTextContent('Mi nueva tienda');
      expect(footer).toHaveTextContent(
        `© ${anio} Mi nueva tienda. Todos los derechos reservados.`
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    await waitFor(() => {
      expect(footer).toHaveTextContent('Taller Maché');
      expect(footer).toHaveTextContent(
        `© ${anio} Taller Maché. Todos los derechos reservados.`
      );
    });
  });

  async function entrarComoAdmin() {
    localStorage.setItem('rol', 'ADMIN');
    responder();
    await renderLanding();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar página' }));
  }

  it('el admin elige dónde va el logo de la Universidad, lo ve antes de guardar y se publica (RN-01)', async () => {
    localStorage.setItem('rol', 'ADMIN');
    responder();
    await renderLandingConFooter();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar página' }));

    const ubicacion = screen.getByLabelText('Logo de la Universidad');
    expect(ubicacion).toHaveValue('HEADER');
    // Solo dos lugares: no existe una opción para ocultarlo
    expect([...ubicacion.options].map(opcion => opcion.value)).toEqual(['HEADER', 'FOOTER']);

    fireEvent.change(ubicacion, { target: { value: 'FOOTER' } });
    const footer = screen.getByRole('contentinfo');
    await waitFor(() => expect(within(footer).getByRole('img', { name: 'Logo de la Universidad Autónoma' })).toBeInTheDocument());
    expect(within(screen.getByRole('banner')).queryByRole('img', { name: 'Logo de la Universidad Autónoma' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('configuracion/negocio/', { ubicacion_logo_universidad: 'FOOTER' }));
  });

  it('si la configuración no carga no deja editar: el borrador partiría vacío y pisaría la tienda', async () => {
    // Pasó con una migración sin aplicar: el servidor respondía 500 y el editor abría con todo vacío
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('rol', 'ADMIN');
    getMock.mockImplementation((url) => (url === 'configuracion/'
      ? Promise.reject({ response: { status: 500 } })
      : Promise.resolve({ data: [] })));
    await renderLanding();

    expect(await screen.findByRole('alert')).toHaveTextContent('no se puede editar la página');
    expect(screen.queryByRole('button', { name: 'Editar página' })).not.toBeInTheDocument();
    errorConsola.mockRestore();
  });

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

  it('las fotos de Instagram se suben desde el modo edición en el mismo multipart', async () => {
    await entrarComoAdmin();
    const archivo = new File(['png'], 'instagram.png', { type: 'image/png' });

    // Sin usuario la sección igual aparece en modo edición, con el aviso de dónde configurarlo
    expect(screen.getByText(/Configuración > Contacto y Redes/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subir foto 3'), { target: { files: [archivo] } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    expect(patchMock.mock.calls[0][1].get('instagram_foto_3')).toBe(archivo);
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

describe('LandingPage: el admin elige los destacados de la vitrina (RF-01.1)', () => {
  const PRODUCTOS_PANEL = [
    { id: 'p1', nombre: 'Retrato', publicado: true, imagenes: ['http://localhost/retrato.jpg'],
      variantes: [{ sku: 'p1-1', precio: 30000, stock: 1 }] },
    { id: 'p2', nombre: 'Boceto', publicado: false, imagenes: [], variantes: [] },
    { id: 'p3', nombre: 'Mural chico', publicado: true, imagenes: [], variantes: [{ sku: 'p3-1', precio: 9000, stock: 2 }] },
  ];
  const PUBLICACIONES_PANEL = [
    { id: 7, titulo: 'Mural en Cerro Alegre', slug: 'mural-cerro-alegre', estado: 'PUBLICADA', portada: null },
    { id: 8, titulo: 'Idea', slug: 'idea', estado: 'BORRADOR', portada: null },
    { id: 9, titulo: 'Taller abierto', slug: 'taller-abierto', estado: 'PUBLICADA', portada: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    patchMock.mockResolvedValue({ data: {} });
  });

  afterEach(() => cleanup());

  async function editarVitrina(configuracion = {}) {
    localStorage.setItem('rol', 'ADMIN');
    responder({ configuracion: { ...CONFIGURACION, blog_activo: true, blog_nombre: 'Portafolio', ...configuracion } });
    const respuesta = getMock.getMockImplementation();
    getMock.mockImplementation((url) => {
      if (url === 'catalogo/productos/?todos=true') return Promise.resolve({ data: PRODUCTOS_PANEL });
      if (url === 'ventas/admin/blog/') return Promise.resolve({ data: PUBLICACIONES_PANEL });
      return respuesta(url);
    });
    await renderLanding();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar página' }));
  }

  function agregar(nombre) {
    const opcion = screen.getByRole('option', { name: nombre });
    fireEvent.change(screen.getByLabelText('Agregar un producto o una publicación'), { target: { value: opcion.value } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  }

  const nombresElegidos = () => within(screen.getByRole('list', { name: /Tus destacados/ }))
    .getAllByRole('listitem').map((fila) => within(fila).getByText((_, el) => el.tagName === 'STRONG').textContent);

  it('por defecto la vitrina sigue en "Más vendidos" y no pide los productos ni las publicaciones', async () => {
    await editarVitrina();

    expect(screen.getByRole('radio', { name: /Más vendidos/ })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Más vendidos' })).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalledWith('ventas/admin/blog/');
  });

  it('elige "Destacados", agrega hasta 4 productos y publicaciones, cambia el título y lo guarda', async () => {
    await editarVitrina();

    fireEvent.click(screen.getByRole('radio', { name: /Destacados/ }));
    expect(await screen.findByText('Tus destacados (0 de 4)')).toBeInTheDocument();
    // Solo se ofrecen los publicados
    expect(screen.queryByRole('option', { name: 'Boceto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Idea' })).not.toBeInTheDocument();

    ['Retrato', 'Mural en Cerro Alegre', 'Mural chico', 'Taller abierto'].forEach(agregar);
    expect(nombresElegidos()).toEqual(['Retrato', 'Mural en Cerro Alegre', 'Mural chico', 'Taller abierto']);
    expect(screen.getByLabelText('Agregar un producto o una publicación')).toBeDisabled();
    expect(screen.getByText(/Ya elegiste 4: quita uno para agregar otro/)).toBeInTheDocument();
    expect(screen.getByText('Taller abierto agregado a los destacados: 4 de 4.')).toHaveAttribute('role', 'status');

    fireEvent.change(screen.getByLabelText('Título de la sección'), { target: { value: 'Obras elegidas' } });
    // La vista previa ya muestra las 4 tarjetas con el título nuevo
    const seccion = screen.getByRole('region', { name: 'Obras elegidas' });
    expect(within(seccion).getByRole('link', { name: /Mural en Cerro Alegre/ }))
      .toHaveAttribute('href', '/blog/mural-cerro-alegre');
    expect(screen.queryByRole('region', { name: 'Más vendidos' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('configuracion/negocio/', {
      vitrina_modo: 'DESTACADOS',
      destacados_titulo: 'Obras elegidas',
      destacados: [{ tipo: 'PRODUCTO', id: 'p1' }, { tipo: 'PUBLICACION', id: '7' }, { tipo: 'PRODUCTO', id: 'p3' },
        { tipo: 'PUBLICACION', id: '9' }],
    }));
  });

  it('ordena con Subir y Bajar sin perder el foco, quita y guarda el nuevo orden', async () => {
    await editarVitrina({ vitrina_modo: 'DESTACADOS', destacados: [
      { tipo: 'PRODUCTO', id: 'p1' }, { tipo: 'PUBLICACION', id: '7' }, { tipo: 'PRODUCTO', id: 'p3' }] });
    await screen.findByText('Tus destacados (3 de 4)');

    fireEvent.click(screen.getByRole('button', { name: 'Bajar Retrato' }));
    expect(nombresElegidos()).toEqual(['Mural en Cerro Alegre', 'Retrato', 'Mural chico']);
    expect(screen.getByText('Retrato: posición 2 de 3.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bajar Retrato' })).toHaveFocus());

    // Al llegar al final, "Bajar" se desactiva y el foco pasa a "Subir"
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Retrato' }));
    expect(screen.getByRole('button', { name: 'Bajar Retrato' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Subir Retrato' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Mural en Cerro Alegre' }));
    expect(nombresElegidos()).toEqual(['Mural chico', 'Retrato']);
    await waitFor(() => expect(screen.getByLabelText('Agregar un producto o una publicación')).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('configuracion/negocio/', {
      destacados: [{ tipo: 'PRODUCTO', id: 'p3' }, { tipo: 'PRODUCTO', id: 'p1' }],
    }));
  });

  it('avisa cuáles no se verán y que, sin ninguno visible, la página muestra "Más vendidos"', async () => {
    await editarVitrina({ vitrina_modo: 'DESTACADOS', blog_activo: false, destacados: [
      { tipo: 'PRODUCTO', id: 'p2' }, { tipo: 'PUBLICACION', id: '7' }, { tipo: 'PRODUCTO', id: 'borrado' }] });

    expect(await screen.findByText('Sin publicar: no se mostrará.')).toBeInTheDocument();
    expect(screen.getByText('El blog está apagado: no se mostrará.')).toBeInTheDocument();
    expect(screen.getByText('Ya no existe: quítalo de la lista.')).toBeInTheDocument();
    expect(screen.getByText(/la página muestra «Más vendidos»/)).toBeInTheDocument();
    expect(screen.getByText(/no se mostrarán mientras el blog esté apagado/)).toBeInTheDocument();
    expect(document.querySelector('#destacados .grilla-destacados')).toBeNull();
  });

  it('descartar vuelve a la selección publicada', async () => {
    await editarVitrina({ vitrina_modo: 'DESTACADOS', destacados: [{ tipo: 'PRODUCTO', id: 'p1' }] });
    await screen.findByText('Tus destacados (1 de 4)');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Retrato' }));
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(nombresElegidos()).toEqual(['Retrato']);
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
  });

  it('muestra el error del backend junto a la selección', async () => {
    await editarVitrina({ vitrina_modo: 'DESTACADOS', destacados: [{ tipo: 'PRODUCTO', id: 'p1' }] });
    await screen.findByText('Tus destacados (1 de 4)');
    patchMock.mockRejectedValue({ response: { data: { destacados: ['Uno de los destacados ya no existe.'] } } });

    agregar('Mural chico');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // La barra lo anuncia y el editor lo deja a la vista junto a la selección
    expect(await screen.findByRole('alert')).toHaveTextContent('Uno de los destacados ya no existe.');
    expect(document.querySelector('.editor-destacados-error')).toHaveTextContent('Uno de los destacados ya no existe.');
  });
});

