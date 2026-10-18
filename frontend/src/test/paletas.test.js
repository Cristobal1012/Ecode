import { describe, it, expect } from 'vitest';
import {
  obtenerIdTema,
  TEMA_PREDETERMINADO,
  PALETAS,
} from '../theme/paletas.js';

describe('obtenerIdTema', () => {
  it.each(['1', '2', '3', '4'])(
    'convierte el valor "%s" a número',
    (valor) => {
      expect(obtenerIdTema(valor)).toBe(Number(valor));
    },
  );

  it.each(['0', '5', 'abc', '', '1.5', '-1'])(
    'rechaza el valor "%s"',
    (valor) => {
      expect(obtenerIdTema(valor)).toBeNull();
    },
  );

  it('acepta los identificadores numéricos válidos', () => {
    expect(obtenerIdTema(1)).toBe(1);
    expect(obtenerIdTema(4)).toBe(4);
  });
});

describe('Configuración de temas', () => {
  it('define el tema 1 como predeterminado', () => {
    expect(TEMA_PREDETERMINADO).toBe(1);
  });

  it('define los cuatro temas disponibles', () => {
    expect(Object.keys(PALETAS)).toEqual(['1', '2', '3', '4']);
  });

  it('incluye colores esenciales en cada tema', () => {
    for (const tema of Object.values(PALETAS)) {
      expect(tema.nombre).toBeTruthy();
      expect(tema.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(tema.background).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(tema.text).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
