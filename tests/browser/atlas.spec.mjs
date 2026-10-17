import { test, expect } from '@playwright/test';

const key = 'drafty3d.document.v1';
async function ready(page) {
  await expect(page.locator('#engine-status')).toContainText('OpenCascade · listo', { timeout: 90000 });
  await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 90000 });
}
async function open(page) { await page.goto('/cad/'); await ready(page); }
async function doc(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function support(page) { await page.locator('[data-id="soporte"]').click(); }

test('Atlas agrupa Documento y Operación a la izquierda; paneles ajustables y herramientas en el mismo panel', async ({ page }) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const tree = await page.locator('.model-panel').boundingBox();
  const operation = await page.locator('.inspector').boundingBox();
  const viewport = await page.locator('#viewport').boundingBox();
  expect(operation.x).toBe(tree.x);
  expect(operation.y).toBeGreaterThan(tree.y + tree.height);
  expect(viewport.x).toBeGreaterThan(operation.x + operation.width);
  await page.locator('#sidebar-resize').focus(); await page.keyboard.press('ArrowRight');
  expect((await page.locator('.sidebar').boundingBox()).width).toBeGreaterThan(tree.width);
  await page.locator('#toggle-operation').click();
  await expect(page.locator('#operation-content')).toBeHidden();
  await page.locator('[data-create="box"]').click();
  await expect(page.locator('#operation-form-panel')).toBeVisible();
  await expect(page.locator('#tool-title')).toHaveText('Crear bloque');
  await page.locator('#tool-form input[name="width"]').fill('42');
  await page.locator('#tool-form').getByRole('button', {name:'Aplicar',exact:true}).click();
  await ready(page);
  expect((await doc(page)).objects.at(-1).params.width).toBe(42);
  await page.keyboard.press('Control+k');
  await page.locator('#command-query').fill('cilindro');
  await page.locator('#command-results button').click();
  await expect(page.locator('#tool-title')).toHaveText('Crear cilindro');
  await page.locator('#cancel-tool').click();
  expect((await doc(page)).objects).toHaveLength(4);
  expect(errors).toEqual([]);
});

test('convertir exige previa, permite guardar y cancelar, conserva el CAD y soporta undo/redo y recarga', async ({ page }, testInfo) => {
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await open(page); await support(page);
  const before = await doc(page);
  await page.locator('#mesh-button').click();
  await expect(page.locator('#mesh-confirm')).toBeEnabled({timeout:90000});
  await expect(page.locator('#mesh-estimate')).toContainText('triángulos');
  await expect(page.locator('#mesh-panel')).toContainText('Conservaremos el original oculto');
  await page.screenshot({path:testInfo.outputPath('atlas-conversion.png')});
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#mesh-save-first').click();
  const backup=await downloadPromise;
  const chunks=[]; for await (const chunk of await backup.createReadStream()) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(before);
  await page.locator('#mesh-cancel').click();
  expect(await doc(page)).toEqual(before);
  await page.locator('#mesh-button').click();
  await expect(page.locator('#mesh-confirm')).toBeEnabled({timeout:90000});
  await page.locator('#mesh-quality').fill('0');
  await expect(page.locator('#mesh-confirm')).toBeDisabled();
  await page.locator('#mesh-preview').click();
  await expect(page.locator('#mesh-confirm')).toBeEnabled({timeout:90000});
  await page.locator('#mesh-confirm').click(); await ready(page);
  const converted = await doc(page);
  expect(converted.objects).toHaveLength(4);
  expect(converted.objects.find(object=>object.id==='soporte').visible).toBe(false);
  expect(converted.objects.at(-1).type).toBe('mesh');
  expect(converted.objects.at(-1).params.quality).toBe(0);
  await expect(page.locator('#inspector-content')).toContainText('Malla independiente');
  await page.locator('#undo').click(); await ready(page);
  expect(await doc(page)).toEqual(before);
  await page.locator('#redo').click(); await ready(page);
  expect(await doc(page)).toEqual(converted);
  await page.reload(); await ready(page);
  expect(await doc(page)).toEqual(converted);
  expect(errors).toEqual([]);
});

test('el render descansa en reposo y reutiliza geometría al editar nombre/color; cámara no llama al motor', async ({ page }, testInfo) => {
  await open(page); await support(page);
  await page.waitForTimeout(200);
  const first=await page.evaluate(()=>window.draftyDiagnostics());
  await page.waitForTimeout(350);
  expect((await page.evaluate(()=>window.draftyDiagnostics())).frames-first.frames).toBeLessThanOrEqual(1);
  await page.locator('#properties-form input[name="name"]').fill('Soporte verde');
  await page.locator('#properties-form input[name="color"]').fill('#3c864f');
  await page.locator('#properties-form').getByRole('button',{name:'Aplicar cambios'}).click();
  await ready(page);
  const cosmetic=await page.evaluate(()=>window.draftyDiagnostics());
  expect(cosmetic.geometryUploads).toBe(first.geometryUploads);
  expect(cosmetic.engineRequests).toBe(first.engineRequests);
  const box=await page.locator('#viewport>canvas').boundingBox();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.65); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7+90,box.y+box.height*.65+40,{steps:12}); await page.mouse.up();
  const moved=await page.evaluate(()=>window.draftyDiagnostics());
  expect(moved.engineRequests).toBe(first.engineRequests);
  expect(moved.geometryUploads).toBe(first.geometryUploads);
  expect(moved.frames).toBeGreaterThan(cosmetic.frames);
  await testInfo.attach('render-metrics', { body: Buffer.from(JSON.stringify({ first, cosmetic, moved }, null, 2)), contentType: 'application/json' });
});
