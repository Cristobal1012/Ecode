import { test, expect } from '@playwright/test';
import { prepararTienda } from './soporte/tienda';

for (const ancho of [1440, 320]) {
test(`el texto de portada conserva contraste sobre una imagen blanca a ${ancho} píxeles`, async ({ page }) => {
  await prepararTienda(page);
  await page.route('**/api/configuracion/', route => route.fulfill({ json: {
    tema_seleccionado: 1, nombre_tienda: 'Tienda QA', texto_bienvenida: 'Portada QA',
    texto_landing: 'Texto de prueba para comprobar el contraste en toda el área de lectura de la portada. '.repeat(3),
    banner_url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22%3E%3Crect width=%2210%22 height=%2210%22 fill=%22white%22/%3E%3C/svg%3E',
  } }));
  await page.setViewportSize({ width: ancho, height: 844 });
  await page.goto('/');
  const contraste = await page.locator('.portada-texto').evaluate(parrafo => {
    const portada = parrafo.closest('.portada').getBoundingClientRect();
    const rango = document.createRange();
    rango.selectNodeContents(parrafo);
    const proporcion = (rango.getBoundingClientRect().right - portada.left) / portada.width;
    const estilo = getComputedStyle(document.querySelector('.portada-velo'));
    const gradiente = estilo.backgroundImage;
    const alfaSolido = Number(estilo.backgroundColor.match(/[\d.]+/g).at(-1));
    const alfas = gradiente === 'none' ? [alfaSolido, alfaSolido, alfaSolido] : [...gradiente.matchAll(/(?:rgba|color|oklab)\([^)]+\)/g)].map(coincidencia => Number(coincidencia[0].match(/[\d.]+/g).at(-1)));
    const alfa = proporcion <= 0.55 ? alfas[0] + (alfas[1] - alfas[0]) * proporcion / 0.55 : alfas[1] + (alfas[2] - alfas[1]) * (proporcion - 0.55) / 0.45;
    const fondo = 1 - alfa;
    const canales = getComputedStyle(parrafo).color.match(/[\d.]+/g).map(Number);
    const opacidad = canales[3] ?? 1;
    const texto = canales.slice(0, 3).map(canal => canal / 255 * opacidad + fondo * (1 - opacidad));
    const luminancia = valor => valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
    const luzTexto = texto.reduce((total, canal, indice) => total + luminancia(canal) * [0.2126, 0.7152, 0.0722][indice], 0);
    return { razon: (luzTexto + 0.05) / (luminancia(fondo) + 0.05), gradiente };
  });
  expect(contraste.razon, contraste.gradiente).toBeGreaterThanOrEqual(4.5);
});
}
