import { test, expect } from '@playwright/test';
import { prepararTienda } from './soporte/tienda';

test('inventario permite expandir y abrir el formulario con teclado', async ({ page }) => {
  const { inesperadas } = await prepararTienda(page, { sesion: true });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  const expandir = page.getByRole('button', { name: /^(Mostrar|Ocultar) variantes de Producto de prueba$/ });
  await expandir.focus();
  await page.keyboard.press('Space');
  await expect(expandir).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('QA-1', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(expandir).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Editar Producto de prueba', exact: true }).press('Enter');
  await expect(page.getByLabel('Nombre del Producto', { exact: true })).toHaveValue('Producto de prueba');
  await expect(page.getByRole('button', { name: 'Cerrar formulario de producto' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar formulario de producto' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Mostrar variantes de Producto de prueba' })).toBeVisible();
  expect(inesperadas).toEqual([]);
});
