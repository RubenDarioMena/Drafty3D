import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { prepareCadSources } from './cad-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// Publish only the static deliverables, preserving their relative links.
const files = [
  'index.html',
  'docs/investigacion/propuestas-ui.html',
  'docs/investigacion/comparativa-cad.html',
  'docs/investigacion/disenos-ui.md',
  'docs/investigacion/README.md',
  'docs/investigacion/drafty3d-seleccion-funciones-1.json',
  'docs/investigacion/propuestas-ui-preview.png',
  'docs/cad/ATLAS.md',
];
const contents = await Promise.all(files.map(file => readFile(resolve(root, file))));
const published = new Set(files.map(file => resolve(root, file)));
published.add(resolve(root, 'cad'));
for (const [index, file] of files.entries()) {
  if (!file.endsWith('.html')) continue;
  const html = contents[index].toString('utf8');
  for (const [, href] of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue;
    const path = decodeURIComponent(href.split(/[?#]/)[0]);
    const target = resolve(href.startsWith('/') ? root : dirname(resolve(root, file)), path.replace(/^\//, ''));
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep) || !published.has(target)) {
      throw new Error(`Unpublished local link in ${file}: ${href}`);
    }
  }
}
await rm(output, { recursive: true, force: true });
for (const file of files) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
await build({ configFile: resolve(root, 'vite.config.mjs') });
await prepareCadSources(root, resolve(output, 'cad/licenses/source'));
console.log(`Drafty3D: CAD Atlas y ${files.length} documentos publicados en dist/. Enlaces locales verificados.`);
