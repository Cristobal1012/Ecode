import { describe, expect, it } from 'vitest';
import { ORDEN_MENU, resolverMenu } from '../utils/menuPrincipal';

describe('menú principal', () => {
  it('conserva el orden, nombres y visibilidad heredados', () => {
    expect(resolverMenu().map(e => e.id)).toEqual(ORDEN_MENU);
    expect(resolverMenu().filter(e => e.visible).map(e => e.nombre)).toEqual(['Inicio', 'Catálogo']);
    expect(resolverMenu({ blog_activo: true, blog_nombre: 'Trabajos', sobre_mi_nombre: 'Historia' })[2].nombre).toBe('Trabajos');
  });
  it('cambia nombres y orden conservando destinos y enlaces ocultos', () => {
    const config = { menu_principal: { orden: [...ORDEN_MENU].reverse(), nombres: { nosotros: 'Empresa', catalogo: 'Productos' } } };
    expect(resolverMenu(config)[0]).toMatchObject({ id: 'cotizar', visible: false, to: '/cotizar' });
    expect(resolverMenu({ ...config, nosotros_texto: 'Texto' })[2]).toMatchObject({ nombre: 'Empresa', to: '/#nosotros', visible: true });
    expect(resolverMenu({ ...config, blog_activo: true })[2]).toMatchObject({ nombre: 'Empresa', to: '/blog', visible: true });
    expect(resolverMenu({ ...config, sobre_mi_activo: true, cotizaciones_activas: true }).every(e => e.id === 'nosotros' || e.visible)).toBe(true);
  });
  it('recupera identificadores faltantes y descarta desconocidos sin duplicar', () => {
    expect(resolverMenu({ menu_principal: { orden: ['catalogo', 'catalogo', 'ajeno'] } }).map(e => e.id)).toEqual(['catalogo', 'inicio', 'nosotros', 'sobre_mi', 'cotizar']);
  });
});
