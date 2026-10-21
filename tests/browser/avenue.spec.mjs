import { test, expect } from '@playwright/test';

test('la portada no carga motores, permite cambiar de idioma y cabe en móvil', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expect(page.locator('.tool-grid .open-button')).toHaveCount(3);
  await expect(page.locator('iframe, canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Abrir SolidCraft' }).hover();
  await page.locator('#language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Open Draft3D' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#language').selectOption('es');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Abrir Draft3D' })).toBeVisible();
  expect(requests.filter(path => /\.(?:wasm|woff2?|ttf)$|^\/(?:cad|solidcraft)\//.test(path))).toEqual([]);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
});

test('Materializr informa de su disponibilidad real y enlaza las versiones oficiales', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Ver opciones de Materializr' }).click();
  await expect(page).toHaveURL(/\/materializr\/$/);
  await expect(page.locator('.notice')).toContainText('no ofrece una compilación web soportada');
  await expect(page.getByRole('link', { name: 'Obtener la aplicación oficial' })).toHaveAttribute('href', 'https://github.com/materializr-cad/materializr/releases/latest');
  await expect(page.locator('iframe, canvas')).toHaveCount(0);
  await page.getByRole('link', { name: 'Todas las herramientas' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Proyectos y licencias' }).click();
  await expect(page.getByRole('heading', { name: 'Tres herramientas, proyectos independientes.' })).toBeVisible();
});

test('SolidCraft arranca localmente, recarga su caché y deja volver a la portada sin invadir Atlas', async ({ page, request }, testInfo) => {
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto('/');
  await page.getByRole('link', { name: 'Abrir SolidCraft' }).click();
  const frame = page.frameLocator('.editor-frame');
  await expect(frame.locator('canvas')).toBeVisible();
  await expect.poll(() => frame.locator('canvas').evaluate(canvas => !!window.wasmBindings && canvas.width > 0 && canvas.height > 0), { timeout: 90000 }).toBe(true);
  await expect(frame.locator('#solidcraft_loading')).toBeHidden({ timeout: 90000 });
  const scopes = await frame.locator('canvas').evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (await navigator.serviceWorker.getRegistrations()).map(item => new URL(item.scope).pathname);
  });
  expect(scopes).toEqual(['/solidcraft/app/']);
  await page.reload();
  await expect(frame.locator('canvas')).toBeVisible();
  await expect.poll(() => frame.locator('canvas').evaluate(() => !!window.wasmBindings), { timeout: 90000 }).toBe(true);
  await expect(frame.locator('#solidcraft_loading')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('solidcraft-selfhost.png') });
  const wasm = await request.get('/solidcraft/app/solidcraft-web-2b7aa4d987861593_bg.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  await page.getByRole('link', { name: 'Todas las herramientas' }).click();
  await expect(page.locator('.tool-grid')).toBeVisible();
  await expect(page.locator('iframe, canvas')).toHaveCount(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.locator('#language').selectOption('en');
  await page.getByRole('link', { name: 'Open Draft3D' }).click();
  await expect(page.locator('#engine-status')).toContainText('OpenCascade', { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
  await expect(page.locator('#locale-select')).toHaveValue('en');
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.getByRole('link', { name: 'Back to Drafty3D tools' }).click();
  await expect(page.locator('.tool-grid')).toBeVisible();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});
