import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const staticOnly = process.argv.includes('--static');
const root = fileURLToPath(new URL(staticOnly ? '../dist/' : '../', import.meta.url));
const port = Number(process.env.PORT || (staticOnly ? 4188 : 4187));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain', '.txt': 'text/plain' };
let vite;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/cad') { res.writeHead(302, { Location: '/cad/' }); res.end(); return; }
    if (vite && url.pathname.startsWith('/cad/')) {
      vite.middlewares(req, res, () => { res.writeHead(404); res.end('No encontrado'); }); return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (!['index.html', 'cad', 'docs'].includes(relative.split('/')[0]) || relative.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404); res.end('No encontrado'); return;
    }
    let target = path.resolve(root, relative);
    if (!target.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? '' : await readFile(target));
  } catch { res.writeHead(404); res.end('No encontrado'); }
});
if (!staticOnly) vite = await createServer({ configFile: path.join(root, 'vite.config.mjs'), server: { middlewareMode: true, hmr: { server, path: '__hmr' } }, appType: 'mpa' });
server.listen(port, '127.0.0.1', () => console.log(`Drafty3D Atlas · puerto ${port} · /cad/`));
async function close() { await vite?.close(); server.close(); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
