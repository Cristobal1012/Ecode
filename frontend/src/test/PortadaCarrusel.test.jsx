import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Portada from '../components/landing/Portada';

// SCRUM-194: cada foto del carrusel con sus textos y un botón hacia una página del header
const FOTOS = [
  { id: 1, imagen: '/media/a.webp', orden: 0, antetitulo: 'Hecho a mano', titulo: 'Murales', texto: 'Para tu casa',
    destino: 'CATALOGO' },
  { id: 2, imagen: '/media/b.webp', orden: 1, antetitulo: '', titulo: 'Encargos', texto: '', destino: 'COTIZAR' },
];

const portada = (configuracion) => render(
  <MemoryRouter><Portada configuracion={{ texto_bienvenida: 'Bienvenidos', ...configuracion }} /></MemoryRouter>,
);
const pasar = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const titulo = () => screen.getByRole('heading', { level: 1 }).textContent;
const contenido = () => screen.getByRole('heading', { level: 1 }).parentElement;

describe('Portada con textos y botón por foto', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('cada foto muestra sus textos y su botón cuando le toca', () => {
    portada({ banners: FOTOS, cotizaciones_activas: true });
    expect(titulo()).toBe('Murales');
    expect(screen.getByText('Hecho a mano')).toBeInTheDocument();
    expect(screen.getByText('Para tu casa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalogo');

    pasar(5000);
    expect(titulo()).toBe('Encargos');
    expect(screen.queryByText('Hecho a mano')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver cotizar' })).toHaveAttribute('href', '/cotizar');
  });

  it('el botón toma el nombre de la página en el menú', () => {
    portada({
      banners: [{ ...FOTOS[0], destino: 'BLOG' }, FOTOS[0]], blog_activo: true, blog_nombre: 'Proyectos',
      menu_principal: { nombres: { catalogo: 'Productos' } },
    });
    expect(screen.getByRole('link', { name: 'Ver proyectos' })).toHaveAttribute('href', '/blog');
    pasar(5000);
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/catalogo');
  });

  it('si el módulo del destino está apagado, la foto muestra sus textos sin botón', () => {
    portada({ banners: [{ ...FOTOS[1], destino: 'COTIZAR' }, { ...FOTOS[0], destino: 'BLOG' }] });
    expect(titulo()).toBe('Encargos');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    pasar(5000);
    expect(titulo()).toBe('Murales');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('se detiene mientras el mouse está sobre los textos o el botón', () => {
    portada({ banners: FOTOS });
    fireEvent.mouseEnter(contenido());
    pasar(15000);
    expect(titulo()).toBe('Murales');
    fireEvent.mouseLeave(contenido());
    pasar(5000);
    expect(titulo()).toBe('Encargos');
  });

  it('se detiene mientras el foco está en el botón', () => {
    portada({ banners: FOTOS });
    const enlace = screen.getByRole('link', { name: 'Ver catálogo' });
    act(() => { enlace.focus(); });
    pasar(15000);
    expect(titulo()).toBe('Murales');
    expect(enlace).toHaveFocus();
    act(() => { enlace.blur(); });
    pasar(5000);
    expect(titulo()).toBe('Encargos');
  });

  it('sin fotos propias, la portada usa los textos generales y el botón al catálogo, como antes', () => {
    portada({ subtitulo_bienvenida: 'Hola', texto_landing: 'Texto de la portada' });
    expect(titulo()).toBe('Bienvenidos');
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', '/catalogo');
  });

  it('con una sola foto la portada queda fija y sin botón de pausa', () => {
    portada({ banners: [FOTOS[1]], cotizaciones_activas: true });
    pasar(20000);
    expect(titulo()).toBe('Encargos');
    expect(screen.queryByRole('button', { name: /pausar carrusel/i })).not.toBeInTheDocument();
  });
});
