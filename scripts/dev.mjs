import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { prepareSolidcraft } from './solidcraft.mjs';
import { prepareSculptgl } from './sculptgl.mjs';
import { preparePortal } from './portal.mjs';

const staticOnly = process.argv.includes('--static');
const root = path.resolve(fileURLToPath(new URL(staticOnly ? '../dist/' : '../', import.meta.url)));
const generated = path.join(root, '.upstream-cache/portal');
const port = Number(process.env.PORT || (staticOnly ? 4188 : 4187));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gltf': 'model/gltf+json', '.svg': 'image/svg+xml', '.md': 'text/plain', '.txt': 'text/plain', '.ttf': 'font/ttf' };
let vite;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (['/cad', '/solidcraft', '/materializr', '/about', '/solidcraft/app', '/workspace', '/svg-edit', '/sculptgl'].includes(url.pathname)) { res.writeHead(302, { Location: `${url.pathname}/` }); res.end(); return; }
    if (vite && url.pathname.startsWith('/cad/')) {
      vite.middlewares(req, res, () => { res.writeHead(404); res.end('No encontrado'); }); return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (!['index.html', 'portal', 'workspace', 'sculptgl', 'svg-edit', 'solidcraft', 'materializr', 'about', 'cad', 'docs', 'deployment.json'].includes(relative.split('/')[0]) || relative.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404); res.end('No encontrado'); return;
    }
    let target = path.resolve(root, relative);
    if (!staticOnly && relative.startsWith('solidcraft/app/')) {
      target = path.resolve(root, '.upstream-cache/solidcraft-app', relative.slice('solidcraft/app/'.length));
    } else if (!staticOnly && /^(sculptgl\/|svg-edit\/vendor\/|portal\/share\.js$|workspace\/(assets\/|config\.json$))/.test(relative)) {
      target = path.resolve(generated, relative);
    }
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const headers = { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (relative.startsWith('svg-edit/')) {
      headers['Access-Control-Allow-Origin'] = '*';
      if (target.endsWith('.html')) headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-downloads allow-modals';
    }
    const data = req.method === 'HEAD' ? '' : await readFile(target);
    res.writeHead(200, headers);
    res.end(data);
  } catch { res.writeHead(404); res.end('No encontrado'); }
});
if (!staticOnly) {
  await Promise.all([
    prepareSolidcraft(root, path.join(root, '.upstream-cache/solidcraft-app')),
    prepareSculptgl(root, path.join(generated, 'sculptgl')),
    preparePortal(root, generated),
  ]);
  vite = await createServer({ configFile: path.join(root, 'vite.config.mjs'), server: { middlewareMode: true, hmr: { server, path: '__hmr' } }, appType: 'mpa' });
}
server.listen(port, '127.0.0.1', () => console.log(`Threeway Avenue · http://127.0.0.1:${port}/`));
async function close() { await vite?.close(); server.close(); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
