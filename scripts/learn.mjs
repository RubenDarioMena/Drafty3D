import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Builds Drafty3D Learn with relative paths so the same files work at /learn/,
// on the githack preview branch and inside the Android app (no network needed).
export async function prepareLearn(root, destination) {
  await build({
    configFile: false,
    root: resolve(root, 'learn'),
    base: './',
    cacheDir: resolve(root, 'node_modules/.vite-learn'),
    logLevel: 'warn',
    build: {
      outDir: destination,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: { index: resolve(root, 'learn/index.html'), verify: resolve(root, 'learn/verify.html') },
      },
    },
  });
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const destination = resolve(root, process.argv[2] || 'dist/learn');
  await prepareLearn(root, destination);
  console.log(`Drafty3D Learn preparado en ${destination}`);
}
