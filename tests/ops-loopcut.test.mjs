import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fromEdit, toEdit } from '../learn/src/mesh.js';
import { compareEdit } from '../learn/src/mesh-compare.js';
import { cube, grid } from '../learn/src/primitives.js';
import { loopCut } from '../learn/src/ops/loopcut.js';
import { translate, resize, rotate } from '../learn/src/ops/transform.js';

function expected(step) {
  return { ...step.edit, selection: step.after.selection };
}

function check(mesh, step) {
  const result = compareEdit(toEdit(mesh), expected(step));
  assert.ok(result.ok, step.id + ' ' + result.reason);
}

function clickedEdge(edit, step) {
  const hits = edit.edges.flatMap(([a, b], id) =>
    edit.verts[a].every((x, axis) => Math.abs((x + edit.verts[b][axis]) / 2 - step.value[axis]) < 1e-4)
      ? [id] : []);
  assert.equal(hits.length, 1);
  assert.ok(step.ring.includes(hits[0]));
  return hits[0];
}

function evaluate(base, steps, index) {
  const click = steps[3], step = steps[index];
  if (step.action === 'loop_cut' || step.operator === 'mesh.loopcut_slide') {
    const edge = base.indexMap.edges[clickedEdge(steps[0].edit, click)];
    const params = { edge };
    if (step.action === 'redo_value') {
      assert.equal(step.id, 'redo.mesh.loopcut_slide.MESH_OT_loopcut.number_cuts');
      params.numberCuts = step.value;
    }
    return loopCut(base, params);
  }

  const action = steps[5];
  assert.equal(action.action, 'menu');
  assert.equal(action.operator, 'transform.resize');
  // Step 6 omits the modal drag. Its input is recorded in loop_cut_lesson in build_scene.py.
  const value = action.value ?? [1.1, 1.1, 1];
  const factors = [...value];
  for (const adjustment of steps.slice(6, index + 1)) {
    assert.equal(adjustment.action, 'redo_value');
    const [, axis] = /^redo\.transform\.resize\.value\.([xyz])$/.exec(adjustment.id);
    factors['xyz'.indexOf(axis)] = adjustment.value;
  }
  return resize(base, { value: factors, constraintAxis: [true, true, false] });
}

for (const name of ['loop-cut-barrel', 'loop-cut-vase']) {
  const url = new URL('../learn/public/examples/modeling/' + name + '/timeline.json', import.meta.url);
  const { steps } = JSON.parse(await readFile(url, 'utf8'));
  const transform = steps[0].after.scene.objects.find(o => o.name === steps[0].edit.object);
  const initial = () => fromEdit(expected(steps[0]), transform);

  test(name + ' accepts every edge in the recorded ring', () => {
    const base = initial();
    const ring = new Set(steps[3].ring.map(i => base.indexMap.edges[i]));
    for (const edge of ring) {
      assert.deepEqual(base.edgeRing(edge), ring);
      for (const [index, numberCuts] of [[3, 1], [4, steps[4].value]]) {
        check(loopCut(base, { edge, numberCuts }), steps[index]);
      }
    }
    const other = [...base.edges.keys()].find(e => !ring.has(e));
    assert.ok(!compareEdit(toEdit(loopCut(base, { edge: other })), expected(steps[3])).ok);
  });

  test(name + ' slides two loops along the cylinder sides', () => {
    const base = initial();
    // Blender 5.3 loopcut_slide with two cuts and a positive half-slide on these rails.
    const cut = loopCut(base, { edge: base.indexMap.edges[steps[3].ring[0]], numberCuts: 2, edgeSlide: 0.5 });
    const edit = toEdit(cut);
    const heights = edit.selection.verts.map(v => edit.verts[v][2]);
    for (const z of [1 / 3, 1]) assert.equal(heights.filter(h => Math.abs(h - z) < 1e-5).length, 12);
  });

  test(name + ' isolated steps 4–8', () => {
    for (let index = 3; index <= 7; index++) {
      const base = index < 5 ? initial() : fromEdit(expected(steps[4]), transform);
      const snapshot = toEdit(base);
      check(evaluate(base, steps, index), steps[index]);
      assert.deepEqual(toEdit(base), snapshot);
    }
  });

  test(name + ' chained steps 4–8 from the first edit', () => {
    let mesh = initial(), base;
    for (let index = 3; index <= 7; index++) {
      if (steps[index].action !== 'redo_value') base = mesh;
      mesh = evaluate(base, steps, index);
      check(mesh, steps[index]);
    }
  });
}

test('quad rings cross faces and edge loops stop at boundaries and poles', () => {
  const mesh = fromEdit(grid({ x_subdivisions: 3, y_subdivisions: 2 }));
  const edge = (a, b) => mesh.edgeBetween(a, b);
  assert.deepEqual(mesh.edgeLoop(edge(5, 6)), new Set([edge(4, 5), edge(5, 6), edge(6, 7)]));
  assert.deepEqual(mesh.edgeRing(edge(5, 6)), new Set([edge(1, 2), edge(5, 6), edge(9, 10)]));
  const box = fromEdit(cube());
  assert.deepEqual(box.edgeLoop(0), new Set([0]));
  const cut = loopCut(box, { edge: 0 });
  assert.deepEqual(cut.edgeLoop([...cut.selection.edges][0]), cut.selection.edges);
});

test('slide follows adjacent vertices on consistently oriented rails', () => {
  const base = fromEdit(grid({ x_subdivisions: 3, y_subdivisions: 1 }));
  const edge = base.edgeBetween(0, 4);
  const ring = base.edgeRing(edge);
  const [a, b] = base.edges.get(Math.min(...ring));
  for (const edgeSlide of [-0.5, 0.5]) {
    const cut = loopCut(base, { edge, numberCuts: 3, edgeSlide });
    const heights = [...cut.selection.verts].map(v => cut.verts.get(v)[1]);
    for (let k = 1; k <= 3; k++) {
      const y = base.verts.get(a)[1] + (k - edgeSlide) / 4 * (base.verts.get(b)[1] - base.verts.get(a)[1]);
      assert.equal(heights.filter(h => h === y).length, ring.size);
    }
    for (const other of ring) assert.ok(compareEdit(toEdit(cut),
      toEdit(loopCut(base, { edge: other, numberCuts: 3, edgeSlide }))).ok);
  }
});

test('smooth cuts use the endpoint normals and Blender subdivision falloff', () => {
  const base = fromEdit(cube());
  const edge = base.edgeBetween(0, 1);
  // Quarter-cut positions from Blender 5.3 on the default cube.
  for (const [falloff, x, z] of [
    ['LINEAR', 1.204786, 0.530187], ['SMOOTH', 1.307179, 0.545281],
    ['SPHERE', 1.382136, 0.556330], ['ROOT', 1.349592, 0.551533],
    ['SHARP', 1.255983, 0.537734], ['INVERSE_SQUARE', 1.358376, 0.552827],
  ]) {
    const cut = loopCut(base, { edge, numberCuts: 3, smoothness: 1, falloff });
    assert.ok([...cut.selection.verts].some(v => {
      const p = cut.verts.get(v);
      return Math.hypot(p[0] - x, p[1] - x, p[2] - z) < 1e-5;
    }), falloff);
  }
});

test('global transforms use the selection median on a rotated, nonuniformly scaled object', () => {
  const verts = [[1, 3, 4], [5, 3, 4], [6, 3, 4], [0, 9, 8]];
  const base = fromEdit({ verts, edges: [[0, 1], [1, 2]], faces: [],
    selection: { verts: [0, 1, 2], edges: [0, 1], faces: [] } },
  { location: [3, 1, -2], rotation: [30, 20, -70], scale: [2, 0.75, 3] });
  const cases = [
    [translate(base, { value: [5, 2, 1], constraintAxis: [false, true, false] }), verts.map(([x]) => [x, 5, 4])],
    [resize(base, { value: 2, constraintAxis: [true, false, false] }), verts.map(([x]) => [4 + 2 * (x - 4), 3, 4])],
    [rotate(base, { value: Math.PI / 2, constraintAxis: [false, false, true] }), verts.map(([x]) => [4, x - 1, 4])],
  ];
  for (const [mesh, points] of cases) {
    points[3] = verts[3];
    assert.deepEqual(mesh.selection, base.selection);
    toEdit(mesh).verts.forEach((p, i) => assert.ok(Math.hypot(...p.map((x, j) => x - points[i][j])) < 1e-10));
  }
});
