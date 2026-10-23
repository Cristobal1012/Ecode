import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const tema of [1, 2, 3, 4]) {
  test(`los campos se distinguen en la paleta ${tema}`, async ({ page }) => {
    const inesperadas = [];
    await page.route('**/api/**', async route => {
      const ruta = new URL(route.request().url()).pathname;
      if (ruta === '/api/configuracion/') {
        await route.fulfill({ json: { nombre_tienda: 'Tienda QA', tema_seleccionado: tema } });
      } else if (ruta === '/api/ventas/paginas-legales/') {
        await route.fulfill({ json: [] });
      } else {
        inesperadas.push(ruta);
        await route.abort();
      }
    });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    const contraste = await page.getByLabel('Correo electrónico', { exact: true }).evaluate(input => {
      const luminancia = color => {
        const canales = color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number)
          .map(valor => valor / 255).map(valor => valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4);
        return canales.reduce((total, valor, indice) => total + valor * [0.2126, 0.7152, 0.0722][indice], 0);
      };
      const estilo = getComputedStyle(input);
      const borde = luminancia(estilo.borderColor);
      const fondo = luminancia(estilo.backgroundColor);
      return (Math.max(borde, fondo) + 0.05) / (Math.min(borde, fondo) + 0.05);
    });
    expect(contraste).toBeGreaterThanOrEqual(3);
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(resultado.violations).toEqual([]);
    expect(inesperadas).toEqual([]);
  });
}
