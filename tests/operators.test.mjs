import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { invoke, adjust } from '../learn/src/operators.js';

// Modal mouse inputs from learn/pipeline/blender/build_scene.py. The recorder
// deliberately executes these drags but only exports the menu path in the step.
const furniture = { 3: { value: [1.2, 1.2, 1.2] }, 12: { value: [1, 1, 2] },
  14: { value: [-0.3, 0, 0] }, 18: { value: [0, 0.3, 0] } };
const extrusion = { 4: { value: [0, 0, 0.3] }, 7: { value: [0, 0, 0.2] } };
const planter = { 4: { thickness: 0.1 }, 6: { value: [0, 0, -0.3] } };
const mug = { 7: { thickness: 0.05 }, 9: { value: [0, 0, -0.3] },
  18: { value: [0, 0, 0.2] }, 24: { offset: 0.02 } };
const barrel = { 6: { value: [1.1, 1.1, 1] } };
const bevel = { 5: { offset: 0.05 } };
const drags = {
  'move-rotate-scale': { 2: { value: [0, 0, 0.3] }, 4: { value: 20 },
    6: { value: [1, 1, 1.3] }, 9: { value: [0.4, 0, 0] } },
  'arrange-blocks': { 2: { value: [0, 0, 0.2] }, 4: { value: 15 },
    6: { value: [1, 1, 1.2] }, 9: { value: [0.3, 0, 0] } },
  fence: { 2: { value: [0.3, 0, 0] }, 4: { value: [0.3, 0, 0] } },
  pillars: { 2: { value: [0.4, 0, 0] }, 4: { value: [0.4, 0, 0] } },
  modes: { 4: { value: [0, 0, 0.3] } }, 'modes-tower': { 4: { value: [0, 0, 0.4] } },
  'project-table': furniture, 'project-desk': furniture,
  'inset-planter': planter, 'inset-drawer': planter, 'extrude-arm': extrusion, 'extrude-crane': extrusion,
  'project-mug': mug, 'project-jug': mug, 'loop-cut-barrel': barrel, 'loop-cut-vase': barrel,
  'bevel-edges': bevel, 'bevel-corner': bevel,
  'proportional-hill': { 8: { value: [0, 0, 0.3] } }, 'proportional-dent': { 8: { value: [0, 0, -0.3] } },
};

export function lessonGesture(lesson, stepNumber) {
  return drags[lesson]?.[stepNumber];
}

function check(actual, expected, label) {
  if (!expected) return assert.equal(actual, null, label);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), label);
  for (const [id, value] of Object.entries(expected)) {
    if (typeof value === 'number') {
      assert.ok(typeof actual[id] === 'number' && Math.abs(actual[id] - value) <= 1e-4,
        label + ' ' + id + ': expected ' + value + ', got ' + actual[id]);
    } else assert.equal(actual[id], value, label + ' ' + id);
  }
}

// Geometry tests import the same gesture fixtures without registering this suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const group of ['basics', 'modeling']) {
    const root = new URL('../learn/public/examples/' + group + '/', import.meta.url);
    for (const dir of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())) {
      test(group + '/' + dir.name + ' operator panels', () => {
        const { initial, steps } = JSON.parse(readFileSync(new URL(dir.name + '/timeline.json', root)));
        let params = null, proportional = initial.proportional;
        for (const [index, step] of steps.entries()) {
          if (step.action === 'menu') {
            params = invoke(step.operator, { previous: params, proportional, ...lessonGesture(dir.name, index + 1) });
          } else if (step.action === 'redo_value') {
            params = adjust(params, step.id, step.value);
          } else if (step.action === 'loop_cut') {
            params = invoke('mesh.loopcut_slide', { confirmed: true });
          } else {
            if (step.action === 'proportional') proportional = step.value;
            params = null;
            continue;
          }
          check(params, step.after.redo?.values, 'Step ' + (index + 1) + ' ' + step.id);
        }
      });
    }
  }

  test('modal operators start with neutral parameters before the first drag', () => {
    for (const [operator, field, value] of [
      ['transform.translate', 'value.z', 0], ['transform.resize', 'value.z', 1],
      ['transform.rotate', 'value', 0], ['object.duplicate_move', 'TRANSFORM_OT_translate.value.x', 0],
      ['mesh.extrude_region_move', 'TRANSFORM_OT_translate.value.z', 0],
      ['mesh.inset', 'thickness', 0], ['mesh.bevel', 'offset', 0],
    ]) {
      assert.equal(invoke(operator)['redo.' + operator + '.' + field], value, operator);
    }
  });

  test('primitive placement follows the current 3D cursor and each invocation starts fresh', () => {
    const operator = 'mesh.primitive_cube_add';
    const values = invoke(operator, { cursor: [2, -3, 4] });
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      assert.equal(values['redo.' + operator + '.location.' + axis], [2, -3, 4][i]);
    }
    const size = 'redo.' + operator + '.size';
    assert.equal(adjust(values, size, 5)[size], 5);
    assert.equal(values[size], 2);
    assert.equal(invoke(operator)['redo.' + operator + '.location.x'], 0);
  });
}
