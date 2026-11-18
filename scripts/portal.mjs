import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, loadEnv } from 'vite';

export async function preparePortal(root, destination) {
  const env = loadEnv('production', root, 'VITE_SUPABASE_');
  const config = {
    url: env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_REF.supabase.co',
    publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || 'YOUR_SUPABASE_PUBLISHABLE_KEY',
  };
  if (config.publishableKey !== 'YOUR_SUPABASE_PUBLISHABLE_KEY' &&
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY debe ser una clave publicable sb_publishable_.');
  }
  let endpoint;
  try { endpoint = new URL(config.url); } catch {}
  if (!endpoint || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('VITE_SUPABASE_URL debe ser el origen HTTPS del proyecto, sin credenciales.');
  }
  await mkdir(resolve(destination, 'workspace'), { recursive: true });
  await writeFile(resolve(destination, 'workspace/config.json'), JSON.stringify(config) + '\n');
  await build({
    configFile: false,
    root,
    base: '/workspace/assets/',
    build: {
      outDir: resolve(destination, 'workspace/assets'),
      rollupOptions: {
        input: resolve(root, 'workspace/app.js'),
        output: { entryFileNames: 'app.js', chunkFileNames: '[name]-[hash].js' },
      },
    },
  });

  const svgPackage = resolve(root, 'node_modules/svgedit');
  const svgAssets = resolve(destination, 'svg-edit/vendor');
  await mkdir(svgAssets, { recursive: true });
  for (const item of ['Editor.js', 'Editor.js.map', 'extensions', 'images', 'svgedit.css']) {
    await cp(resolve(svgPackage, 'dist/editor', item), resolve(svgAssets, item), { recursive: true });
  }
  for (const item of ['LICENSE-MIT.txt', 'licenseInfo.json']) {
    await cp(resolve(svgPackage, item), resolve(svgAssets, item));
  }
  await build({
    configFile: false,
    root,
    build: {
      outDir: resolve(destination, 'portal'),
      emptyOutDir: false,
      lib: { entry: resolve(root, 'portal/share.js'), formats: ['es'], fileName: () => 'share.js' },
    },
  });
}
