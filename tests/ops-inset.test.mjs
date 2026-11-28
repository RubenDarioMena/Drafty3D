import { lessonGesture } from './operators.test.mjs';
import { invoke, adjust } from '../learn/src/operators.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fromEdit, toEdit, applySelection } from '../learn/src/mesh.js';
import { compareEdit } from '../learn/src/mesh-compare.js';
import { faceCenter, faceNormal, normalOffset, regionNormal } from '../learn/src/ops/geometry.js';
import { insetRegion } from '../learn/src/ops/inset.js';
import { extrudeRegion } from '../learn/src/ops/extrude.js';

const inset = 'redo.mesh.inset.';
const translate = 'redo.mesh.extrude_region_move.TRANSFORM_OT_translate.';

function evaluate(base, values) {
  if (inset + 'thickness' in values) {
    for (const [name, expected] of Object.entries({
      use_boundary: true, use_even_offset: true, use_relative_offset: false,
      use_edge_rail: false, use_outset: false, use_select_inset: false,
      use_individual: false, use_interpolate: true, depth: 0,
    })) assert.equal(values[inset + name], expected, name);
    return insetRegion(base, { thickness: values[inset + 'thickness'] });
  }
  assert.equal(values[translate + 'orient_type'], 'NORMAL');
  assert.equal(values[translate + 'value.x'], 0);
  assert.equal(values[translate + 'value.y'], 0);
  return extrudeRegion(base, {
    offset: normalOffset(base, base.selection.faces, values[translate + 'value.z']),
  });
}

function check(mesh, edit, step) {
  const result = compareEdit(toEdit(mesh), { ...edit, selection: step.after.selection });
  assert.ok(result.ok, step.id + ' ' + result.reason);
}

for (const lesson of ['inset-planter', 'inset-drawer']) {
  const url = new URL('../learn/public/examples/modeling/' + lesson + '/timeline.json', import.meta.url);
  const { steps } = JSON.parse(await readFile(url, 'utf8'));
  const transform = steps[0].after.scene.objects.find(o => o.name === steps[0].edit.object);
  for (const i of [3, 5]) {
    test(lesson + ' ' + steps[i].id + ' and its adjustment', () => {
      const edit = steps.slice(0, i).findLast(step => step.edit).edit;
      const base = fromEdit(edit, transform);
      applySelection(base, steps[i - 1].after.selection);
      const snapshot = toEdit(base);
      let values;
      for (const step of steps.slice(i, i + 2)) {
        values = step.action === 'menu' ? invoke(step.operator, lessonGesture(lesson, i + 1)) : adjust(values, step.id, step.value);
        check(evaluate(base, values), step.edit, step);
        assert.deepEqual(toEdit(base), snapshot);
      }
    });
  }

  test(lesson + ' from the first edit through the final inward extrusion', () => {
    let edit = steps[0].edit;
    let mesh = fromEdit(edit, transform);
    applySelection(mesh, steps[0].after.selection);
    let base, values;
    for (const [i, step] of steps.entries()) {
      if (step.action === 'tap') {
        const matches = [...mesh.faces.keys()].filter(face => faceCenter(mesh, face).every((x, i) =>
          Math.abs(x * transform.scale[i] + transform.location[i] - step.value[i]) < 1e-4));
        assert.equal(matches.length, 1);
        const cycle = mesh.faces.get(matches[0]);
        mesh.selection = { faces: new Set(matches), verts: new Set(cycle),
          edges: new Set(cycle.map((a, i) => mesh.edgeBetween(a, cycle[(i + 1) % cycle.length]))) };
      } else if (step.id.startsWith('menu.')) {
        base = mesh;
        values = invoke(step.operator, lessonGesture(lesson, i + 1));
        mesh = evaluate(base, values);
      } else if (step.action === 'redo_value') {
        values = adjust(values, step.id, step.value);
        mesh = evaluate(base, values);
      } else {
        assert.ok(['set_mode', 'select_mode'].includes(step.action));
      }
      edit = step.edit ?? edit;
      check(mesh, edit, step);
    }
  });
}

test('adjacent quads share the inset boundary only in region mode', () => {
  const base = fromEdit({ verts: [[0,0,0], [1,0,0], [2,0,0], [2,1,0], [1,1,0], [0,1,0]],
    edges: [], faces: [[0,1,4,5], [1,2,3,4]] });
  for (const useIndividual of [false, true]) {
    const mesh = insetRegion(base, { faces: base.faces.keys(), thickness: 0.25, depth: -0.5, useIndividual });
    assert.equal(mesh.faces.size, useIndividual ? 10 : 8);
    assert.equal(mesh.selection.faces.size, 2);
    const actual = [...mesh.selection.verts].map(v => Array.from(mesh.verts.get(v))).sort();
    const xs = useIndividual ? [0.25, 0.75, 1.25, 1.75] : [0.25, 1, 1.75];
    assert.deepEqual(actual, xs.flatMap(x => [0.25, 0.75].map(y => [x, y, -0.5])).sort());
  }
});

test('NORMAL averages unit face normals and converts world distance to local units', () => {
  const base = fromEdit({ verts: [[0,0,0], [4,0,0], [8,0,0], [0,3,0], [0,0,1]],
    edges: [], faces: [[0,1,2,3], [0,3,4]] });
  assert.deepEqual(faceNormal(base, 0), [0,0,1]);
  const normal = regionNormal(base, base.faces.keys());
  assert.ok(Math.hypot(normal[0] - Math.SQRT1_2, normal[1], normal[2] - Math.SQRT1_2) < 1e-12);
  base.transform = { scale: [2,1,1], rotation: [20,30,40] };
  const [x,y,z] = normalOffset(base, base.faces.keys(), -Math.sqrt(5));
  assert.ok(Math.hypot(x + 0.5, y, z + 2) < 1e-12);
});

test('even depth at a folded boundary uses the angles of the inset ring', () => {
  const base = fromEdit({ verts: [[0,0,0], [1,0,0], [1,1,0], [0,1,0], [0.2,0.4,0.9]],
    edges: [], faces: [[0,1,4], [1,2,4], [2,3,4]] });
  // Position of the shared inner tip from Blender 5.3 for the same three triangles.
  for (const [thickness, expected] of [
    [0, [0.2, 0.38323167, 1.09705746]],
    [0.1, [0.29900691, 0.38416228, 1.08119166]],
  ]) {
    const mesh = insetRegion(base, { faces: base.faces.keys(), thickness, depth: 0.1 });
    const caps = [...mesh.selection.faces].map(f => mesh.faces.get(f));
    const tips = caps[0].filter(v => caps.every(cap => cap.includes(v)));
    assert.equal(tips.length, 1);
    const point = mesh.verts.get(tips[0]);
    assert.ok(Math.hypot(...point.map((x, i) => x - expected[i])) < 1e-5);
  }
});
