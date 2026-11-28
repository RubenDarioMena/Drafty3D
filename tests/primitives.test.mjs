import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cube, grid, plane, cylinder, uvSphere } from '../learn/src/primitives.js';
import { beginOperator, createScene } from '../learn/src/scene-ops.js';
import { fromEdit, toEdit } from '../learn/src/mesh.js';
import { compareEdit } from '../learn/src/mesh-compare.js';

for (const path of ['basics/modes', 'basics/modes-tower', 'modeling/project-mug', 'modeling/project-jug',
  'modeling/proportional-hill', 'modeling/proportional-dent']) {
  test(path + ' first Edit Mode capture', () => {
    const url = new URL('../learn/public/examples/' + path + '/timeline.json', import.meta.url);
    const { initial, steps } = JSON.parse(readFileSync(url));
    let state = { scene: createScene(initial.scene) };
    for (const step of steps) {
      if (step.edit) {
        const o = state.scene.objects.find(o => o.name === state.scene.active);
        const actual = toEdit(fromEdit(o.mesh ?? cube({ size: 1 })), o);
        const comparison = compareEdit(actual, step.edit);
        assert.ok(comparison.ok, comparison.reason);
        return;
      }
      state = step.action === 'redo_value' ? state.redo(step.id, step.value)
        : beginOperator(state.scene, step.operator);
    }
    assert.fail('Missing edit capture');
  });
}

test('default and adjusted primitive topology counts', () => {
  const counts = mesh => [mesh.verts.length, mesh.edges.length, mesh.faces.length];
  assert.deepEqual(counts(cylinder()), [64,96,34]);
  assert.deepEqual(counts(cylinder({ vertices: 8 })), [16,24,10]);
  assert.deepEqual(counts(uvSphere()), [482,992,512]);
  assert.deepEqual(counts(uvSphere({ segments: 12, ring_count: 6 })), [62,132,72]);
  assert.deepEqual(counts(grid()), [121,220,100]);
  assert.deepEqual(counts(plane()), [4,4,1]);
});

for (const [lesson, vertices, segments, rings, size] of [
  ['add-objects', 8, 12, 6, 1], ['add-shapes', 6, 16, 8, 1.5],
]) {
  test(lesson + ' preserves adjusted geometry across location edits', () => {
    const url = new URL('../learn/public/examples/basics/' + lesson + '/timeline.json', import.meta.url);
    const { initial, steps } = JSON.parse(readFileSync(url));
    let state = { scene: createScene(initial.scene) };
    for (const [index, step] of steps.entries()) {
      state = step.action === 'redo_value' ? state.redo(step.id, step.value)
        : beginOperator(state.scene, step.operator);
      const mesh = state.scene.objects.find(o => o.name === state.scene.active).mesh;
      const counts = [mesh.verts.length, mesh.edges.length, mesh.faces.length];
      if (index < 2) {
        assert.deepEqual(counts, [8,12,6]);
        assert.equal(Math.max(...mesh.verts.flat()) * 2, index === 0 ? 2 : size);
      } else if (index < 5) {
        const sides = index === 2 ? 32 : vertices;
        assert.deepEqual(counts, [2 * sides, 3 * sides, sides + 2]);
      } else {
        const n = index === 5 ? 32 : segments;
        const r = index < 7 ? 16 : rings;
        assert.deepEqual(counts, [2 + n * (r - 1), n * (2 * r - 1), n * r]);
      }
    }
  });
}
