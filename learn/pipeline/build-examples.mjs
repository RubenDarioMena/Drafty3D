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
const blenderApp = process.env.BLENDER_APP ?? resolve(pipeline, '.blender/blender-5.3.0-linux-x64/blender');

// --skip-blender reuses everything in .out; --only=modifiers|sculpt records one module again.
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
const record = module => !process.argv.includes('--skip-blender') && (!only || only === module);
const exists = path => stat(path).then(() => true, () => false);

if (record('modifiers')) {
  if (!(await exists(python))) {
    throw new Error('Falta el entorno de Blender. Crear con: python3.13 -m venv learn/pipeline/.venv && learn/pipeline/.venv/bin/pip install -r learn/pipeline/requirements.txt');
  }
  await rm(join(out, 'modifiers'), { recursive: true, force: true });
  execFileSync(python, [resolve(pipeline, 'blender/build.py'), '--', out], { stdio: 'inherit' });
}

if (record('sculpt')) {
  // Strokes need Blender's windowed event loop: the full app on a virtual display, driven by xdotool.
  if (!(await exists(blenderApp))) throw new Error('Falta Blender 5.3 (app completa). Descargar con: learn/pipeline/get-blender.sh');
  for (const tool of ['xvfb-run', 'xdotool']) {
    try { execFileSync('which', [tool]); } catch { throw new Error(`Falta ${tool}: apt-get install -y xvfb xdotool`); }
  }
  // LEARN_SCULPT_ONLY=<lesson> records that lesson again and keeps the others.
  if (!process.env.LEARN_SCULPT_ONLY) await rm(join(out, 'sculpt'), { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const start = join(out, 'start.blend');
  execFileSync(blenderApp, ['-b', '--factory-startup', '--python-expr',
    `import bpy; bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(start)})`],
  { stdio: 'ignore' });
  // A fixed 1920×1080 screen keeps brush sizes in pixels, and therefore the strokes, reproducible.
  // One Blender process per lesson: brush settings live in the session, so each lesson starts from factory brushes.
  const script = await readFile(resolve(pipeline, 'blender/build_sculpt.py'), 'utf8');
  const names = (process.env.LEARN_SCULPT_ONLY ?? script.match(/^LESSONS = \(([^)]*)\)/m)[1]).match(/\w+/g);
  for (const lesson of names) {
    execFileSync('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', blenderApp, '--factory-startup', '--gpu-backend', 'opengl',
      start, '--python', resolve(pipeline, 'blender/build_sculpt.py'), '--', out],
    { stdio: 'inherit', env: { ...process.env, LEARN_SCULPT_ONLY: lesson } });
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

await rm(examples, { recursive: true, force: true });
await rm(fixtures, { recursive: true, force: true });
await mkdir(examples, { recursive: true });
const ui = JSON.parse(await readFile(join(out, 'blender-ui.json'), 'utf8'));
ui.sculpt = JSON.parse(await readFile(join(out, 'sculpt-ui.json'), 'utf8'));
await writeFile(join(examples, 'blender-ui.json'), JSON.stringify(ui, null, 2) + '\n');

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
    if (timeline.module === 'sculpt') await checkSharedTopology(target, timeline);
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
// Home lists modules in this order, then each Watch lesson (easiest first) followed by its Your turn variant.
const MODULE_ORDER = ['modifiers', 'sculpt'];
const WATCH_ORDER = ['cup', 'twisted-column', 'mirror-table', 'array-stairs', 'boolean-birdhouse', 'curve-garden-path', 'stack-block', 'project-ladder', 'pebble-buddy', 'horned-buddy', 'rock', 'belted-pebble', 'leaning-buddy', 'bobble-pebble', 'wrinkled-pebble', 'troll-head'];
const rank = (list, item) => (list.indexOf(item) + list.length + 1) % (list.length + 1);
lessons.sort((a, b) => (rank(MODULE_ORDER, a.module) - rank(MODULE_ORDER, b.module))
  || (rank(WATCH_ORDER, a.variantOf ?? a.example) - rank(WATCH_ORDER, b.variantOf ?? b.example))
  || (a.mode === b.mode ? 0 : a.mode === 'watch' ? -1 : 1));
await writeFile(join(examples, 'index.json'), JSON.stringify({ lessons }, null, 2) + '\n');

// A stroke moves vertices but never changes the mesh's connectivity (no Dyntopo), so the app plays
// it as a morph between two of Blender's results. Prove each stroke's pair still shares one topology
// after Draco, which is free to reorder vertices. Remesh and Multires Subdivide rebuild the mesh on
// purpose; the app swaps those meshes instead of morphing.
async function checkSharedTopology(folder, timeline) {
  const signature = async name => {
    const primitive = (await io.read(join(folder, name))).getRoot().listMeshes()[0].listPrimitives()[0];
    return `${primitive.getAttribute('POSITION').getCount()}:${Array.from(primitive.getIndices().getArray()).join(',')}`;
  };
  let previous = timeline.initial.mesh;
  for (const step of timeline.steps) {
    if (!step.mesh) continue;
    if (step.action === 'stroke' && (await signature(previous)) !== (await signature(step.mesh))) {
      throw new Error(`${folder}/${step.mesh}: Draco cambió el orden de los vértices`);
    }
    previous = step.mesh;
  }
}
