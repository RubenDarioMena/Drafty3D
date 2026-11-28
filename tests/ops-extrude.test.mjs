import { lessonGesture } from './operators.test.mjs';
import { invoke, adjust } from '../learn/src/operators.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fromEdit, toEdit, applySelection } from '../learn/src/mesh.js';
import { compareEdit } from '../learn/src/mesh-compare.js';
import { extrudeRegion, redo } from '../learn/src/ops/extrude.js';

const field = 'redo.mesh.extrude_region_move.TRANSFORM_OT_translate.';
const menu = 'menu.edit_mesh_faces.extrude_faces';

function check(mesh, edit, selection, label) {
  const result = compareEdit(toEdit(mesh), { ...edit, selection });
  assert.ok(result.ok, label + ' ' + result.reason);
}

function params(mesh, values) {
  assert.equal(values[field + 'orient_type'], 'NORMAL');
  assert.equal(values[field + 'value.x'], 0);
  assert.equal(values[field + 'value.y'], 0);
  const distance = values[field + 'value.z'];
  // Both objects have unit scale and no rotation. NORMAL Z follows the selected
  // quad: +Z on the column, then +X on the arm or -Y on the crane boom.
  const faces = mesh.selection.faces;
  assert.equal(faces.size, 1);
  const [a, b, c] = mesh.faces.get([...faces][0]).map(v => mesh.verts.get(v));
  const u = b.map((x, i) => x - a[i]);
  const v = c.map((x, i) => x - a[i]);
  const normal = [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
  const length = Math.hypot(...normal);
  return { faces, offset: normal.map(x => distance * x / length) };
}

function counts(mesh) {
  return [mesh.verts.size, mesh.edges.size, mesh.faces.size];
}

// The recorded tap points are world-space face centers in both lessons.
function tap(mesh, point) {
  const edit = toEdit(mesh);
  const matches = edit.faces.filter(cycle => point.every((x, i) =>
    Math.abs(cycle.reduce((sum, v) => sum + edit.verts[v][i], 0) / cycle.length - x) < 1e-4));
  assert.equal(matches.length, 1);
  const cycle = matches[0];
  const vertices = Array.from(mesh.verts.keys());
  const verts = cycle.map(i => vertices[i]);
  mesh.selection = {
    verts: new Set(verts),
    edges: new Set(verts.map((a, i) => mesh.edgeBetween(a, verts[(i + 1) % verts.length]))),
    faces: new Set([Array.from(mesh.faces.keys())[edit.faces.indexOf(cycle)]]),
  };
}

for (const lesson of ['extrude-arm', 'extrude-crane']) {
  const url = new URL('../learn/public/examples/modeling/' + lesson + '/timeline.json', import.meta.url);
  const { initial, steps } = JSON.parse(await readFile(url, 'utf8'));
  for (const [i, step] of steps.entries()) {
    if (step.id !== menu) continue;
    test(lesson + ' extrusion and redo at steps ' + (i + 1) + '–' + (i + 2), () => {
      const previous = steps[i - 1].after;
      const edit = steps.slice(0, i).findLast(s => s.edit).edit;
      const base = fromEdit(edit, previous.scene.objects.find(o => o.name === edit.object));
      applySelection(base, previous.selection);
      const snapshot = toEdit(base);
      const values = invoke(step.operator, lessonGesture(lesson, i + 1));
      const mesh = extrudeRegion(base, params(base, values));
      check(mesh, step.edit, step.after.selection, 'menu');
      const next = steps[i + 1];
      assert.equal(next.action, 'redo_value');
      const adjusted = redo(base, params(base, adjust(values, next.id, next.value)));
      check(adjusted, next.edit, next.after.selection, 'redo');
      assert.deepEqual(counts(adjusted), counts(mesh));
      assert.deepEqual(toEdit(base), snapshot);
    });
  }

  test(lesson + ' from initial through the final adjustment', () => {
    assert.equal(initial.edit, null);
    let mesh, base, values, reference = initial.edit;
    for (const [i, step] of steps.entries()) {
      if (step.action === 'set_mode') {
        // The first Edit Mode snapshot supplies the cage of the prebuilt object.
        mesh = fromEdit(step.edit, initial.scene.objects.find(o => o.name === step.edit.object));
        applySelection(mesh, step.after.selection);
      } else if (step.action === 'tap') {
        tap(mesh, step.value);
      } else if (step.id === menu) {
        base = mesh;
        values = invoke(step.operator, lessonGesture(lesson, i + 1));
        mesh = extrudeRegion(base, params(base, values));
      } else if (step.action === 'redo_value') {
        values = adjust(values, step.id, step.value);
        mesh = redo(base, params(base, values));
      } else {
        assert.equal(step.action, 'select_mode');
      }
      reference = step.edit ?? reference;
      check(mesh, reference, step.after.selection, step.id);
    }
    assert.deepEqual(counts(mesh), [16, 28, 14]);
  });
}

test('a four-triangle region shares its cap and has walls only on the perimeter', () => {
  const base = fromEdit({
    verts: [[0,0,0], [1,0,0], [1,1,0], [0,1,0], [0.5,0.5,0]],
    edges: [[0,1], [1,2], [2,3], [3,0], [0,4], [1,4], [2,4], [3,4]],
    faces: [[0,1,4], [1,2,4], [2,3,4], [3,0,4]],
  });
  const mesh = extrudeRegion(base, { faces: base.faces.keys(), offset: [0,0,-1] });
  assert.deepEqual(counts(mesh), [9, 16, 8]);
  assert.deepEqual(Object.values(mesh.selection).map(s => s.size), [5, 8, 4]);
  assert.equal(mesh.vertexEdges.has(4), false);
  assert.equal(mesh.edgeBetween(0, 4), undefined);
  for (const [edge, [a, b]] of mesh.edges) {
    assert.equal(mesh.edgeBetween(b, a), edge);
    assert.ok(mesh.vertexEdges.get(a).has(edge));
    assert.ok(mesh.vertexEdges.get(b).has(edge));
    const incident = [...mesh.faces].filter(([, cycle]) => cycle.some((v, i) =>
      mesh.edgeBetween(v, cycle[(i + 1) % cycle.length]) === edge));
    assert.deepEqual(mesh.facesOfEdge(edge), new Set(incident.map(([id]) => id)));
  }
});
