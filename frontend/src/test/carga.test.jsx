import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Bloque, Cargando } from '../components/carga/Esqueleto';
import Spinner from '../components/carga/Spinner';

describe('Piezas de carga', () => {
  afterEach(() => cleanup());

  it('el esqueleto anuncia su texto y oculta los bloques al lector de pantalla', () => {
    render(
      <Cargando texto="Cargando inventario...">
        <Bloque ancho="40%" />
        <Bloque alto="2rem" forma="boton" />
      </Cargando>
    );

    const estado = screen.getByRole('status');
    expect(estado).toHaveTextContent('Cargando inventario...');
    expect(estado).not.toHaveAttribute('aria-busy');
    const bloques = estado.querySelectorAll('.esqueleto');
    expect(bloques).toHaveLength(2);
    bloques.forEach((bloque) => expect(bloque.closest('[aria-hidden="true"]')).not.toBeNull());
  });

  it('un bloque toma su tamaño y su forma', () => {
    const { container } = render(<Bloque ancho="3rem" alto="3rem" forma="circulo" />);
    const bloque = container.querySelector('.esqueleto');
    expect(bloque).toHaveClass('esqueleto--circulo');
    expect(bloque).toHaveStyle({ width: '3rem', height: '3rem' });
    expect(bloque).toHaveAttribute('aria-hidden', 'true');
  });

  it('el spinner no cambia el nombre del botón', () => {
    render(<button type="submit" disabled><Spinner />Guardando...</button>);
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeInTheDocument();
  });
});
