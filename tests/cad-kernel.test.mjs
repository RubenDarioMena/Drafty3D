import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import initOpenCascade from 'opencascade.js/dist/node.js';
import { initKernel, KERNEL_CAPABILITIES } from '../cad/kernel.js';
import { cross, WORK_PLANES } from '../cad/planes.js';

let kernel;
before(async () => {
  const wasmBinary = await readFile(new URL('../node_modules/opencascade.js/dist/opencascade.full.wasm', import.meta.url));
  const oc = await initOpenCascade({ module: { wasmBinary, print: () => {}, printErr: () => {} } });
  kernel = await initKernel({ oc });
});
after(() => kernel?.dispose());

const document = (objects) => ({ version: 1, name: 'Prueba geométrica', objects });
const box = (id, params = {}, visible = true) => ({ id, name: id, type: 'box', params: { width: 20, depth: 30, height: 10, ...params }, visible });
function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} debería ser ${expected}`);
}

test('planos BRep y círculos exactos permiten extruir y cortar sobre una cara con dependencias', () => {
  const base = box('base', {}, false);
  const mesh = kernel.evaluateDocument(document([base])).meshes[0];
  assert.equal(mesh.faces.filter((face) => face.plane).length, 6);
  const top = mesh.faces.find((face) => cross(face.plane.u, face.plane.v)[2] > 0.99);
  close(top.plane.origin[2], 10);
  const profile = { id: 'perfil', type: 'extrusion', visible: false, params: { points: [], profile: { type: 'circle', center: [10, 15], radius: 3 }, height: 12, reverse: true, support: { source: 'base', face: top.index, faceCount: mesh.faceCount } } };
  const doc = document([base, profile, { id: 'corte', type: 'boolean', params: { operation: 'cut', left: 'base', right: 'perfil' } }]);
  const result = kernel.evaluateDocument(doc);
  close(result.meshes[1].volume, Math.PI * 9 * 12);
  close(result.meshes[2].volume, 6000 - Math.PI * 9 * 10);
  base.params.height = 20;
  const updated = kernel.evaluateDocument(doc);
  close(updated.meshes[1].bounds.max[2], 20, 1e-6);
  close(updated.meshes[2].volume, 12000 - Math.PI * 9 * 12);
  const xz = kernel.evaluateDocument(document([{ id: 'xz', type: 'extrusion', params: { points: [[0, 0], [8, 0], [8, 5], [0, 5]], height: 6, plane: WORK_PLANES.XZ } }]));
  close(xz.meshes[0].volume, 240);
  assert.deepEqual(xz.meshes[0].bounds.min, [0, -6, 0]);
  assert.deepEqual(xz.meshes[0].bounds.max, [8, 0, 5]);
});

test('el motor completo calcula sólidos y mallas BRep con normales orientadas', () => {
  const result = kernel.evaluateDocument(document([
    box('bloque', { x: 4, y: -6, z: 2 }),
    { id: 'cilindro', type: 'cylinder', params: { radius: 3, height: 12, x: 40 } },
    { id: 'esfera', type: 'sphere', params: { radius: 5, x: 60 } },
  ]));
  close(result.meshes[0].volume, 6000);
  close(result.meshes[1].volume, Math.PI * 3 ** 2 * 12);
  close(result.meshes[2].volume, 4 / 3 * Math.PI * 5 ** 3);
  assert.deepEqual(result.meshes[0].bounds, { min: [4, -6, 2], max: [24, 24, 12], size: [20, 30, 10] });
  assert.equal(KERNEL_CAPABILITIES.bindings, 'full');
  for (const mesh of result.meshes) {
    assert.ok(mesh.positions instanceof Float32Array);
    assert.ok(mesh.indices instanceof Uint32Array);
    assert.equal(mesh.positions.length, mesh.normals.length);
    assert.ok(mesh.indices.length > 0);
    for (let index = 0; index < mesh.indices.length; index += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => mesh.indices[index + offset] * 3);
      const u = [0, 1, 2].map((axis) => mesh.positions[b + axis] - mesh.positions[a + axis]);
      const v = [0, 1, 2].map((axis) => mesh.positions[c + axis] - mesh.positions[a + axis]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const dot = cross.reduce((sum, value, axis) => sum + value * (mesh.normals[a + axis] + mesh.normals[b + axis] + mesh.normals[c + axis]), 0);
      assert.ok(dot >= -0.00001, 'La normal debe apuntar al exterior de cada triángulo.');
    }
  }
});

test('cortar, unir e intersectar ejecuta booleanas exactas de OpenCascade', () => {
  const objects = [box('a', { width: 10, depth: 10, height: 10 }, false), box('b', { width: 10, depth: 10, height: 10, x: 5 }, false)];
  for (const [operation, volume] of [['cut', 500], ['fuse', 1500], ['common', 500]]) {
    const doc = document([...objects, { id: 'resultado', type: 'boolean', params: { operation, left: 'a', right: 'b' } }]);
    const result = kernel.evaluateDocument(doc);
    close(result.meshes[2].volume, volume);
    close(result.stats.volume, volume);
  }
  const drilled = kernel.evaluateDocument(document([
    box('bloque', {}, false),
    { id: 'broca', type: 'cylinder', params: { radius: 3, height: 12, x: 10, y: 15, z: -1 }, visible: false },
    { id: 'agujero', type: 'boolean', params: { operation: 'cut', left: 'bloque', right: 'broca' } },
  ]));
  close(drilled.meshes[2].volume, 6000 - Math.PI * 3 ** 2 * 10);
});

test('un croquis extruido, una transformación y un redondeo conservan geometría real', () => {
  const result = kernel.evaluateDocument(document([
    { id: 'croquis', type: 'extrusion', params: { points: [[0, 0], [8, 0], [8, 5], [0, 5]], height: 6 }, visible: false },
    { id: 'movido', type: 'transform', params: { source: 'croquis', x: 20, y: 20, z: 30, rz: 90 } },
    box('caja', {}, false),
    { id: 'redondeado', type: 'fillet', params: { source: 'caja', radius: 1 } },
  ]));
  close(result.meshes[0].volume, 240);
  close(result.meshes[1].volume, 240);
  result.meshes[1].bounds.min.forEach((value, axis) => close(value, [15, 20, 30][axis]));
  result.meshes[1].bounds.max.forEach((value, axis) => close(value, [20, 28, 36][axis]));
  assert.ok(result.meshes[3].volume < 6000 && result.meshes[3].volume > 5900);
  assert.ok(result.meshes[3].faceCount > result.meshes[2].faceCount);
});

test('editar una pieza oculta recalcula sus dependientes sin perder la forma anterior tras un error', () => {
  const original = document([box('a', {}, false), box('b', { width: 10, x: 15 }, false), { id: 'union', type: 'boolean', params: { operation: 'fuse', left: 'a', right: 'b' } }]);
  close(kernel.evaluateDocument(original).meshes[2].volume, 7500);
  const changed = structuredClone(original);
  changed.objects[0].params.width = 30;
  close(kernel.evaluateDocument(changed).meshes[2].volume, 9000);
  const invalid = structuredClone(changed);
  invalid.objects[1].params.height = -1;
  assert.throws(() => kernel.evaluateDocument(invalid), /altura.*mayor que cero/);
  close(kernel.evaluateDocument(changed).meshes[2].volume, 9000);
  assert.throws(() => kernel.evaluateDocument(document([{ id: 'ciclo', type: 'transform', params: { source: 'ciclo' } }])), /circular/);
  assert.throws(() => kernel.evaluateDocument(document([{ id: 'sin fuente', type: 'fillet', params: { source: 'ausente', radius: 1 } }])), /inexistente/);
});

test('un redondeo imposible y booleanas vacías devuelven errores y conservan el documento anterior', () => {
  const original = document([box('caja', {}, false), { id: 'redondeo', type: 'fillet', params: { source: 'caja', radius: 1 } }]);
  const previous = kernel.evaluateDocument(original).meshes[1].volume;
  const invalid = structuredClone(original);
  invalid.objects[1].params.radius = 100;
  assert.throws(() => kernel.evaluateDocument(invalid), /radio menor/);
  close(kernel.evaluateDocument(original).meshes[1].volume, previous);
  const disjoint = document([box('a'), box('b', { x: 100 }), { id: 'vacia', type: 'boolean', params: { left: 'a', right: 'b', operation: 'common' } }]);
  assert.throws(() => kernel.evaluateDocument(disjoint), /no produjo geometría/);
  const removed = document([box('a'), box('b'), { id: 'vacia', type: 'boolean', params: { left: 'a', right: 'b', operation: 'cut' } }]);
  assert.throws(() => kernel.evaluateDocument(removed), /no produjo geometría/);
  close(kernel.evaluateDocument(original).meshes[1].volume, previous);
});

test('50 evaluaciones, ediciones y transferencias mantienen la BRep y los buffers de caché', () => {
  const doc = document([box('bloque')]);
  for (let index = 0; index < 50; index++) {
    doc.objects[0].params.width = 20 + index;
    const result = kernel.evaluateDocument(doc);
    close(result.meshes[0].volume, (20 + index) * 30 * 10);
    assert.equal(result.meshes[0].indices.length, 36);
    const mesh = result.meshes[0];
    const transmitted = structuredClone(result, { transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.indices.buffer] });
    assert.equal(mesh.positions.byteLength, 0);
    assert.equal(transmitted.meshes[0].positions.length, 72);
    const again = kernel.evaluateDocument(doc);
    assert.equal(again.meshes[0].positions.length, 72);
    close(again.meshes[0].volume, transmitted.meshes[0].volume);
    assert.deepEqual(again.stats.bounds.size, [20 + index, 30, 10]);
    assert.equal(kernel.cache.size, 1);
  }
  assert.ok(kernel.exportDocument(doc, 'step').data.length > 0);
});

test('un aborto del cargador WASM rechaza la inicialización aunque ready quede pendiente', async () => {
  await assert.rejects(initKernel({ factory: (options) => {
    options.onAbort('archivo WASM no disponible');
    return new Promise(() => {});
  } }), /interrumpió la carga.*WASM/);
});

test('STEP exporta solo piezas visibles y vuelve a importar sólidos con su precisión', () => {
  const doc = document([box('oculta', { width: 100 }, false), box('visible', { width: 10, depth: 12, height: 5 })]);
  const exported = kernel.exportDocument(doc, 'step');
  assert.equal(exported.mime, 'model/step');
  assert.match(new TextDecoder().decode(exported.data), /ISO-10303-21/);
  const result = kernel.evaluateDocument(document([{ id: 'importado', type: 'import', params: { format: 'step', data: Buffer.from(exported.data).toString('base64') } }]));
  close(result.meshes[0].volume, 600);
  assert.equal(result.meshes[0].solidCount, 1);
  assert.deepEqual(result.meshes[0].bounds.size, [10, 12, 5]);
  assert.equal(kernel.oc.FS.readdir('/').filter((path) => /^(entrada|salida)-/.test(path)).length, 0);
});

test('STL binario contiene triángulos del núcleo y se puede reimportar como malla', () => {
  const exported = kernel.exportDocument(document([box('a')]), 'stl');
  const view = new DataView(exported.data.buffer, exported.data.byteOffset, exported.data.byteLength);
  const triangleCount = view.getUint32(80, true);
  assert.equal(triangleCount, 12);
  assert.equal(exported.data.length, 84 + triangleCount * 50);
  const imported = kernel.evaluateDocument(document([{ id: 'malla', type: 'import', params: { format: 'stl', data: Buffer.from(exported.data).toString('base64') } }]));
  assert.equal(imported.meshes[0].indices.length / 3, triangleCount);
  assert.equal(imported.meshes[0].volume, null, 'Una malla STL no debe presentarse como sólido paramétrico.');
  imported.meshes[0].bounds.size.forEach((value, axis) => close(value, [20, 30, 10][axis], 0.000001));
  assert.equal(imported.meshes[0].isMesh, true);
  assert.equal(imported.meshes[0].faceCount, 1);
});

test('STL de miles de triángulos se importa en una triangulación y permite mover y reexportar', (context) => {
  const source = document([
    box('base', { width: 80, depth: 40, height: 8 }, false),
    { id: 'broca', type: 'cylinder', params: { radius: 6, height: 12, x: 30, y: 20, z: -2 }, visible: false },
    { id: 'soporte', type: 'boolean', params: { operation: 'cut', left: 'base', right: 'broca' } },
    { id: 'perfil', type: 'extrusion', params: { points: [[0, 0], [40, 0], [40, 30], [0, 30]], height: 12 }, visible: false },
    { id: 'redondeo', type: 'fillet', params: { source: 'perfil', radius: 1 } },
    { id: 'copia', type: 'transform', params: { source: 'redondeo', x: 100 } },
  ]);
  const exported = kernel.exportDocument(source, 'stl');
  const triangleCount = new DataView(exported.data.buffer).getUint32(80, true);
  assert.ok(triangleCount >= 3000, `La prueba necesita miles de triángulos; tiene ${triangleCount}.`);
  const imported = document([{ id: 'malla', type: 'import', params: { format: 'stl', data: Buffer.from(exported.data).toString('base64') } }]);
  const start = performance.now();
  const mesh = kernel.evaluateDocument(imported).meshes[0];
  const milliseconds = performance.now() - start;
  context.diagnostic(`STL real: ${triangleCount} triángulos leídos en ${milliseconds.toFixed(1)} ms.`);
  assert.ok(milliseconds < 5000, `Importar ${triangleCount} triángulos tardó ${milliseconds} ms.`);
  assert.equal(mesh.faceCount, 1, 'No se debe reconstruir una cara BRep por triángulo STL.');
  // RWStl elimina triángulos degenerados por el redondeo float32 de STL.
  const parsedTriangles = mesh.indices.length / 3;
  assert.ok(parsedTriangles >= triangleCount * 0.99 && parsedTriangles <= triangleCount);
  assert.equal(mesh.volume, null);
  const moved = structuredClone(imported);
  moved.objects[0].visible = false;
  moved.objects.push({ id: 'movida', type: 'transform', params: { source: 'malla', x: 10, y: 20, z: 30 } });
  const result = kernel.evaluateDocument(moved).meshes[1];
  assert.equal(result.isMesh, true);
  assert.equal(result.indices.length / 3, parsedTriangles);
  for (let axis = 0; axis < 3; axis++) close(result.bounds.min[axis] - mesh.bounds.min[axis], [10, 20, 30][axis], 0.000001);
  const reexported = kernel.exportDocument(moved, 'stl');
  assert.equal(new DataView(reexported.data.buffer).getUint32(80, true), parsedTriangles);
  assert.throws(() => kernel.exportDocument(moved, 'step'), /mallas.*BRep/);
  const fillet = structuredClone(imported);
  fillet.objects.push({ id: 'redondeo', type: 'fillet', params: { source: 'malla', radius: 1 } });
  assert.throws(() => kernel.evaluateDocument(fillet), /STL.*mallas/);
  const boolean = document([...imported.objects, box('bloque'), { id: 'corte', type: 'boolean', params: { operation: 'cut', left: 'bloque', right: 'malla' } }]);
  assert.throws(() => kernel.evaluateDocument(boolean), /STL.*mallas/);
});

test('documentos inválidos y archivos que contienen código se rechazan sin ejecutarlos', () => {
  globalThis.__cadImportExecuted = false;
  const source = 'globalThis.__cadImportExecuted = true;';
  assert.throws(() => kernel.evaluateDocument(document([{ id: 'archivo', type: 'import', params: { format: 'step', data: Buffer.from(source).toString('base64') } }])), /leer.*STEP/);
  assert.equal(globalThis.__cadImportExecuted, false);
  delete globalThis.__cadImportExecuted;
  assert.throws(() => kernel.evaluateDocument({ version: 2, objects: [] }), /versión 1/);
  assert.throws(() => kernel.evaluateDocument(document([box('duplicada'), box('duplicada')])), /único/);
  assert.throws(() => kernel.evaluateDocument(document([box('mal', { width: Infinity })])), /finito/);
  assert.throws(() => kernel.exportDocument(document([]), 'step'), /al menos una pieza/);
});

test('la conversión crea una malla de resolución real sin alterar el CAD original', () => {
  const doc = document([{ id: 'esfera', name: 'Esfera', type: 'sphere', params: { radius: 12 } }]);
  const initial = kernel.evaluateDocument(doc);
  const low = kernel.convertToMesh(doc, { id: 'esfera', quality: 0 });
  const high = kernel.convertToMesh(doc, { id: 'esfera', quality: 3 });
  assert.ok(high.triangles > low.triangles * 2);
  assert.equal(new DataView(high.data.buffer).getUint32(80, true), high.triangles);
  assert.equal(high.data.byteLength, 84 + high.triangles * 50);
  const unchanged = kernel.evaluateDocument(doc);
  assert.equal(unchanged.meshes[0].revision, initial.meshes[0].revision);
  assert.deepEqual(unchanged.meshes[0].positions, initial.meshes[0].positions);
  const snapshot = { id: 'malla', type: 'mesh', params: { data: Buffer.from(high.data).toString('base64'), quality: 3 } };
  const result = kernel.evaluateDocument(document([...doc.objects, snapshot]));
  assert.equal(result.meshes[1].isMesh, true);
  assert.equal(result.meshes[1].triangleCount, high.triangles);
  const oldPositions = result.meshes[1].positions;
  doc.objects[0].params.radius = 20;
  const edited = kernel.evaluateDocument(document([...doc.objects, snapshot]));
  assert.deepEqual(edited.meshes[1].positions, oldPositions, 'editar el origen no altera la instantánea de malla');
  const independent = kernel.evaluateDocument(document([snapshot]));
  assert.deepEqual(independent.meshes[0].positions, oldPositions, 'la malla portable no depende de un CAD oculto');
});

test('los límites de conversión rechazan exceso de triángulos y conservan la geometría válida', () => {
  const doc = document([box('bloque')]);
  const original = kernel.evaluateDocument(doc);
  assert.throws(() => kernel.convertToMesh(doc, { id: 'bloque', quality: -1 }), /resolución/);
  assert.throws(() => kernel.convertToMesh(doc, { id: 'bloque', quality: 1, maxTriangles: 5 }), /presupuesto/);
  assert.deepEqual(kernel.evaluateDocument(doc).meshes[0].positions, original.meshes[0].positions);
});

test('la caché transfiere solo geometrías cambiadas y recalcula sus dependencias', () => {
  const doc = document([box('base'), { id: 'redondeo', type: 'fillet', params: { source: 'base', radius: 1 } }, box('independiente', { x: 50 })]);
  const first = kernel.evaluateDocument(doc);
  const known = first.meshes.map(({ id, revision }) => ({ id, revision }));
  const same = kernel.evaluateDocument(doc, { known });
  assert.ok(same.meshes.every(mesh => mesh.positions === undefined));
  assert.equal(same.stats.triangles, first.stats.triangles);
  doc.objects[0].params.height = 14;
  const changed = kernel.evaluateDocument(doc, { known });
  assert.ok(changed.meshes[0].positions instanceof Float32Array);
  assert.ok(changed.meshes[1].positions instanceof Float32Array);
  assert.equal(changed.meshes[2].positions, undefined);
  assert.equal(changed.meshes[2].revision, first.meshes[2].revision);
});
