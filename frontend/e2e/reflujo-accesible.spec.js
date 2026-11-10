import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepararTienda, producto } from './soporte/tienda';
import { medirVista, ampliarTexto, espaciarTexto } from './soporte/mediciones';

const rutas = ['/', '/catalogo', `/catalogo/producto/${producto.id}`, '/variantes', '/login', '/checkout', '/seguimiento', '/mis-direcciones', '/mis-pedidos', '/legal/terminos', '/pago-exitoso', '/pedido-recibido', '/pago-cancelado', '/pago-rechazado'];

for (const ancho of [1440, 390, 768, 320]) {
  test(`las rutas conservan estructura y reflujo a ${ancho} píxeles`, async ({ page }) => {
    const { inesperadas } = await prepararTienda(page);
    await page.route('**/api/ventas/mis-pedidos/', route => route.fulfill({ json: [] }));
    await page.setViewportSize({ width: ancho, height: ancho === 768 ? 1024 : ancho === 1440 ? 900 : 844 });
    for (const ruta of rutas) {
      await page.goto(ruta, {
        waitUntil: 'commit',
        timeout: 10000,
      });
      if (ruta === '/login') {
        await page.getByRole('button', { name: 'Regístrate aquí' }).click();
        await expect(page.getByRole('heading', { name: 'Crear cuenta', exact: true })).toBeVisible();
        await medirVista(page);
      }
    }
    expect(inesperadas).toEqual([]);
  });
}

// El reflujo depende de la tipografía (el ancho del texto), no de la paleta: los colores no cambian las medidas, y
// el contraste de cada paleta lo revisan paletas.test.js y accesibilidad.spec.js
for (const tipografia of [1, 2, 3, 4, 5]) {
  test(`tipografía ${tipografia}: 320 píxeles`, async ({ page }) => {
    const { inesperadas } = await prepararTienda(page, { tipografia, sesion: true });
    await page.setViewportSize({ width: 320, height: 844 });
    for (const ruta of ['/', '/catalogo', '/login', '/checkout', '/admin']) {
      await page.goto(ruta);
      await medirVista(page);
    }
    await page.getByRole('button', { name: 'Inventario', exact: true }).click();
    await page.getByRole('button', { name: '+ Agregar producto', exact: true }).click();
    await medirVista(page);
    await expect(page.getByRole('button', { name: 'Crear Producto', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Configuración', exact: true }).click();
    await medirVista(page);
    expect(inesperadas).toEqual([]);
  });
}

for (const ajuste of ['texto al 200 %', 'espaciado personalizado']) {
  for (const tipografia of [1, 2, 3, 4, 5]) {
    test(`${ajuste}, tipografía ${tipografia}, sin cambiar el viewport`, async ({ page }) => {
      const { inesperadas } = await prepararTienda(page, {
        sesion: true,
        tipografia,
      });

      await page.setViewportSize({ width: 390, height: 844 });

      for (const ruta of ['/', '/catalogo', '/login', '/checkout', '/legal/terminos', '/admin']) {
        await test.step(`Navegación a ${ruta}`, async () => {
          await page.goto(ruta);
        });

        await test.step(`Medición inicial ${ruta}`, async () => {
          await medirVista(page);
        });

        await test.step(`Aplicar ${ajuste} en ${ruta}`, async () => {
          if (ajuste === 'texto al 200 %') {
            await ampliarTexto(page);
          } else {
            await espaciarTexto(page);
          }
        });

        await test.step(`Medición después del ajuste ${ruta}`, async () => {
          await medirVista(page);
        });
      }

      await page.goto('/admin');

      await test.step('Abrir inventario', async () => {
        await page.getByRole('button', {
          name: 'Inventario',
          exact: true,
        }).click();
      });

      await test.step('Abrir formulario de producto', async () => {
        await page.getByRole('button', {
          name: '+ Agregar producto',
          exact: true,
        }).click();
      });

      await test.step('Aplicar ajuste al formulario', async () => {
        if (ajuste === 'texto al 200 %') {
          await ampliarTexto(page);
        } else {
          await espaciarTexto(page);
        }
      });

      await medirVista(page);

      expect(inesperadas).toEqual([]);
    });
  }
}
