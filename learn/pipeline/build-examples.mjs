// Regenerates the Drafty3D Learn examples: Blender (bpy 5.3) records each lesson,
// then gltf-transform Draco-compresses the step meshes for the app.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pipeline = resolve(root, 'learn/pipeline');
const out = resolve(pipeline, '.out');
const examples = resolve(root, 'learn/public/examples');
const fixtures = resolve(root, 'tests/fixtures/learn');
const python = resolve(pipeline, '.venv/bin/python');

if (!process.argv.includes('--skip-blender')) {
  if (!(await stat(python).catch(() => null))) {
    throw new Error('Falta el entorno de Blender. Crear con: python3.13 -m venv learn/pipeline/.venv && learn/pipeline/.venv/bin/pip install -r learn/pipeline/requirements.txt');
  }
  await rm(out, { recursive: true, force: true });
  execFileSync(python, [resolve(pipeline, 'blender/build.py'), '--', out], { stdio: 'inherit' });
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

await rm(examples, { recursive: true, force: true });
await rm(fixtures, { recursive: true, force: true });
await mkdir(examples, { recursive: true });
await copyFile(join(out, 'blender-ui.json'), join(examples, 'blender-ui.json'));

const lessons = [];
for (const module of await readdir(join(out), { withFileTypes: true })) {
  if (!module.isDirectory()) continue;
  for (const example of await readdir(join(out, module.name))) {
    const source = join(out, module.name, example);
    const target = join(examples, module.name, example);
    const fixtureDir = join(fixtures, module.name, example);
    await mkdir(target, { recursive: true });
    await mkdir(fixtureDir, { recursive: true });
    const timeline = JSON.parse(await readFile(join(source, 'timeline.json'), 'utf8'));
    let raw = 0;
    let packed = 0;
    for (const file of await readdir(join(source, 'raw'))) {
      const document = await io.read(join(source, 'raw', file));
      await document.transform(draco({ method: 'edgebreaker' }));
      const bytes = await io.writeBinary(document);
      // bpy's own exporter reports success while skipping Draco; never trust a flag, check the file.
      if (!(await io.readBinary(bytes)).getRoot().listExtensionsUsed().some(ext => ext.extensionName === 'KHR_draco_mesh_compression')) {
        throw new Error(`Draco no se aplicó a ${module.name}/${example}/${file}`);
      }
      await writeFile(join(target, file), bytes);
      raw += (await stat(join(source, 'raw', file))).size;
      packed += bytes.byteLength;
    }
    for (const file of await readdir(join(source, 'renders'))) {
      await copyFile(join(source, 'renders', file), join(fixtureDir, file));
    }
    await writeFile(join(target, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n');
    lessons.push({
      module: timeline.module, example: timeline.example, mode: timeline.mode, title: timeline.title,
      variantOf: timeline.variantOf ?? null, timeline: `${module.name}/${example}/timeline.json`,
    });
    console.log(`${module.name}/${example}: ${timeline.steps.length} pasos, mallas ${(raw / 1024).toFixed(0)} KiB → ${(packed / 1024).toFixed(0)} KiB con Draco`);
  }
}
lessons.sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'watch' ? -1 : 1));
await writeFile(join(examples, 'index.json'), JSON.stringify({ lessons }, null, 2) + '\n');
