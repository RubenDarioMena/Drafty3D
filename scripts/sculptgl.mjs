import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'vite';

const tar = promisify(execFile);
const revision = '8e45dafc0f7906e5238dfffc1a2df742bd25f29d';
const sha256 = '761ffd4b3cfb68aacce353d363c7eba34059976922a96d4948a80fe74e4b2af8';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const url = `https://codeload.github.com/stephomi/sculptgl/tar.gz/${revision}`;

export async function prepareSculptgl(root, destination) {
  const cache = resolve(root, '.upstream-cache');
  await mkdir(cache, { recursive: true });
  const archive = resolve(cache, `sculptgl-${revision}.tar.gz`);
  const scratch = await mkdtemp(resolve(cache, 'sculptgl-build-'));
  try {
    let bytes = await readFile(archive).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (!bytes || hash(bytes) !== sha256) {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`SculptGL: HTTP ${response.status}.`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== sha256) throw new Error('SculptGL: la descarga no coincide con el SHA-256 fijado.');
      const tmp = resolve(scratch, 'sculptgl.tar.gz');
      await writeFile(tmp, bytes);
      await rename(tmp, archive);
    }
    await tar('tar', ['-xzf', archive, '-C', scratch, '--strip-components=1']);
    // The workspace already has a save/export workflow. Drop the upstream Sketchfab account action.
    const menu = resolve(scratch, 'src/gui/GuiFiles.js');
    const upstream = await readFile(menu, 'utf8');
    const sketchfabButton = "    menu.addButton(TR('sketchfabTitle'), this._ctrlGui, 'exportSketchfab');\n";
    if (!upstream.includes(sketchfabButton)) throw new Error('SculptGL: cambió el menú upstream.');
    await writeFile(menu, upstream.replace(sketchfabButton, ''));

    const entry = resolve(scratch, 'drafty3d.js');
    await cp(resolve(root, 'sculptgl/editor.js'), entry);
    const yagui = resolve(root, 'node_modules/yagui/src');
    await build({
      configFile: false,
      root,
      plugins: [{
        name: 'sculptgl-imports',
        enforce: 'pre',
        resolveId(id, importer) {
          if (!importer || id.startsWith('.') || id.startsWith('/')) return;
          if (importer.startsWith(yagui + '/')) return resolve(yagui, id + '.js');
          if (!importer.startsWith(scratch + '/')) return;
          if (id === 'yagui') return '\0sculptgl-yagui';
          return [resolve(scratch, 'src', id), resolve(scratch, 'lib', id)]
            .flatMap(candidate => [candidate + '.js', candidate])
            .find(candidate => /\.(js|glsl)$/.test(candidate) && existsSync(candidate));
        },
        async load(id) {
          if (id === '\0sculptgl-yagui') {
            return `import GuiMain from ${JSON.stringify(resolve(yagui, 'GuiMain.js'))}; export default { GuiMain };`;
          }
          if (id === resolve(scratch, 'lib/zip.js')) {
            // Upstream Webpack treats this pre-module script's top-level this as exports.
            const source = await readFile(id, 'utf8');
            if (!source.trimEnd().endsWith('})(this);')) throw new Error('SculptGL: cambió la biblioteca ZIP.');
            const body = source.trimEnd().slice(0, -'this);'.length);
            return `const legacyZip = {};\n${body}legacyZip);\nexport const zip = legacyZip.zip;`;
          }
          if (id.startsWith(scratch + '/') && id.endsWith('.glsl')) {
            return `export default ${JSON.stringify(await readFile(id, 'utf8'))};`;
          }
        },
      }],
      build: {
        outDir: destination,
        emptyOutDir: true,
        lib: { entry, formats: ['iife'], name: 'SculptGL', fileName: () => 'editor.js' },
      },
    });
    for (const asset of ['css', 'resources', 'worker', 'sculptgl.js.LICENSE.txt']) {
      await cp(resolve(scratch, 'app', asset), resolve(destination, asset), { recursive: true });
    }
    await cp(resolve(scratch, 'LICENSE'), resolve(destination, 'LICENSE'));
    await cp(resolve(root, 'sculptgl/index.html'), resolve(destination, 'index.html'));
    await writeFile(resolve(destination, 'HOSTING.json'), JSON.stringify({ source: url, revision, sha256 }) + '\n');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
