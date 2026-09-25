import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PALETTES } from './constants/palettes'

// Cargar la paleta guardada en localStorage o usar la default ('eco-natural')
const savedPaletteId = localStorage.getItem('ecommerce_palette') || 'eco-natural'
const activeTheme = PALETTES.find((p) => p.id === savedPaletteId) || PALETTES[0]
const rootElem = document.documentElement

// Aplicar variables CSS en el elemento raiz
rootElem.style.setProperty('--color-primary', activeTheme.colors.primary)
rootElem.style.setProperty('--color-secondary', activeTheme.colors.secondary)
rootElem.style.setProperty('--color-accent', activeTheme.colors.accent)
rootElem.style.setProperty('--color-background', activeTheme.colors.background)
rootElem.style.setProperty('--color-text', activeTheme.colors.text)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)