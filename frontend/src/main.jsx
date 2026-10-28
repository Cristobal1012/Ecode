import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { aplicarPaleta, TEMA_PREDETERMINADO } from './constants/palettes'
import { aplicarTipografia, CLAVE_TIPOGRAFIA, TIPOGRAFIA_PREDETERMINADA } from './constants/tipografias'
import { capturarEnlaceRestablecimiento } from './utils/enlaceRestablecimiento'

// El token del enlace para elegir una nueva contraseña sale de la URL antes de que la analítica pueda leerla
capturarEnlaceRestablecimiento()

// Antes del primer render se pintan la última paleta y la última tipografía conocidas, para que la página no parpadee
aplicarPaleta(localStorage.getItem('ecommerce_palette') || TEMA_PREDETERMINADO)
aplicarTipografia(localStorage.getItem(CLAVE_TIPOGRAFIA) || TIPOGRAFIA_PREDETERMINADA)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
