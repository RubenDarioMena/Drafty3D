import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLearn } from './learn.mjs';
import { prepareSolidcraft } from './solidcraft.mjs';
import { prepareSculptgl } from './sculptgl.mjs';
import { preparePortal } from './portal.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Publish only the static deliverables, preserving their relative links.
const files = [
  'index.html',
  'portal/style.css',
  'portal/app.js',
  'workspace/style.css',
  'svg-edit/index.html',
  'svg-edit/editor.js',
  'solidcraft/index.html',
  'about/index.html',
  'docs/investigacion/propuestas-ui.html',
  'docs/investigacion/comparativa-cad.html',
  'docs/investigacion/disenos-ui.md',
  'docs/investigacion/README.md',
  'docs/investigacion/drafty3d-seleccion-funciones-1.json',
  'docs/investigacion/propuestas-ui-preview.png',
];
const contents = await Promise.all(files.map(file => readFile(resolve(root, file))));
await rm(output, { recursive: true, force: true });
for (const [index, file] of files.entries()) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents[index]);
}
// /workspace/ keeps serving the design workspace for old links; the page itself lives at /.
await writeFile(resolve(output, 'workspace/index.html'), contents[files.indexOf('index.html')]);
await Promise.all([
  prepareSolidcraft(root, resolve(output, 'solidcraft/app')),
  prepareSculptgl(root, resolve(output, 'sculptgl')),
  preparePortal(root, output),
  prepareLearn(root, resolve(output, 'learn')),
]);
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
console.log(`Drafty3D: portal y editores preparados en dist/. Enlaces verificados.`);
