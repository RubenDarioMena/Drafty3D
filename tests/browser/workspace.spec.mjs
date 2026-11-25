import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

const sourceSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect id="original" x="10" y="10" width="20" height="20" fill="red"/></svg>';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'persona@example.test' };
const endpoint = 'https://cloud.example.test';
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
  'test',
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');

async function fakeCloud(page) {
  const projects = [];
  const files = new Map();
  const versions = [];
  const blobs = new Map();
  await page.route('**/workspace/config.json', route => route.fulfill({
    json: { url: endpoint, publishableKey: 'sb_publishable_test' },
  }));
  await page.route(endpoint + '/**', async route => {
    const req = route.request();
    const { pathname, searchParams } = new URL(req.url());
    const method = req.method();
    const json = data => route.fulfill({ json: data });
    if (pathname === '/auth/v1/token') return json({ access_token: token, refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600, user });
    expect(req.headers().authorization).toBe('Bearer ' + token);
    if (pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (pathname === '/rest/v1/design_projects') {
      if (method === 'GET') return json(projects);
      if (method === 'POST') {
        const project = { id: crypto.randomUUID(), ...req.postDataJSON() };
        projects.push(project);
        return json(project);
      }
    }
    if (pathname === '/rest/v1/design_project_files') {
      const project = searchParams.get('project_id').slice(3);
      return json(Array.from(files.values()).filter(file => file.project_id === project));
    }
    if (pathname === '/rest/v1/design_file_versions') {
      if (searchParams.has('file_id')) {
        return json(versions.filter(version => version.file_id === searchParams.get('file_id').slice(3)).reverse());
      }
      return json(versions.map(version => ({ ...version, design_files: { name: files.get(version.file_id).name } })));
    }
    if (pathname === '/rest/v1/rpc/save_design_version') {
      const { p_project_id, p_file_id, p_name, p_size_bytes, p_version_id, p_expected_version } = req.postDataJSON();
      const previous = files.get(p_file_id);
      expect(p_expected_version).toBe(previous?.latest_version_id ?? null);
      const object_path = `${user.id}/${p_project_id}/${p_file_id}/${p_version_id}`;
      expect(blobs.get(object_path)?.byteLength).toBe(p_size_bytes);
      const version = {
        id: p_version_id, file_id: p_file_id, object_path,
        version_number: (previous?.version_number ?? 0) + 1,
        size_bytes: p_size_bytes, created_at: '2026-11-17T13:00:00Z',
      };
      versions.push(version);
      files.set(p_file_id, { ...version, id: p_file_id, latest_version_id: p_version_id, project_id: p_project_id, name: p_name });
      return route.fulfill({ status: 204 });
    }
    if (pathname.includes('/design-files/')) {
      const objectPath = pathname.split('/design-files/')[1];
      if (method === 'GET') return route.fulfill({ body: blobs.get(objectPath), contentType: 'application/octet-stream' });
      const request = new Request(req.url(), { method, headers: req.headers(), body: req.postDataBuffer() });
      const uploaded = (await request.formData()).get('');
      blobs.set(objectPath, Buffer.from(await uploaded.arrayBuffer()));
      return json({ Key: 'design-files/' + objectPath });
    }
    throw new Error('Unexpected request ' + method + ' ' + pathname);
  });
  return { versions, blobs };
}

async function login(page) {
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill('test-interface-only');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function project(page) {
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await page.getByLabel('Nombre del proyecto').fill('Maqueta');
  await page.getByRole('button', { name: 'Guardar proyecto' }).click();
  await expect(page.getByRole('heading', { name: 'Maqueta' })).toBeVisible();
}

async function getDownload(page, locator) {
  const event = page.waitForEvent('download');
  await locator.click();
  const download = await event;
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

test('el espacio con placeholders es ligero, cabe en móvil y SculptGL exporta en modo local', async ({ page }) => {
  const requests = [];
  await page.route('**/workspace/config.json', route => route.fulfill({
    json: { url: 'https://YOUR_PROJECT_REF.supabase.co', publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY' },
  }));
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Supabase pendiente');
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeDisabled();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(requests.filter(path => /^\/(sculptgl|solidcraft|svg-edit)\//.test(path))).toEqual([]);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Abrir SculptGL' }).click();
  await expect(page.frameLocator('iframe').locator('#canvas')).toBeVisible();
  const native = await getDownload(page, page.locator('#editor-download'));
  expect(native.name).toBe('SculptGL.sgl');
  expect(native.bytes.readUInt32LE(0)).toBe(3);
  await page.locator('#format').selectOption('obj');
  const obj = await getDownload(page, page.locator('#editor-download'));
  expect(obj.bytes.toString()).toMatch(/^s 0\no mesh_0/);
  await page.locator('#back').click();
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('el SVG abre en el editor aislado, conserva el original y se respalda con todas las versiones', async ({ page, context }) => {
  const { versions, blobs } = await fakeCloud(page);
  await page.goto('/');
  await login(page);
  await project(page);
  await page.locator('#files-input').setInputFiles({ name: 'plano.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(sourceSvg) });
  await expect(page.getByText('plano.svg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir en SVG-Edit' }).click();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', /allow-scripts/);
  await expect(page.locator('iframe')).not.toHaveAttribute('sandbox', /allow-same-origin/);
  await expect(page.frameLocator('iframe').locator('#original')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar en proyecto' }).click();
  await expect(page.getByText('Se añadirá una versión de plano.svg.')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#editor-status')).toContainText('plano.svg guardado');
  expect(versions).toHaveLength(2);
  expect(blobs.get(versions[0].object_path).toString()).toBe(sourceSvg);
  expect(blobs.get(versions[1].object_path).toString()).toContain('id="original"');
  await page.locator('#back').click();
  await page.getByRole('button', { name: 'Versiones' }).click();
  await expect(page.getByText('Original', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Se guardó una nueva versión');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const backup = await getDownload(page, page.getByRole('button', { name: 'Descargar respaldo' }));
  expect(backup.name).toBe('Maqueta.zip');
  const archive = unzipSync(backup.bytes);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  expect(manifest.files.map(file => file.version)).toEqual([1, 2, 3]);
  expect(strFromU8(archive[manifest.files[0].path])).toBe(sourceSvg);
  expect(strFromU8(archive[manifest.files[2].path])).toBe(sourceSvg);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)])).toEqual([[], []]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Maqueta' })).toHaveCount(0);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Maqueta' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByText('plano.svg', { exact: true })).toHaveCount(0);
});

test('SolidCraft exporta un diseño editable y reabre el mismo archivo desde un proyecto', async ({ page }) => {
  await fakeCloud(page);
  await page.goto('/');
  await login(page);
  await project(page);
  await page.getByRole('button', { name: 'Abrir SolidCraft' }).click();
  await expect(page.locator('#editor-download')).toBeEnabled({ timeout: 90_000 });
  const inspectDesign = async () => page.evaluate(async () => {
    const api = document.querySelector('#editor-frame iframe').contentWindow.solidcraft;
    return api.inspect();
  });
  await page.evaluate(() => document.querySelector('#editor-frame iframe').contentWindow.solidcraft
    .execute('solid.box', { length: 7, width: 8, height: 9, body_name: 'Pieza de prueba' }));
  const original = await inspectDesign();
  await page.getByRole('button', { name: 'Guardar en proyecto' }).click();
  await page.getByLabel('Nombre del archivo').fill('pieza');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#editor-status')).toContainText('pieza.json guardado');
  await page.locator('#back').click();
  await page.getByRole('button', { name: 'Abrir en SolidCraft' }).click();
  await expect(page.locator('#editor-download')).toBeEnabled({ timeout: 90_000 });
  const restored = await inspectDesign();
  expect(JSON.stringify(restored)).toContain('Pieza de prueba');
  expect(restored.bodies).toEqual(original.bodies);
  expect(await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) {
      if (name.startsWith('drafty3d-editor-')) return false;
    }
    return true;
  })).toBe(true);
});

test('SculptGL abre el OBJ de un proyecto y conserva su original al guardar el SGL', async ({ page }) => {
  const { versions, blobs } = await fakeCloud(page);
  await page.goto('/');
  await login(page);
  await project(page);
  const triangle = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  await page.locator('#files-input').setInputFiles({ name: 'cara.obj', mimeType: 'text/plain', buffer: triangle });
  await page.getByRole('button', { name: 'Abrir en SculptGL' }).click();
  const obj = await getDownload(page, page.locator('#editor-download'));
  expect(obj.bytes.toString().match(/^v /gm)).toHaveLength(3);
  await page.locator('#format').selectOption('sgl');
  await page.getByRole('button', { name: 'Guardar en proyecto' }).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#editor-status')).toContainText('cara.sgl guardado');
  expect(blobs.get(versions[0].object_path)).toEqual(triangle);
  expect(blobs.get(versions[1].object_path).readUInt32LE(0)).toBe(3);
});
