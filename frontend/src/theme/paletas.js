// Los IDs coinciden con ConfiguracionGlobal.tema_seleccionado y el selector admin.
export const PALETAS = {
  1: { nombre: 'Azul', primary: '#1D4ED8', onPrimary: '#FFFFFF', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', mutedText: '#475569', border: '#CBD5E1' },
  2: { nombre: 'Verde', primary: '#166534', onPrimary: '#FFFFFF', background: '#F7FDF8', surface: '#FFFFFF', text: '#14281D', mutedText: '#405A4B', border: '#BED7C5' },
  3: { nombre: 'Terracota', primary: '#9A3412', onPrimary: '#FFFFFF', background: '#FFF8F3', surface: '#FFFFFF', text: '#2D1B15', mutedText: '#694B40', border: '#E8C5B5' },
  4: { nombre: 'Grafito', primary: '#374151', onPrimary: '#FFFFFF', background: '#F3F4F6', surface: '#FFFFFF', text: '#111827', mutedText: '#4B5563', border: '#D1D5DB' },
};

export const TEMA_PREDETERMINADO = 1;

export function obtenerIdTema(valor) {
  const id = String(valor);
  return /^[1-4]$/.test(id) ? Number(id) : null;
}
