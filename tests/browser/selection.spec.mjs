import { test as base, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';

const storageKey = 'drafty3d.document.v1';
const boxDocument = { version: 1, name: 'Selección local · Atlas', objects: [
  { id: 'base', name: 'Bloque paramétrico', type: 'box', params: { width: 20, depth: 30, height: 10, x: 0, y: 0, z: 0 }, visible: true, color: '#afc79c' },
] };
const test = base.extend({
  runtimeErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }],
});

async function ready(page) {
  await expect(page.locator('#engine-status')).toContainText('OpenCascade · listo', { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect(page.locator('#new-project')).toBeEnabled();
}
async function state(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey); }
async function diagnostics(page) { return page.evaluate(() => window.draftyDiagnostics()); }
async function open(page, document = boxDocument) {
  await page.addInitScript(({ key, document }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(document)); }, { key: storageKey, document });
  await page.goto('/cad/');
  await ready(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.cadReady))).toBe(true);
}
async function screenPoint(page, point) {
  const { camera } = await diagnostics(page);
  const box = await page.locator('#viewport > canvas').boundingBox();
  const view = new PerspectiveCamera(camera.fov, camera.aspect, 0.1, 100000);
  view.up.set(0, 0, 1); view.position.fromArray(camera.position);
  view.lookAt(new Vector3(...camera.target)); view.updateMatrixWorld();
  const projected = new Vector3(...point).project(view);
  return { x: box.x + (projected.x + 1) * box.width / 2, y: box.y + (1 - projected.y) * box.height / 2 };
}
async function clickPoint(page, point, multiple = false) {
  const screen = await screenPoint(page, point);
  if (multiple) await page.keyboard.down('Control');
  await page.mouse.click(screen.x, screen.y);
  if (multiple) await page.keyboard.up('Control');
}

test('ordena modos y activa mover con un clic o arrastre, respetando herramientas y selección múltiple', async ({ page }) => {
  await open(page);
  expect(await page.locator('.modebar [data-space]').evaluateAll(buttons => buttons.map(button => button.dataset.space))).toEqual(['sketch', 'cad', 'assembly', 'mesh']);
  await page.locator('[data-space="assembly"]').click();
  await expect(page.locator('#assembly-placeholder')).toBeVisible();
  await expect(page.locator('#command-groups button:visible')).toHaveCount(0);
  await page.locator('[data-space="cad"]').click();
  const original = await state(page), initial = await diagnostics(page);
  await page.locator('#create-box').click();
  await clickPoint(page, [10, 0, 5]);
  expect((await diagnostics(page)).mode).toBe('orbit');
  expect(await state(page)).toEqual(original);
  await expect(page.locator('#operation-form-panel')).toBeVisible();
  await page.locator('#cancel-tool').click();
  await clickPoint(page, [10, 0, 5], true);
  expect((await diagnostics(page)).mode).toBe('orbit');
  await clickPoint(page, [10, 0, 5]);
  await expect(page.locator('[data-interaction="translate"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await state(page)).toEqual(original);
  expect((await diagnostics(page)).engineRequests).toBe(initial.engineRequests);
  const point = await screenPoint(page, [10, 0, 5]);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 55, point.y + 30, { steps: 10 }); await page.mouse.up();
  await expect(page.locator('#message')).toContainText('actualizados con el ratón');
  await ready(page);
  expect(await state(page)).not.toEqual(original);
  expect((await diagnostics(page)).engineRequests).toBe(initial.engineRequests + 1);
  await page.locator('#undo').click(); await ready(page);
  expect(await state(page)).toEqual(original);
  await page.locator('[data-interaction="rotate"]').click();
  await clickPoint(page, [10, 0, 5]);
  expect((await diagnostics(page)).mode).toBe('rotate');
  expect(await state(page)).toEqual(original);
});

test('elige aristas y vértices sin recalcular, conserva ES/EN y guarda un redondeo local recuperable', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('.object-select[data-id="base"]').click();
  const original = await state(page), before = await diagnostics(page);
  await page.locator('#selection-filter').selectOption('edge');
  await expect(page.locator('#element-panel')).toBeVisible();
  const loaded = await diagnostics(page);
  expect(loaded.engineRequests).toBe(before.engineRequests + 1);
  expect(loaded.geometryUploads).toBe(before.geometryUploads);
  await clickPoint(page, [20, 0, 5]);
  expect((await diagnostics(page)).elements.selected).toHaveLength(1);
  await clickPoint(page, [20, 15, 10], true);
  expect((await diagnostics(page)).elements.selected).toHaveLength(2);
  await page.locator('#selection-filter').selectOption('vertex');
  await expect(page.locator('#selection-filter')).toBeEnabled();
  await clickPoint(page, [20, 0, 10]);
  expect((await diagnostics(page)).elements.selected).toHaveLength(1);
  expect((await diagnostics(page)).elements.edges).toHaveLength(3);
  await expect(page.locator('#element-summary')).toContainText('X: 20');
  await expect(page.locator('#element-note')).toContainText('adyacentes');
  await expect(page.locator('#fillet-elements')).toBeEnabled();
  const selected = await diagnostics(page);
  await page.waitForTimeout(100);
  const resting = await diagnostics(page);
  await page.locator('#locale-select').selectOption('en');
  await expect(page.locator('#element-summary')).toContainText('Selected vertices: 1');
  expect((await diagnostics(page)).frames).toBe(resting.frames);
  expect((await diagnostics(page)).elements).toEqual(selected.elements);
  await page.locator('#locale-select').selectOption('es');
  await page.screenshot({ path: testInfo.outputPath('atlas-local-selection.png') });
  await clickPoint(page, [0, 0, 10], true);
  expect((await diagnostics(page)).elements.selected).toHaveLength(2);
  expect((await diagnostics(page)).elements.edges).toHaveLength(5);
  expect((await diagnostics(page)).engineRequests).toBe(loaded.engineRequests);
  expect(await state(page)).toEqual(original);
  await page.locator('#selection-filter').selectOption('edge');
  await expect(page.locator('#selection-filter')).toBeEnabled();
  await clickPoint(page, [20, 0, 5]);
  await page.locator('#fillet-elements').click();
  await expect(page.locator('#tool-title')).toHaveText('Redondear selección');
  const form = page.locator('#tool-form');
  await form.locator('[name="radius"]').fill('100');
  await form.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('#message')).toHaveClass(/error/);
  await ready(page);
  expect(await state(page)).toEqual(original);
  await form.locator('[name="radius"]').fill('1');
  await form.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.locator('#message')).toHaveText('Redondeo creado.');
  await ready(page);
  const saved = await state(page), result = saved.objects.at(-1);
  expect(result).toMatchObject({ type: 'fillet', params: { source: 'base', radius: 1, edgeCount: 12 } });
  expect(result.params.edges).toHaveLength(1);
  expect(result.params.edges[0].signature).toBeTruthy();
  const volume = Number((await page.locator('.stats-card strong').textContent()).replace(/[^0-9.\-]/g, ''));
  expect(volume).toBeCloseTo(6000 - (1 - Math.PI / 4) * 10, 1);
  await page.locator('#undo').click(); await ready(page);
  expect(await state(page)).toEqual(original);
  await page.locator('#redo').click(); await ready(page);
  expect(await state(page)).toEqual(saved);
  await page.reload(); await ready(page);
  expect(await state(page)).toEqual(saved);
});

test('inspecciona puntos de una malla y evita aplicarles un redondeo de sólidos', async ({ page }) => {
  const stl = 'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid triangle\n';
  await open(page, { version: 1, name: 'Puntos poligonales', objects: [{ id: 'malla', name: 'Triángulo STL', type: 'import', visible: true, color: '#afc79c', params: { format: 'stl', data: Buffer.from(stl).toString('base64') } }] });
  await page.locator('[data-space="mesh"]').click();
  await page.locator('.object-select[data-id="malla"]').click();
  await page.locator('#selection-filter').selectOption('vertex');
  await expect(page.locator('#element-panel')).toBeVisible();
  await clickPoint(page, [10, 0, 0]);
  expect((await diagnostics(page)).elements.selected).toHaveLength(1);
  await expect(page.locator('#element-note')).toContainText('malla poligonal');
  await expect(page.locator('#fillet-elements')).toBeDisabled();
});
