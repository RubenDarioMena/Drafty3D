import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const storageKey = 'drafty3d.document.v1';
const test = base.extend({
  runtimeErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'El recorrido de croquis no debe producir excepciones sin manejar.').toEqual([]);
  }, { auto: true }],
});

async function ready(page) {
  await expect(page.locator('#engine-status')).toContainText('OpenCascade · listo', { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
}

async function documentState(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function volume(page) {
  return Number((await page.locator('.stats-card strong').textContent()).replace(/[^0-9.\-]/g, ''));
}

async function openNewSketch(page) {
  await page.goto('/cad/');
  await ready(page);
  await page.locator('#new-project').click();
  await ready(page);
  await expect(page.locator('#start-sketch')).toBeVisible();
  await page.locator('#start-sketch').click();
  await page.locator('[data-plane="XY"]').click();
  await expect(page.locator('#sketch-profile-fields')).toBeVisible();
  await expect(page.locator('#sketch-height')).toBeHidden();
}

async function exactRectangle(page, { u = 0, v = 0, width = 40, depth = 30 } = {}) {
  for (const [key, value] of Object.entries({ u, v, width, depth })) await page.locator(`#sketch-${key}`).fill(String(value));
  await page.locator('#sketch-apply-dimensions').click();
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  await expect(page.locator('#sketch-error')).toBeEmpty();
}

async function finishSketch(page) {
  await page.locator('#sketch-finish').click();
  await expect(page.locator('#sketch-panel')).toBeHidden();
  await ready(page);
}

async function applyVolume(page, height) {
  await expect(page.locator('#sketch-volume-fields')).toBeVisible();
  await page.locator('#sketch-height').fill(String(height));
  await page.locator('#sketch-create').click();
  await expect(page.locator('#sketch-panel')).toBeHidden();
  await ready(page);
}

async function canvasCenter(page) {
  const box = await page.locator('#viewport > canvas').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('desde cero: guardar un croquis, extruir, perforar, editar la fuente y reabrir el proyecto', async ({ page }, testInfo) => {
  await openNewSketch(page);
  await exactRectangle(page);
  expect((await documentState(page)).objects).toHaveLength(0);
  await finishSketch(page);
  const profileOnly = await documentState(page);
  expect(profileOnly.objects).toHaveLength(1);
  const source = profileOnly.objects[0];
  expect(source).toMatchObject({ type: 'sketch', visible: true, params: { points: [[0, 0], [40, 0], [40, 30], [0, 30]] } });
  expect(source.params.height).toBeUndefined();
  await expect(page.locator('.stats-card')).toHaveCount(0);
  await expect(page.locator('#extrude-profile')).toBeEnabled();
  await page.reload();
  await ready(page);
  expect(await documentState(page)).toEqual(profileOnly);
  await page.locator(`.object-select[data-id="${source.id}"]`).click();
  await page.locator('#extrude-profile').click();
  await expect(page.locator('#sketch-profile-fields')).toBeHidden();

  // Un gesto de dibujo accidental durante la vista previa de volumen no cambia el perfil.
  const c = await canvasCenter(page);
  await page.mouse.move(c.x - 75, c.y - 50);
  await page.mouse.down();
  await page.mouse.move(c.x + 65, c.y + 70, { steps: 6 });
  await page.mouse.up();
  await applyVolume(page, 8);
  const extruded = await documentState(page);
  expect(extruded.objects).toHaveLength(2);
  expect(extruded.objects[0]).toEqual({ ...source, visible: false });
  const baseSolid = extruded.objects[1];
  expect(baseSolid).toMatchObject({ type: 'extrusion', params: { sketch: source.id, height: 8 } });
  expect(baseSolid.params.points).toBeUndefined();
  expect(await volume(page)).toBe(40 * 30 * 8);

  await page.locator('[data-view="top"]').click();
  await page.locator('#sketch-button').click();
  await page.locator('#pick-face').click();
  const faceCenter = await canvasCenter(page);
  await page.mouse.click(faceCenter.x, faceCenter.y);
  await expect(page.locator('#sketch-plane-name')).toContainText('Cara de');
  await page.locator('#sketch-circle').click();
  await page.mouse.move(faceCenter.x + 1, faceCenter.y + 1);
  const coordinates = (await page.locator('#sketch-coordinates').textContent()).match(/U:\s*([-\d.]+)\s*·\s*V:\s*([-\d.]+)/);
  expect(coordinates).not.toBeNull();
  const center = [Number(coordinates[1]) + 0.25, Number(coordinates[2]) - 0.5];
  await page.locator('#sketch-u').fill(String(center[0]));
  await page.locator('#sketch-v').fill(String(center[1]));
  await page.locator('#sketch-radius').fill('3');
  await page.locator('#sketch-apply-dimensions').click();
  await page.locator('#sketch-next').click();
  await expect(page.locator('#sketch-effect')).toHaveValue('cut');
  await expect(page.locator('#sketch-reverse')).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('croquis-circular-corte.png') });
  await applyVolume(page, 10);
  const withHole = await documentState(page);
  expect(withHole.objects).toHaveLength(5);
  const holeSource = withHole.objects.find(object => object.type === 'sketch' && object.id !== source.id);
  expect(holeSource.params).toMatchObject({ support: { source: baseSolid.id }, points: [], profile: { type: 'circle', center, radius: 3 } });
  const result = withHole.objects.at(-1);
  expect(result).toMatchObject({ type: 'boolean', params: { operation: 'cut', left: baseSolid.id } });
  expect(await volume(page)).toBeCloseTo(40 * 30 * 8 - Math.PI * 3 ** 2 * 8, 1);

  // Editar desde la extrusión debe abrir su croquis fuente, sin duplicar operaciones.
  await page.locator(`.object-select[data-id="${baseSolid.id}"]`).click();
  await page.locator('#edit-profile').click();
  await expect(page.locator('#sketch-width')).toHaveValue('40');
  await expect(page.locator('#sketch-depth')).toHaveValue('30');
  await page.locator('#sketch-width').fill('50.5');
  await page.locator('#sketch-depth').fill('30.25');
  await finishSketch(page);
  const changed = await documentState(page);
  expect(changed.objects).toHaveLength(5);
  expect(changed.objects.find(object => object.id === source.id).params.points).toEqual([[0, 0], [50.5, 0], [50.5, 30.25], [0, 30.25]]);
  await page.locator(`.object-select[data-id="${result.id}"]`).click();
  const changedVolume = 50.5 * 30.25 * 8 - Math.PI * 3 ** 2 * 8;
  expect(await volume(page)).toBeCloseTo(changedVolume, 1);
  await page.locator('#undo').click();
  await ready(page);
  expect(await documentState(page)).toEqual(withHole);
  expect(await volume(page)).toBeCloseTo(40 * 30 * 8 - Math.PI * 3 ** 2 * 8, 1);
  await page.locator('#redo').click();
  await ready(page);
  expect(await documentState(page)).toEqual(changed);
  expect(await volume(page)).toBeCloseTo(changedVolume, 1);

  const pendingDownload = page.waitForEvent('download');
  await page.locator('#save-project').click();
  const download = await pendingDownload;
  const path = testInfo.outputPath('croquis-y-pieza.cad.json');
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(changed);
  await page.locator('#new-project').click();
  await ready(page);
  await page.locator('#file-input').setInputFiles(path);
  await expect(page.locator('#message')).toContainText('abierto.');
  await ready(page);
  expect(await documentState(page)).toEqual(changed);
  await page.locator(`.object-select[data-id="${result.id}"]`).click();
  expect(await volume(page)).toBeCloseTo(changedVolume, 1);
  await page.reload();
  await ready(page);
  expect(await documentState(page)).toEqual(changed);
});

test('las medidas inválidas y cancelar un borrador no modifican el documento', async ({ page }) => {
  await openNewSketch(page);
  const empty = await documentState(page);
  await page.locator('#sketch-width').fill('0');
  await page.locator('#sketch-finish').click();
  await expect(page.locator('#sketch-panel')).toBeVisible();
  expect(await page.locator('#sketch-width').evaluate(input => input.checkValidity())).toBe(false);
  expect(await documentState(page)).toEqual(empty);
  await page.locator('#sketch-width').fill('40');
  await page.locator('#sketch-u').fill('999999');
  await page.locator('#sketch-apply-dimensions').click();
  await expect(page.locator('#sketch-error')).toContainText('límite');
  expect(await documentState(page)).toEqual(empty);
  await page.locator('#sketch-cancel').click();
  await expect(page.locator('#sketch-panel')).toBeHidden();
  expect(await documentState(page)).toEqual(empty);

  await page.locator('#start-sketch').click();
  await page.locator('[data-plane="XY"]').click();
  await exactRectangle(page, { u: -2.5, v: 3.25, width: 40.5, depth: 30.25 });
  await finishSketch(page);
  const saved = await documentState(page);
  await page.locator('#edit-profile').click();
  await page.locator('#sketch-width').fill('52.75');
  await page.locator('#sketch-apply-dimensions').click();
  await page.locator('#sketch-next').click();
  await page.locator('#sketch-height').fill('18.5');
  await page.locator('#sketch-cancel').click();
  expect(await documentState(page)).toEqual(saved);
  await page.locator('#edit-profile').click();
  await expect(page.locator('#sketch-u')).toHaveValue('-2.5');
  await expect(page.locator('#sketch-v')).toHaveValue('3.25');
  await expect(page.locator('#sketch-width')).toHaveValue('40.5');
  await expect(page.locator('#sketch-depth')).toHaveValue('30.25');
  await page.locator('#sketch-cancel').click();
  await page.locator('#extrude-sketch-button').click();
  await applyVolume(page, 2.5);
  expect(await volume(page)).toBeCloseTo(40.5 * 30.25 * 2.5, 1);
});

test('un proyecto antiguo con perfil dentro de la extrusión conserva edición, volumen e identidad', async ({ page }) => {
  const legacy = { version: 1, name: 'Extrusión antigua', objects: [{
    id: 'legacy-extrusion', name: 'Placa antigua', type: 'extrusion', visible: true, color: '#56b6ff',
    params: { points: [[10, 20], [-30, 20], [-30, -10], [10, -10]], profile: null, height: 8, x: 0, y: 0, z: 0 },
  }] };
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: storageKey, value: JSON.stringify(legacy) });
  await page.goto('/cad/');
  await ready(page);
  expect(await documentState(page)).toEqual(legacy);
  await page.locator('.object-select[data-id="legacy-extrusion"]').click();
  expect(await volume(page)).toBe(40 * 30 * 8);
  await page.locator('#edit-profile').click();
  await expect(page.locator('#sketch-rectangle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sketch-u')).toHaveValue('10');
  await expect(page.locator('#sketch-v')).toHaveValue('20');
  await page.locator('#sketch-width').fill('45.5');
  await finishSketch(page);
  const edited = await documentState(page);
  expect(edited.objects).toHaveLength(1);
  expect(edited.objects[0]).toMatchObject({ id: 'legacy-extrusion', type: 'extrusion', params: { points: [[10, 20], [-35.5, 20], [-35.5, -10], [10, -10]], height: 8 } });
  expect(edited.objects[0].params.sketch).toBeUndefined();
  expect(await volume(page)).toBeCloseTo(45.5 * 30 * 8, 1);
  await page.locator('#edit-profile').click();
  await page.locator('#sketch-next').click();
  await expect(page.locator('#sketch-effect')).toBeDisabled();
  await applyVolume(page, 4);
  expect((await documentState(page)).objects).toHaveLength(1);
  expect(await volume(page)).toBeCloseTo(45.5 * 30 * 4, 1);
  await page.locator('#undo').click();
  await ready(page);
  expect(await documentState(page)).toEqual(edited);
  await page.reload();
  await ready(page);
  expect(await documentState(page)).toEqual(edited);
});
