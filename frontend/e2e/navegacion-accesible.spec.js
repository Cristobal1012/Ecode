import { test, expect } from '@playwright/test';
import { prepararTienda } from './soporte/tienda';

test('el salto por teclado y los títulos acompañan la navegación sin repetir configuración', async ({ page }) => {
  const { inesperadas, llamadas } = await prepararTienda(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Inicio · Tienda QA');
  expect(llamadas.filter(llamada => llamada.ruta === 'configuracion/')).toHaveLength(1);
  await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.locator('header').getByRole('link', { name: 'Catálogo', exact: true }).click();
  await expect(page).toHaveTitle('Catálogo · Tienda QA');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('main')).toHaveCount(1);
  expect(llamadas.filter(llamada => llamada.ruta === 'configuracion/')).toHaveLength(2);
  expect(inesperadas).toEqual([]);
});

test('Escape devuelve el foco del carrito y de la cuenta al botón que los abrió', async ({ page }) => {
  const { inesperadas } = await prepararTienda(page, { sesion: true });
  await page.goto('/login');
  for (const nombre of [/Carrito de compras/, /Menú de usuario/]) {
    const boton = page.getByRole('button', { name: nombre });
    await boton.focus();
    await page.keyboard.press('Enter');
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(boton).toBeFocused();
  }
  expect(inesperadas).toEqual([]);
});
