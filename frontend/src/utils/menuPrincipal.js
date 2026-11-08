export const ORDEN_MENU = ['inicio', 'catalogo', 'nosotros', 'sobre_mi', 'cotizar'];

export function resolverMenu(config = {}) {
  config = config || {};
  const menu = config.menu_principal || {};
  const orden = Array.isArray(menu.orden) ? [...new Set(menu.orden.filter(id => ORDEN_MENU.includes(id)))] : [];
  orden.push(...ORDEN_MENU.filter(id => !orden.includes(id)));
  const enlaces = {
    inicio: { base: 'Inicio', to: '/', visible: true },
    catalogo: { base: 'Catálogo', to: '/catalogo', visible: true },
    nosotros: { base: config.blog_activo ? config.blog_nombre || 'Nosotros' : 'Nosotros',
      to: config.blog_activo ? '/blog' : '/#nosotros', visible: Boolean(config.blog_activo || config.nosotros_texto) },
    sobre_mi: { base: config.sobre_mi_nombre || 'Sobre mí', to: '/sobre-mi', visible: Boolean(config.sobre_mi_activo) },
    cotizar: { base: 'Cotizar', to: '/cotizar', visible: Boolean(config.cotizaciones_activas) },
  };
  return orden.map(id => {
    const personalizado = menu.nombres?.[id];
    return { id, ...enlaces[id], nombre: typeof personalizado === 'string' && personalizado.trim() ? personalizado : enlaces[id].base };
  });
}
