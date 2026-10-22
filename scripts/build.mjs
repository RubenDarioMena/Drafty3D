import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { prepareCadSources } from './cad-sources.mjs';
import { prepareSolidcraft } from './solidcraft.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Publish only the static deliverables, preserving their relative links.
const files = [
  'index.html',
  'portal/style.css',
  'portal/app.js',
  'solidcraft/index.html',
  'materializr/index.html',
  'about/index.html',
  'docs/investigacion/propuestas-ui.html',
  'docs/investigacion/comparativa-cad.html',
  'docs/investigacion/disenos-ui.md',
  'docs/investigacion/README.md',
  'docs/investigacion/drafty3d-seleccion-funciones-1.json',
  'docs/investigacion/propuestas-ui-preview.png',
  'docs/cad/ATLAS.md',
];
const contents = await Promise.all(files.map(file => readFile(resolve(root, file))));
await rm(output, { recursive: true, force: true });
for (const [index, file] of files.entries()) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  let data = contents[index];
  if (file === 'materializr/index.html' && process.env.MATERIALIZR_WEB_URL) {
    const url = new URL(process.env.MATERIALIZR_WEB_URL);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('MATERIALIZR_WEB_URL debe ser una URL HTTPS sin credenciales.');
    }
    const href = url.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    data = Buffer.from(data.toString().replace('<!-- MATERIALIZR_REMOTE_LINK -->', `<a class="open-button primary" href="${href}" data-copy="remoteOpen">Abrir Materializr alojado →</a>`));
  }
  await writeFile(target, data);
}
await build({ configFile: resolve(root, 'vite.config.mjs') });
await prepareCadSources(root, resolve(output, 'cad/licenses/source'));
await prepareSolidcraft(root, resolve(output, 'solidcraft/app'));
await writeFile(resolve(output, 'deployment.json'), JSON.stringify({ commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || null, solidcraft: '0.18.3' }) + '\n');

// Verify static links against the actual complete output, including generated apps.
for (const [index, file] of files.entries()) {
  if (!file.endsWith('.html')) continue;
  const html = contents[index].toString('utf8');
  for (const [, href] of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue;
    const path = decodeURIComponent(href.split(/[?#]/)[0]);
    const target = resolve(href.startsWith('/') ? output : dirname(resolve(output, file)), path.replace(/^\//, ''));
    const inside = target === output || target.startsWith(output + sep);
    if (!inside || !(await stat(target).catch(() => null))) {
      throw new Error(`Unpublished local link in ${file}: ${href}`);
    }
  }
}
console.log(`Threeway Avenue: portada, SolidCraft, Atlas y ${files.length} archivos estáticos publicados en dist/. Enlaces verificados.`);
