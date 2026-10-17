import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const storageKey = 'drafty3d.document.v1';
const initialVolume = 60 * 40 * 8 - Math.PI * 6 ** 2 * 8;
const editedVolume = 80 * 40 * 8 - Math.PI * 6 ** 2 * 8;

// Un fallo JavaScript de la página debe fallar aunque su interfaz parezca lista.
const test = base.extend({
  runtimeErrors: [async ({ page, browser }, use, testInfo) => {
    const errors = [];
    const consoleMessages = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => {
      if (['error','warning'].includes(entry.type())) consoleMessages.push({ type: entry.type(), message: entry.text() });
    });
    page.on('requestfailed', (request) => requests.push({ url: request.url(), failure: request.failure() }));
    page.on('response', (response) => {
      if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() });
    });
    await use(errors);
    let state;
    try { state = await page.evaluate(() => ({ engine: document.querySelector('#engine-status')?.textContent, title: document.querySelector('#loading-title')?.textContent, detail: document.querySelector('#loading-detail')?.textContent, message: document.querySelector('#message')?.textContent })); } catch { state = 'Página cerrada'; }
    await testInfo.attach('diagnostico-navegador', { body: Buffer.from(JSON.stringify({ browser: browser.version(), state, errors, consoleMessages, requests },null,2)), contentType: 'application/json' });
    expect(errors, 'La aplicación no debe producir excepciones sin manejar.').toEqual([]);
  }, { auto: true }],
});

async function ready(page) {
  await page.waitForFunction(() =>
    document.querySelector('#engine-status')?.textContent.includes('OpenCascade · listo') ||
    document.querySelector('#loading-title')?.textContent === 'No se pudo iniciar el editor',
  undefined, { timeout: 90_000 });
  const startupError = await page.locator('#loading-title').textContent();
  if (startupError === 'No se pudo iniciar el editor') {
    throw new Error(`No se pudo iniciar el CAD: ${await page.locator('#loading-detail').textContent()}`);
  }
  await expect(page.locator('#engine-status')).toContainText('OpenCascade · listo');
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect(page.locator('#new-project')).toBeEnabled();
}

async function openEditor(page) {
  const response = await page.goto('/cad/');
  expect(response.status()).toBe(200);
  await ready(page);
}

async function storedDocument(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function selectedVolume(page) {
  const text = await page.locator('.stats-card strong').textContent();
  return Number(text.replace(/[^0-9.\-]/g, ''));
}

async function selectSupport(page) {
  await page.locator('.object-select[data-id="soporte"]').click();
  await expect(page.locator('#selection-label')).toHaveText('Soporte con agujero');
}

async function saveDownload(page, testInfo, click, name) {
  const pending = page.waitForEvent('download');
  await click();
  const download = await pending;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  return { download, path, data: await readFile(path) };
}

test('el editor carga OpenCascade sin cuenta y conserva la portada y la investigación', async ({ page, request, context }, testInfo) => {
  await openEditor(page);
  await expect(page).toHaveTitle(/Drafty3D/);
  await expect(page.locator('#object-list .object-select')).toHaveCount(3);
  await expect(page.locator('#viewport canvas')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  expect(await context.cookies()).toEqual([]);
  await selectSupport(page);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.screenshot({ path: testInfo.outputPath('editor-windows.png') });
  for (const path of ['/', '/docs/investigacion/propuestas-ui.html']) {
    const response = await request.get(path);
    expect(response.status(), `${path} debe seguir disponible.`).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  }
});

test('editar una fuente oculta reconstruye el soporte y permite deshacer y rehacer', async ({ page }) => {
  await openEditor(page);
  await page.locator('.object-select[data-id="base"]').click();
  await page.locator('#param-width').fill('80');
  await page.getByRole('button', { name: 'Aplicar cambios', exact: true }).click();
  await expect(page.locator('#message')).toHaveText('Medidas actualizadas.');
  await ready(page);
  await selectSupport(page);
  expect(await selectedVolume(page)).toBeCloseTo(editedVolume, 1);
  expect((await storedDocument(page)).objects.find((object) => object.id === 'base').params.width).toBe(80);
  await page.locator('#undo').click();
  await expect(page.locator('#message')).toHaveText('Operación deshecha.');
  await ready(page);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.locator('#redo').click();
  await expect(page.locator('#message')).toHaveText('Operación rehecha.');
  await ready(page);
  expect(await selectedVolume(page)).toBeCloseTo(editedVolume, 1);
  expect((await storedDocument(page)).objects.find((object) => object.id === 'base').params.width).toBe(80);
});

test('un perfil de 40 × 30 extruido 12 mm produce un sólido de 14400 mm³', async ({ page }) => {
  await openEditor(page);
  await page.locator('#new-project').click();
  await expect(page.locator('#message')).toContainText('Proyecto nuevo.');
  await ready(page);
  await page.locator('#sketch-button').click();
  await expect(page.locator('#plane-picker')).toBeVisible();
  await page.locator('[data-plane="XY"]').click();
  await page.locator('#sketch-preset').click();
  await expect(page.locator('#sketch-status')).toContainText('Contorno cerrado');
  await page.locator('#sketch-height').fill('12');
  await page.locator('#sketch-create').click();
  await expect(page.locator('#message')).toHaveText('Perfil extruido.');
  await ready(page);
  expect(await selectedVolume(page)).toBe(14400);
  const saved = await storedDocument(page);
  expect(saved.objects).toHaveLength(1);
  expect(saved.objects[0].type).toBe('extrusion');
  expect(saved.objects[0].params).toMatchObject({ points: [[0, 0], [40, 0], [40, 30], [0, 30]], height: 12 });
});

async function canvasCenter(page) {
  const box = await page.locator('#viewport > canvas').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, height: box.height };
}
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test('agarrar, mover por X y girar con anillos guardan un cambio por gesto y Esc cancela', async ({ page }, testInfo) => {
  await openEditor(page); await selectSupport(page);
  const original = await storedDocument(page);
  await page.locator('[data-view="top"]').click();
  await page.locator('[data-interaction="translate"]').click();
  const c = await canvasCenter(page);
  await drag(page, { x: c.x - 150, y: c.y + 100 }, { x: c.x - 110, y: c.y + 140 });
  await expect(page.locator('#message')).toHaveText('Posición y giro actualizados con el ratón.'); await ready(page);
  const moved = await storedDocument(page);
  expect(moved.objects).toHaveLength(4);
  expect(moved.objects.find((object) => object.id === 'soporte').type).toBe('transform');
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.locator('#undo').click(); await ready(page);
  expect(await storedDocument(page)).toEqual(original);
  const axis = c.height * 0.105;
  await drag(page, { x: c.x + axis, y: c.y }, { x: c.x + axis + 55, y: c.y });
  await expect(page.locator('#message')).toHaveText('Posición y giro actualizados con el ratón.'); await ready(page);
  const byAxis = (await storedDocument(page)).objects.find((object) => object.id === 'soporte').params;
  expect(Math.abs(byAxis.x)).toBeGreaterThan(1);
  expect(Math.abs(byAxis.y)).toBeLessThan(0.001); expect(Math.abs(byAxis.z)).toBeLessThan(0.001);
  await page.locator('#undo').click(); await ready(page);
  await page.locator('[data-interaction="rotate"]').click();
  const diagonal = c.height * 0.1009375 / Math.SQRT2;
  await drag(page, { x: c.x + diagonal, y: c.y + diagonal }, { x: c.x - diagonal, y: c.y + diagonal });
  await expect(page.locator('#message')).toHaveText('Posición y giro actualizados con el ratón.'); await ready(page);
  const rotated = await storedDocument(page);
  expect(Math.abs(rotated.objects.find((object) => object.id === 'soporte').params.rz)).toBeGreaterThan(10);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.screenshot({ path: testInfo.outputPath('giro-con-raton.png') });
  await page.locator('#undo').click(); await ready(page);
  await page.locator('[data-interaction="translate"]').click();
  await page.mouse.move(c.x - 150, c.y + 100); await page.mouse.down(); await page.mouse.move(c.x - 110, c.y + 140, { steps: 6 });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await storedDocument(page)).toEqual(original);
  await expect(page.locator('#message')).toHaveText('Movimiento cancelado.');
});

test('dibujar un rectángulo con el ratón en XZ produce una extrusión orientada', async ({ page }) => {
  await openEditor(page); await page.locator('#new-project').click(); await ready(page);
  await page.locator('#sketch-button').click(); await page.locator('[data-plane="XZ"]').click();
  const c = await canvasCenter(page);
  await drag(page, { x: c.x - 100, y: c.y - 80 }, { x: c.x + 100, y: c.y + 80 });
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  await page.locator('#sketch-height').fill('7'); await page.locator('#sketch-create').click(); await ready(page);
  const object = (await storedDocument(page)).objects[0];
  expect(object.params.plane).toEqual({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] });
  const width = Math.abs(object.params.points[1][0] - object.params.points[0][0]);
  const depth = Math.abs(object.params.points[2][1] - object.params.points[1][1]);
  expect(await selectedVolume(page)).toBeCloseTo(width * depth * 7, 1);
});

test('un círculo dibujado en una cara plana corta el sólido y se edita con el ratón', async ({ page }, testInfo) => {
  await openEditor(page);
  await page.locator('[data-view="top"]').click();
  await page.locator('#sketch-button').click(); await page.locator('#pick-face').click();
  let c = await canvasCenter(page);
  await page.mouse.click(c.x - 140, c.y + 100);
  await expect(page.locator('#sketch-plane-name')).toContainText('Cara de Soporte');
  await expect(page.locator('#sketch-effect')).toHaveValue('cut');
  await page.locator('#sketch-circle').click();
  c = await canvasCenter(page);
  await drag(page, { x: c.x - 140, y: c.y + 100 }, { x: c.x - 110, y: c.y + 100 });
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  await page.locator('#sketch-height').fill('12');
  await page.screenshot({ path: testInfo.outputPath('croquis-sobre-cara.png') });
  await page.locator('#sketch-create').click(); await ready(page);
  const doc = await storedDocument(page);
  const profile = doc.objects.find((object) => object.type === 'extrusion');
  expect(profile.params.support.source).toBe('soporte');
  expect(profile.params.profile.type).toBe('circle');
  const radius = profile.params.profile.radius;
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume - Math.PI * radius ** 2 * 8, 1);
  await page.locator(`.object-select[data-id="${profile.id}"]`).click(); await page.locator('#edit-profile').click();
  await expect(page.locator('#sketch-effect')).toBeDisabled();
  await page.locator('#sketch-height').fill('3'); await page.locator('#sketch-create').click(); await ready(page);
  await page.locator(`.object-select[data-id="${doc.objects.at(-1).id}"]`).click();
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume - Math.PI * radius ** 2 * 3, 1);
});

test('líneas conectadas cierran un perfil en YZ y su extrusión conserva el área dibujada', async ({ page }) => {
  await openEditor(page); await page.locator('#new-project').click(); await ready(page);
  await page.locator('#sketch-button').click(); await page.locator('[data-plane="YZ"]').click(); await page.locator('#sketch-lines').click();
  const c = await canvasCenter(page);
  const points = [[-100, 100], [80, 100], [80, 0], [0, -60], [-100, 0], [-100, 100]];
  for (const [x, y] of points) await page.mouse.click(c.x + x, c.y + y);
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  await page.locator('#sketch-height').fill('9'); await page.locator('#sketch-create').click(); await ready(page);
  const object = (await storedDocument(page)).objects[0];
  expect(object.params.plane).toEqual({ origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] });
  expect(object.params.points).toHaveLength(5);
  const p = object.params.points;
  const area = Math.abs(p.reduce((sum, point, i) => sum + point[0] * p[(i + 1) % p.length][1] - point[1] * p[(i + 1) % p.length][0], 0)) / 2;
  expect(await selectedVolume(page)).toBeCloseTo(area * 9, 1);
});

test('un redondeo imposible conserva el proyecto y permite continuar editando', async ({ page }) => {
  await openEditor(page);
  const previous = await storedDocument(page);
  await page.locator('#fillet-button').click();
  const dialog = page.locator('#operation-form-panel');
  await dialog.locator('select[name="source"]').selectOption('base');
  await dialog.locator('input[name="radius"]').fill('100');
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('#message')).toContainText('radio menor');
  await expect(page.locator('#message')).toHaveClass(/error/);
  await ready(page);
  expect(await storedDocument(page)).toEqual(previous);
  await expect(page.locator('#object-list .object-select')).toHaveCount(3);
  await selectSupport(page);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.locator('#sketch-button').click();
  await expect(page.locator('#plane-picker')).toBeVisible();
});

test('descarga STEP, STL y proyecto portable, vuelve a abrirlo y conserva el guardado al recargar', async ({ page }, testInfo) => {
  await openEditor(page);
  await page.locator('#document-name').fill('CAD portable Windows');
  await page.locator('#document-name').press('Tab');
  await expect(page.locator('#message')).toHaveText('Nombre del proyecto actualizado.');
  await ready(page);
  const project = await saveDownload(page, testInfo, () => page.locator('#save-project').click(), 'proyecto.cad.json');
  expect(project.download.suggestedFilename()).toBe('CAD-portable-Windows.cad.json');
  expect(JSON.parse(project.data.toString('utf8'))).toEqual(await storedDocument(page));
  const files = new Map();
  for (const format of ['step', 'stl']) {
    await page.locator('#export-button').click();
    const file = await saveDownload(page, testInfo, () => page.locator(`[data-export="${format}"]`).click(), `pieza.${format}`);
    await expect(page.locator('#message')).toHaveText(`Archivo ${format.toUpperCase()} exportado.`);
    await ready(page);
    expect(file.download.suggestedFilename()).toBe(`CAD-portable-Windows.${format}`);
    files.set(format, file);
  }
  expect(files.get('step').data.toString('utf8')).toMatch(/^ISO-10303-21;/);
  const stl = files.get('stl').data;
  const triangles = stl.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(12);
  expect(stl.length).toBe(84 + triangles * 50);
  await page.locator('#new-project').click();
  await expect(page.locator('#message')).toContainText('Proyecto nuevo.');
  await ready(page);
  await expect(page.locator('#object-list .object-select')).toHaveCount(0);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#open-project').click();
  await (await chooserPromise).setFiles(project.path);
  await expect(page.locator('#message')).toContainText('abierto.');
  await ready(page);
  await expect(page.locator('#document-name')).toHaveValue('CAD portable Windows');
  await selectSupport(page);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
  await page.reload();
  await ready(page);
  await expect(page.locator('#document-name')).toHaveValue('CAD portable Windows');
  await expect(page.locator('#object-list .object-select')).toHaveCount(3);
  expect(await storedDocument(page)).toEqual(JSON.parse(project.data.toString('utf8')));
  await selectSupport(page);
  expect(await selectedVolume(page)).toBeCloseTo(initialVolume, 1);
});

test('reabre STEP y un STL exportado de miles de triángulos sin reconstruir caras por triángulo', async ({ page }, testInfo) => {
  await openEditor(page);
  await page.locator('#sketch-button').click();
  await page.locator('[data-plane="XY"]').click();
  await page.locator('#sketch-preset').click();
  await page.locator('#sketch-height').fill('12');
  await page.locator('#sketch-create').click();
  await expect(page.locator('#message')).toHaveText('Perfil extruido.');
  await ready(page);
  await page.locator('#fillet-button').click();
  const dialog = page.locator('#operation-form-panel');
  await dialog.locator('input[name="radius"]').fill('1');
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('#message')).toHaveText('Redondeo creado.');
  await ready(page);
  const volume = initialVolume + await selectedVolume(page);
  const files = new Map();
  for (const format of ['step', 'stl']) {
    await page.locator('#export-button').click();
    const file = await saveDownload(page, testInfo, () => page.locator(`[data-export="${format}"]`).click(), `conjunto.${format}`);
    await expect(page.locator('#message')).toHaveText(`Archivo ${format.toUpperCase()} exportado.`);
    await ready(page);
    files.set(format, file);
  }
  expect(files.get('stl').data.readUInt32LE(80)).toBeGreaterThanOrEqual(3000);
  for (const format of ['step', 'stl']) {
    await page.locator('#new-project').click();
    await expect(page.locator('#message')).toContainText('Proyecto nuevo.');
    await ready(page);
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#open-project').click();
    const started = Date.now();
    await (await chooserPromise).setFiles(files.get(format).path);
    await expect(page.locator('#message')).toContainText('abierto.');
    await ready(page);
    await expect(page.locator('#object-list .object-select')).toHaveCount(1);
    const imported = await storedDocument(page);
    expect(imported.objects[0]).toMatchObject({ type: 'import', params: { format } });
    if (format === 'step') expect(await selectedVolume(page)).toBeCloseTo(volume, 1);
    else {
      expect(Date.now() - started, 'La malla de miles de triángulos debe abrirse sin reconstruir miles de caras BRep.').toBeLessThan(10_000);
      await expect(page.locator('.stats-card')).toHaveCount(0);
      await expect(page.locator('#inspector-content')).toContainText(/malla/i);
      await page.locator('#fillet-button').click();
      const fillet = page.locator('#operation-form-panel');
      await expect(fillet.locator('select[name="source"]')).toHaveValue(imported.objects[0].id);
      await fillet.getByRole('button', { name: 'Aplicar', exact: true }).click();
      await expect(page.locator('#message')).toContainText('STL son mallas');
      await ready(page);
      expect(await storedDocument(page)).toEqual(imported);
    }
  }
});

test('una geometría local inválida se recupera sin perder el archivo anterior', async ({ page }, testInfo) => {
  // Fixture declarativo: archivo válido para el modelo, imposible para el núcleo.
  const invalid = { version: 1, name: 'Redondeo imposible guardado', objects: [
    { id: 'base', name: 'Bloque de origen', type: 'box', params: { width: 20, depth: 30, height: 10, x: 0, y: 0, z: 0 }, visible: false, color: '#56b6ff' },
    { id: 'redondeo', name: 'Radio imposible', type: 'fillet', params: { source: 'base', radius: 100 }, visible: true, color: '#56b6ff' },
  ] };
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: storageKey, value: JSON.stringify(invalid) });
  await openEditor(page);
  await expect(page.locator('#message')).toContainText('La geometría guardada no se pudo reconstruir.');
  await expect(page.locator('#document-name')).toHaveValue('Proyecto recuperado');
  await expect(page.locator('#recover-project')).toBeVisible();
  await expect(page.locator('#object-list .object-select')).toHaveCount(0);
  const recovery = await saveDownload(page, testInfo, () => page.locator('#recover-project').click(), 'copia-anterior.cad.json');
  expect(JSON.parse(recovery.data.toString('utf8'))).toEqual(invalid);
  expect(await storedDocument(page)).toMatchObject({ name: 'Proyecto recuperado', objects: [] });
  await page.reload();
  await ready(page);
  await expect(page.locator('#document-name')).toHaveValue('Proyecto recuperado');
  await expect(page.locator('#recover-project')).toBeVisible();
});
