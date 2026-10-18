// Vista por ID de las paletas de constants/palettes.js (la única fuente de los colores).
// Los IDs coinciden con ConfiguracionGlobal.tema_seleccionado y el selector admin.
import { PALETTES, TEMA_PREDETERMINADO } from '../constants/palettes';

export const PALETAS = Object.fromEntries(
  PALETTES.map(({ id, name, colors }) => [id, {
    nombre: name,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    background: colors.background,
    surface: colors.surface,
    text: colors.text,
    mutedText: colors.muted,
    border: colors.border
  }])
);

export { TEMA_PREDETERMINADO };

export function obtenerIdTema(valor) {
  const id = String(valor);
  return /^[1-4]$/.test(id) ? Number(id) : null;
}
