import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Portada from '../components/landing/Portada';

const configuracion = (activo = true) => ({
  nombre_tienda: 'Tienda', video_banner_activo: activo,
  banners: [
    { id: 1, imagen: '/portada.jpg', video: '/presentacion.mp4', titulo: 'Video', destino: 'CATALOGO' },
    { id: 2, imagen: '/foto.jpg', titulo: 'Foto', destino: 'CATALOGO' },
  ],
});

const mostrar = (activo) => render(<MemoryRouter><Portada configuracion={configuracion(activo)} /></MemoryRouter>);

const simularVideo = () => { const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  return { play, pause };
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Video opcional de la portada', () => {
  it('no descarga ni crea el elemento de video cuando está desactivado', () => {
    const { container } = mostrar(false);
    expect(container.querySelector('video')).toBeNull();
  });

  it('incluye video silenciado, en bucle y sin controles cuando está activo', () => {
    const { container } = mostrar(true);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.controls).toBe(false);
  });

  it('el botón de pausa alterna entre pausar y reanudar el carrusel', () => {
    mostrar(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar carrusel' }));
    expect(screen.getByRole('button', { name: 'Reanudar carrusel' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar carrusel' }));
    expect(screen.getByRole('button', { name: 'Pausar carrusel' })).toBeTruthy();
  });

  it('respeta la preferencia de movimiento reducido', () => {
    const { play } = simularVideo();

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    const { container } = mostrar(true);

    expect(container.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('no carga ni reproduce videos cuando está activado el ahorro de datos', () => {
    const { play } = simularVideo();

    vi.stubGlobal('navigator', Object.create(navigator, {
      connection: {
        value: { saveData: true },
        configurable: true,
      },
    }));

    const { container } = mostrar(true);

    expect(container.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('ejecuta video.pause() al pausar el carrusel', () => {
    const { play, pause } = simularVideo();

    const { container } = mostrar(true);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(play).toHaveBeenCalled();

    pause.mockClear();

    fireEvent.click(
      screen.getByRole('button', { name: 'Pausar carrusel' })
    );

    expect(pause).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Reanudar carrusel' })
    ).toBeInTheDocument();
  });
});
