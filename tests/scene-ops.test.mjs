import { lessonGesture } from './operators.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beginOperator, compareScene, createScene, select, rename, toggleCollection,
  addPrimitive, rotate, duplicate } from '../learn/src/scene-ops.js';

function apply(state, step, gesture) {
  const scene = state.scene;
  switch (step.action) {
    case 'menu': return beginOperator(scene, step.operator, gesture);
    case 'redo_value': return state.redo(step.id, step.value);
    case 'rename': return { scene: rename(scene, step.target, step.value) };
    case 'outliner_select': return { scene: select(scene, step.value) };
    case 'outliner_hide': return { scene: toggleCollection(scene, step.value, step.hidden) };
    case 'tap': {
      // The taps in these fixtures unambiguously hit the nearest object origin.
      const distance = o => Math.hypot(...o.location.map((v, i) => v - step.value[i]));
      const [hit] = scene.objects.toSorted((a, b) => distance(a) - distance(b));
      return { scene: select(scene, hit.name, step.toggle) };
    }
    default: throw new Error('Unhandled action ' + step.action);
  }
}

for (const lesson of ['move-rotate-scale', 'arrange-blocks', 'fence', 'pillars', 'project-table',
  'project-desk', 'add-objects', 'add-shapes']) {
  const path = new URL('../learn/public/examples/basics/' + lesson + '/timeline.json', import.meta.url);
  const { initial, steps } = JSON.parse(readFileSync(path));
  test(lesson, async t => {
    let chain = { scene: createScene(initial.scene) }, isolated;
    for (const [i, step] of steps.entries()) {
      if (step.action !== 'redo_value') isolated = { scene: createScene(i ? steps[i-1].after.scene : initial.scene) };
      const drag = lessonGesture(lesson, i + 1);
      isolated = apply(isolated, step, drag);
      chain = apply(chain, step, drag);
      await t.test('Step ' + (i + 1) + ' ' + step.id, () => {
        for (const state of [chain, isolated]) {
          const result = compareScene(state.scene, step.after.scene);
          assert.ok(result.ok, result.reason);
        }
      });
    }
  });
}

test('global rotation composes around the median of selected origins', () => {
  let scene = addPrimitive(createScene(), 'cube', { location: [2,0,0], rotation: [90,0,0] });
  scene = duplicate(scene, [-4,0,0]);
  scene = select(scene, 'Cube', true);
  const result = rotate(scene, 'Y', 90);
  const expected = structuredClone(scene);
  expected.objects.forEach(o => {
    o.location = [0, 0, -o.location[0]];
    o.rotation = [90, 90, 0];
  });
  assert.ok(compareScene(result, expected).ok);
  assert.equal(compareScene(scene, expected).ok, false);
});
