import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { aplicarPaleta, TEMA_PREDETERMINADO } from './constants/palettes'

// Antes del primer render se pinta la última paleta conocida, para que la página no parpadee
aplicarPaleta(localStorage.getItem('ecommerce_palette') || TEMA_PREDETERMINADO)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
