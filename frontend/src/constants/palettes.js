// RF-01.2: los 4 temas de la tienda. Los IDs coinciden con ConfiguracionGlobal.tema_seleccionado, así que una
// tienda que ya eligió un tema conserva su número. Estilo editorial (referencia: plantilla Maison de Lovable).
// Contraste AA (>= 4.5:1) verificado el 2026-10-18 para texto, texto secundario, botones y footer.
export const PALETTES = [
  {
    id: 1,
    name: 'Terracota',
    colors: {
      primary: '#9C4F2E',     // botones, enlaces y antetítulos
      onPrimary: '#FFFFFF',   // texto sobre primary
      secondary: '#F1EDE7',   // fondo de secciones alternas
      accent: '#E9DCCB',      // detalles suaves (etiquetas, bordes destacados)
      background: '#FAF8F5',  // fondo de la página
      surface: '#FFFFFF',     // tarjetas y formularios
      text: '#2A2622',
      muted: '#615A52',       // texto secundario
      controlBorder: '#76716A',
      border: '#E3DCD2',
      footer: '#2A2622'       // fondo del footer (texto claro encima)
    }
  },
  {
    id: 2,
    name: 'Salvia',
    colors: {
      primary: '#4A6347',
      onPrimary: '#FFFFFF',
      secondary: '#ECEFE6',
      accent: '#DCE3D2',
      background: '#F7F8F4',
      surface: '#FFFFFF',
      text: '#1F2A1F',
      muted: '#556052',
      controlBorder: '#76716A',
      border: '#D9DFD2',
      footer: '#1F2A1F'
    }
  },
  {
    id: 3,
    name: 'Pizarra',
    colors: {
      primary: '#3B5670',
      onPrimary: '#FFFFFF',
      secondary: '#E9EDF1',
      accent: '#D6DEE7',
      background: '#F6F7F9',
      surface: '#FFFFFF',
      text: '#1C2530',
      muted: '#535E6A',
      controlBorder: '#76716A',
      border: '#D5DCE3',
      footer: '#1C2530'
    }
  },
  {
    id: 4,
    name: 'Carbón',
    colors: {
      primary: '#2F2C28',
      onPrimary: '#FFFFFF',
      secondary: '#ECEAE5',
      accent: '#E2DCCF',
      background: '#F7F6F3',
      surface: '#FFFFFF',
      text: '#1A1917',
      muted: '#5B5750',
      controlBorder: '#76716A',
      border: '#DDD9D1',
      footer: '#1A1917'
    }
  }
];

export const TEMA_PREDETERMINADO = 1;

export const obtenerPaleta = (id) => PALETTES.find((p) => p.id === Number(id)) || PALETTES[0];

// Única función que pinta el tema: todas las páginas la usan para que ninguna variable quede desactualizada
export function aplicarPaleta(id) {
  const { colors } = obtenerPaleta(id);
  const root = document.documentElement.style;
  const variables = {
    '--color-primary': colors.primary,
    '--color-on-primary': colors.onPrimary,
    '--color-secondary': colors.secondary,
    '--color-accent': colors.accent,
    '--color-background': colors.background,
    '--color-surface': colors.surface,
    '--color-text': colors.text,
    '--color-muted': colors.muted,
    '--color-border': colors.border,
    '--color-control-border': colors.controlBorder,
    '--color-footer': colors.footer,
    // Nombres que ya usa Catalogo.css
    '--catalogo-primary': colors.primary,
    '--catalogo-on-primary': colors.onPrimary,
    '--catalogo-background': colors.background,
    '--catalogo-surface': colors.surface,
    '--catalogo-text': colors.text,
    '--catalogo-muted-text': colors.muted,
    '--catalogo-border': colors.border
  };
  Object.entries(variables).forEach(([nombre, valor]) => root.setProperty(nombre, valor));
}
