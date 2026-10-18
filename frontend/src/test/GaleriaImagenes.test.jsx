import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../components/auth/axiosConfig', () => ({ default: { post: vi.fn(), delete: vi.fn() } }));

import GaleriaImagenes from '../components/GaleriaImagenes';

const png = (nombre = 'foto.png', tipo = 'image/png') => new File(['png'], nombre, { type: tipo });

function renderGaleria() {
  return render(
    <GaleriaImagenes productoId="p1" imagenes={[]} archivosGestionados={[]}
      onImagenesChange={vi.fn()} onArchivosChange={vi.fn()} />
  );
}

describe('GaleriaImagenes (RF-03.2)', () => {
  beforeEach(() => {
    // jsdom no implementa las vistas previas de archivos
    URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  });

  afterEach(() => cleanup());

  it('un clic en la zona abre el selector de archivos una sola vez', () => {
    renderGaleria();
    const input = screen.getByLabelText('Seleccionar imágenes para la galería');
    const clics = vi.fn();
    input.addEventListener('click', (e) => {
      clics();
      // Sin esto, jsdom intentaría abrir el selector
      e.preventDefault();
    });

    fireEvent.click(screen.getByText('Arrastra tus imágenes aquí'));

    // Antes el input estaba dentro de la zona y su clic volvía a ella: el selector se abría en bucle
    expect(clics).toHaveBeenCalledTimes(1);
  });

  it('el selector es un campo de archivos que acepta solo JPEG, PNG y WebP', () => {
    renderGaleria();
    const input = screen.getByLabelText('Seleccionar imágenes para la galería');

    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveAccessibleDescription('Formatos permitidos: JPG, PNG y WebP');
  });

  it('las imágenes elegidas o arrastradas quedan listas para subir y se descartan las de otro formato', () => {
    renderGaleria();

    fireEvent.change(screen.getByLabelText('Seleccionar imágenes para la galería'),
      { target: { files: [png('uno.png'), png('nota.gif', 'image/gif')] } });
    fireEvent.drop(screen.getByText('Arrastra tus imágenes aquí'),
      { dataTransfer: { files: [png('dos.webp', 'image/webp')] } });

    expect(screen.getByRole('img', { name: 'uno.png' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'dos.webp' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'nota.gif' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir imágenes' })).toBeInTheDocument();
  });
});
