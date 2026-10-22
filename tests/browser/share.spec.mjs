import { test, expect } from '@playwright/test';

test('SolidCraft comparte JSON, STEP y STL sin modificar el diseño', async ({ page }) => {
  const requests = [];
  await page.route('**/a-4-a/c.js?*', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.V_C.push({b:1});' }));
  await page.route('**/api/share-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":true}' }));
  await page.route('**/api/share', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"sent":true}' });
  });
  await page.goto('/solidcraft/');
  const frame = page.frameLocator('.editor-frame');
  await expect(frame.locator('#solidcraft_loading')).toBeHidden({ timeout: 90000 });
  const before = await page.evaluate(async () => {
    const api = document.querySelector('.editor-frame').contentWindow.solidcraft;
    await api.execute('solid.box', { length: 10, width: 12, height: 8 });
    const state = await api.inspect();
    return { revision: state.revision, path: state.path };
  });
  await page.getByRole('button', { name: 'Compartir…' }).click();
  await page.locator('#share-email').fill('recipient@example.com');
  for (const format of ['json', 'step', 'stl']) {
    await page.locator('#share-format').selectOption(format);
    await expect(page.locator('#share-send')).toBeEnabled();
    await page.locator('#share-send').click();
    await expect.poll(() => requests.length).toBe(['json', 'step', 'stl'].indexOf(format) + 1);
    await expect(page.locator('#share-status')).toContainText('Archivo enviado');
  }
  expect(requests.map(item => item.format)).toEqual(['json', 'step', 'stl']);
  expect(requests.map(item => item.filename)).toEqual(['Untitled.json', 'Untitled.step', 'Untitled.stl']);
  expect(requests.every(item => Buffer.from(item.content, 'base64').length > 0)).toBe(true);
  expect(JSON.parse(Buffer.from(requests[0].content, 'base64').toString('utf8'))).toEqual(expect.any(Object));
  expect(Buffer.from(requests[1].content, 'base64').toString('utf8')).toMatch(/^ISO-10303-21;/);
  const stl = Buffer.from(requests[2].content, 'base64');
  expect(stl.length).toBe(84 + stl.readUInt32LE(80) * 50);
  const after = await page.evaluate(async () => {
    const api = document.querySelector('.editor-frame').contentWindow.solidcraft;
    const state = await api.inspect();
    return { revision: state.revision, path: state.path };
  });
  expect(after).toEqual(before);
});
