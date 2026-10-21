import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

// Official static release. No Rust toolchain, remote iframe, or runtime CDN dependency.
export const solidcraftRelease = Object.freeze({
  version: '0.18.3',
  repository: 'https://github.com/tangency-labs/solidcraft',
  url: 'https://github.com/tangency-labs/solidcraft/releases/download/v0.18.3/solidcraft-web-0.18.3.zip',
  sha256: '5b87271b3fcae232f7e84fcc777e8dcb36657a0712ec659030f9c5b5bf44c2ae',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function prepareSolidcraft(root, destination) {
  const cache = path.join(root, '.upstream-cache');
  const cached = path.join(cache, `solidcraft-web-${solidcraftRelease.version}.zip`);
  await mkdir(cache, { recursive: true });
  let bytes;
  try { bytes = await readFile(cached); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes || hash(bytes) !== solidcraftRelease.sha256) {
    console.log(`Descargando SolidCraft ${solidcraftRelease.version} (paquete web oficial)…`);
    const response = await fetch(solidcraftRelease.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`SolidCraft: HTTP ${response.status}.`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== solidcraftRelease.sha256) throw new Error('SolidCraft: el SHA-256 no coincide con la versión fijada.');
    await writeFile(`${cached}.tmp`, bytes);
    await rename(`${cached}.tmp`, cached);
  }
  const prefix = `solidcraft-web-${solidcraftRelease.version}/`;
  const entries = unzipSync(bytes);
  if (!entries[`${prefix}index.html`] || !entries[`${prefix}LICENSE-MIT`]) {
    throw new Error('SolidCraft: estructura de paquete inesperada.');
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(prefix)) throw new Error(`SolidCraft: archivo fuera del paquete: ${name}`);
    if (name.endsWith('/')) continue;
    const relative = name.slice(prefix.length);
    if (relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.')) {
      throw new Error(`SolidCraft: ruta de archivo no válida: ${name}`);
    }
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  // Keep upstream's index, SRI hashes, build manifest and scoped service worker intact.
  await writeFile(path.join(destination, 'HOSTING.json'), JSON.stringify({
    ...solidcraftRelease,
    modifications: 'None. Official web release served under /solidcraft/app/. Gateway wrapper is separate.',
  }, null, 2) + '\n');
  console.log(`SolidCraft ${solidcraftRelease.version}: paquete verificado y preparado en ${destination}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await prepareSolidcraft(root, path.join(root, '.upstream-cache/solidcraft-app'));
}
