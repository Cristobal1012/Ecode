import { test, expect } from '@playwright/test';

//Landing Page -> Catalogo
const configuracionQA = {
  texto_bienvenida: 'Bienvenido a Ecode QA',
  texto_boton_ingreso: 'Ver catálogo',
  tema_seleccionado: 1,
  paleta_id: 1,
  banner_url: '',
};

test.beforeEach(async ({ page }) => {
  // Simular la configuración pública del backend
  await page.route('**/api/configuracion/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(configuracionQA),
    });
  });

  // Vitrina de la landing vacía: las secciones de productos no se muestran
  await page.route('**/api/catalogo/vitrina/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mas_vendidos: [], recientes: [] }),
    });
  });

  // Simular un catálogo vacío, sin modificar la base de datos
  await page.route('**/api/catalogo/productos/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
});

test('la página inicial muestra la bienvenida y el botón de catálogo', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Bienvenido a Ecode QA' }),
  ).toBeVisible();

  // Es un enlace: lleva a otra página
  await expect(
    page.getByRole('link', { name: 'Ver catálogo' }),
  ).toBeVisible();
});

test('el botón de bienvenida navega al catálogo', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('link', { name: 'Ver catálogo' }).click();

  await expect(page).toHaveURL(/\/catalogo$/);

  await expect(
    page.getByRole('heading', { name: /catálogo/i }),
  ).toBeVisible();

  await expect(
    page.getByText('No hay productos para mostrar'),
  ).toBeVisible();
});
