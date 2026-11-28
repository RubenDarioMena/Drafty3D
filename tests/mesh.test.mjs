import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fromEdit, toEdit, applySelection } from '../learn/src/mesh.js';
import { compareEdit } from '../learn/src/mesh-compare.js';

const examples = new URL('../learn/public/examples/', import.meta.url);
async function timeline(path) {
  return JSON.parse(await readFile(new URL(path + '/timeline.json', examples), 'utf8'));
}

function transform(scene, edit) {
  const object = scene.objects.find(o => o.name === edit.object);
  assert.ok(object, edit.object);
  return object;
}

function check(actual, expected, label = '') {
  const result = compareEdit(actual, expected);
  assert.ok(result.ok, label + ' ' + result.reason);
}

for (const module of ['basics', 'modeling']) {
  test(module + ' world-space edit snapshots round trip', async () => {
    for (const dir of await readdir(new URL(module + '/', examples), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const { initial, steps } = await timeline(module + '/' + dir.name);
      for (const [i, state] of [initial, ...steps].entries()) {
        if (!state.edit) continue;
        const obj = transform(state.after?.scene ?? initial.scene, state.edit);
        check(toEdit(fromEdit(state.edit, obj), obj), state.edit, dir.name + ' step ' + i);
      }
    }
  });
}

test('select-parts steps 1–9 update selection on the same mesh', async () => {
  const { steps } = await timeline('modeling/select-parts');
  const edit = steps[0].edit;
  const mesh = fromEdit(edit, transform(steps[0].after.scene, edit));
  for (const { after } of steps.slice(0, 9)) {
    applySelection(mesh, after.selection, mesh.indexMap);
    check(toEdit(mesh), { ...edit, selection: after.selection });
  }
});

const square = {
  verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
  edges: [[0, 1], [1, 2], [2, 3], [3, 0]], faces: [[0, 1, 2, 3]],
  selection: { verts: [1], edges: [0], faces: [0] },
};

test('vertex and element order, edge direction and cycle start are arbitrary', () => {
  check({ verts: square.verts.toReversed(), edges: [[0, 3], [1, 0], [2, 1], [3, 2]],
    faces: [[1, 0, 3, 2]], selection: { verts: [2], edges: [3], faces: [0] } }, square);
});

test('comparator rejects changed edges, reversed winding and different selection', () => {
  for (const change of [
    { edges: [[0, 2], ...square.edges.slice(1)] },
    { faces: [[3, 2, 1, 0]] },
    { selection: { ...square.selection, edges: [1] } },
  ]) assert.equal(compareEdit({ ...square, ...change }, square).ok, false);
});

test('world distance tolerance', () => {
  for (const [delta, ok] of [[2e-4, false], [5e-5, true]]) {
    const actual = structuredClone(square);
    actual.verts[0][0] += delta;
    assert.equal(compareEdit(actual, square).ok, ok);
  }
});

test('coincident vertices use adjacency and distinct reference indices', () => {
  const verts = [[0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const edit = { verts, edges: [[0, 2], [1, 3]], faces: [] };
  check({ ...edit, edges: [[1, 2], [0, 3]] }, edit);
  assert.equal(compareEdit({ ...edit, verts: [verts[0], verts[1], verts[2], verts[2]] }, edit).ok, false);
});

test('world-to-local conversion uses XYZ Euler degrees after local scale', () => {
  const mesh = fromEdit({ verts: [[16, 22, 34]], edges: [], faces: [] },
    { location: [10, 20, 30], scale: [2, 4, 6], rotation: [90, 0, 90] });
  const point = mesh.verts.get(0);
  assert.ok(point instanceof Float64Array);
  assert.ok(point.every(v => Math.abs(v - 1) < 1e-12));
});

test('a loose edge and three polygons sharing an edge retain their incidences', () => {
  const edit = {
    verts: [[0, 0, 0], [1, 0, 0], [2, 1, 0], [1, 2, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [-1, 0, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [5, 1], [1, 6], [6, 0], [0, 7]],
    faces: [[0, 1, 2, 3, 4], [1, 0, 5], [0, 1, 6]],
  };
  const mesh = fromEdit(edit);
  assert.deepEqual([...mesh.facesOfEdge(mesh.edgeBetween(1, 0))], [0, 1, 2]);
  assert.equal(mesh.facesOfEdge(mesh.edgeBetween(0, 7)).size, 0);
  assert.deepEqual([...mesh.vertexEdges.get(0)], [0, 4, 5, 8, 9]);
  const remap = cycle => cycle.map(i => edit.verts.length - 1 - i);
  check({ verts: edit.verts.toReversed(), edges: edit.edges.toReversed().map(remap),
    faces: edit.faces.toReversed().map(remap), selection: { verts: [7], edges: [9], faces: [2] } },
  { ...edit, selection: { verts: [0], edges: [0], faces: [0] } });
});
