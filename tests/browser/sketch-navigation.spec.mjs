import { test, expect } from '@playwright/test';

const storageKey = 'drafty3d.document.v1';

async function ready(page) {
  await expect(page.locator('#engine-status')).toContainText('OpenCascade · listo', { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden();
}

async function startSketch(page, plane = 'XY') {
  await page.goto('/cad/');
  await ready(page);
  await page.locator('#new-project').click();
  await ready(page);
  await page.locator('#sketch-button').click();
  await page.locator(`[data-plane="${plane}"]`).click();
  const box = await page.locator('#viewport > canvas').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function diagnostics(page) {
  return page.evaluate(() => window.draftyDiagnostics());
}

async function cameraDrag(page, center, { button = 'right', shift = false } = {}) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(center.x + 60, center.y - 40);
  const before = await diagnostics(page);
  await page.mouse.down({ button });
  await page.mouse.move(center.x + 135, center.y + 10, { steps: 10 });
  await page.mouse.up({ button });
  if (shift) await page.keyboard.up('Shift');
  return before;
}

test('girar, desplazar y acercar conservan el primer punto y la previa entre dos clics', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const center = await startSketch(page);
  await page.mouse.click(center.x - 100, center.y + 70);
  await page.mouse.move(center.x + 60, center.y - 40);
  const pending = await diagnostics(page);
  const measures = await page.locator('#sketch-measures').textContent();
  await cameraDrag(page, center);
  const orbited = await diagnostics(page);
  expect(orbited.camera.position).not.toEqual(pending.camera.position);
  expect(orbited.camera.target).toEqual(pending.camera.target);
  expect(orbited.sketchProfile).toEqual(pending.sketchProfile);
  await expect(page.locator('#sketch-measures')).toHaveText(measures);
  await expect(page.locator('#sketch-status')).not.toHaveText('Contorno cerrado');

  // Each hover can update the live preview; only the following camera gesture
  // must preserve that preview exactly, including after its right-button release.
  for (const options of [{ shift: true }, { button: 'middle' }]) {
    const before = await cameraDrag(page, center, options);
    const after = await diagnostics(page);
    expect(after.camera.target).not.toEqual(before.camera.target);
    const beforeDirection = before.camera.position.map((value, i) => value - before.camera.target[i]);
    const afterDirection = after.camera.position.map((value, i) => value - after.camera.target[i]);
    afterDirection.forEach((value, i) => expect(value).toBeCloseTo(beforeDirection[i], 8));
    expect(after.sketchProfile).toEqual(before.sketchProfile);
  }
  const beforeZoom = await diagnostics(page);
  await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await diagnostics(page)).camera.position).not.toEqual(beforeZoom.camera.position);
  expect((await diagnostics(page)).sketchProfile).toEqual(beforeZoom.sketchProfile);

  const beforeNormal = await diagnostics(page);
  await page.locator('#sketch-normal-view').click();
  const normal = await diagnostics(page);
  expect(normal.camera.position[0]).toBeCloseTo(normal.camera.target[0], 8);
  expect(normal.camera.position[1]).toBeCloseTo(normal.camera.target[1], 8);
  expect(normal.camera.position[2]).toBeGreaterThan(normal.camera.target[2]);
  expect(normal.sketchProfile).toEqual(beforeNormal.sketchProfile);
  expect(normal.engineRequests).toBe(pending.engineRequests);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).objects, storageKey)).toEqual([]);

  // A new left click still completes the same pending rectangle after navigation.
  await page.mouse.click(center.x + 100, center.y - 60);
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  await page.locator('#sketch-finish').click();
  await ready(page);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(saved.objects).toHaveLength(1);
  expect(saved.objects[0].type).toBe('sketch');
  expect(saved.objects[0].params.points[0]).toEqual(pending.sketchProfile.profile.points[0]);
  expect(errors).toEqual([]);
});

test('cancelar la captura restaura el croquis y permite dibujar y navegar de nuevo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const center = await startSketch(page, 'XZ');
  await page.locator('#sketch-preset').click();
  const original = (await diagnostics(page)).sketchProfile;
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y - 40, { steps: 6 });
  expect((await diagnostics(page)).sketchProfile).not.toEqual(original);
  await page.locator('#viewport > canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', button: 0 });
  await page.mouse.up();
  expect((await diagnostics(page)).sketchProfile).toEqual(original);
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');

  await page.mouse.move(center.x + 60, center.y - 40);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(center.x + 100, center.y + 10, { steps: 5 });
  await page.locator('#viewport > canvas').evaluate(canvas => {
    if (canvas.hasPointerCapture(1)) canvas.releasePointerCapture(1);
  });
  await page.mouse.up({ button: 'right' });
  const released = await diagnostics(page);
  await page.mouse.move(center.x - 100, center.y - 50);
  expect((await diagnostics(page)).camera).toEqual(released.camera);
  expect((await diagnostics(page)).sketchProfile).toEqual(original);
  await cameraDrag(page, center);
  expect((await diagnostics(page)).camera.position).not.toEqual(released.camera.position);
  await page.locator('#sketch-normal-view').click();
  await page.locator('#sketch-clear').click();
  await page.mouse.move(center.x - 100, center.y - 60);
  await page.mouse.down();
  await page.mouse.move(center.x + 90, center.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#sketch-status')).toHaveText('Contorno cerrado');
  expect(errors).toEqual([]);
});
