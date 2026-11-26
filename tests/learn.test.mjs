import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { applyCamera, toThree, verticalFov } from '../learn/src/camera.js';
import { formatValue, roundToStep } from '../learn/src/format.js';
import { applyStep, initialState, interactiveFields, isSolved, stateAt, ticks } from '../learn/src/state.js';

const examples = new URL('../learn/public/examples/', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, examples), 'utf8'));
const ui = await readJson('blender-ui.json');
const catalog = await readJson('index.json');
const timelines = Object.fromEntries(await Promise.all(catalog.lessons.map(async lesson => [lesson.example, await readJson(lesson.timeline)])));

test('every id in the timelines exists in the UI read from Blender (the pipeline ↔ UI contract)', () => {
  const tabIds = new Set(ui.propertiesTabs.filter(tab => !tab.separator).map(tab => tab.id));
  const menuIds = new Set(ui.addModifierMenu.categories.flatMap(category => category.items.map(item => item.id)));
  const fieldIds = new Set(Object.values(ui.modifiers).flatMap(definition => definition.fields.map(field => field.id)));
  for (const timeline of Object.values(timelines)) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    assert.ok(tabIds.has(timeline.initial.panel));
    for (const step of timeline.steps) {
      const known = { select_panel: tabIds, add_modifier: menuIds, set_value: fieldIds }[step.action];
      assert.ok(known?.has(step.id), `${timeline.example}: ${step.id}`);
      if (step.action === 'set_value') {
        assert.ok(step.step > 0);
        assert.equal(roundToStep(step.value, step.step), step.value, `${step.id} sits on its fixed slider step`);
      }
    }
  }
});

test('every mesh a timeline names ships with the app and has a Blender reference render', async () => {
  for (const timeline of Object.values(timelines)) {
    const meshes = [timeline.initial.mesh, ...timeline.steps.map(step => step.mesh).filter(Boolean)];
    for (const mesh of meshes) {
      assert.ok(await stat(new URL(`${timeline.module}/${timeline.example}/${mesh}`, examples)));
      assert.ok(await stat(new URL(`../tests/fixtures/learn/${timeline.module}/${timeline.example}/${mesh.replace('.glb', '.png')}`, import.meta.url)));
    }
  }
});

test('your turn is a variant of the cup: same tools in the same order, different values', () => {
  const { cup, bowl } = timelines;
  assert.equal(bowl.variantOf, 'cup');
  assert.deepEqual(bowl.steps.map(step => [step.action, step.id]), cup.steps.map(step => [step.action, step.id]));
  assert.ok(bowl.steps.some((step, index) => step.value !== cup.steps[index].value));
  for (const step of bowl.steps) assert.ok(step.help, `${step.id} has help text for "Show me"`);
});

test('the cup ends with Solidify → Bevel → Subdivision at the taught values', () => {
  const state = stateAt(timelines.cup, ui, timelines.cup.steps.length - 1);
  assert.deepEqual(state.modifiers.map(modifier => modifier.type), ['SOLIDIFY', 'BEVEL', 'SUBSURF']);
  assert.equal(state.modifiers[0].values['modifier.solidify.thickness'], 0.08);
  assert.equal(state.modifiers[1].values['modifier.bevel.segments'], 2);
  assert.equal(state.modifiers[2].values['modifier.subsurf.levels'], 2);
  assert.equal(state.mesh, timelines.cup.steps.at(-1).mesh);
});

test('the combination lock opens only on the right control and the right fixed-step value', () => {
  const timeline = timelines.bowl;
  let live = initialState(timeline);
  const [tab, addSolidify, thickness] = timeline.steps;
  assert.equal(isSolved(live, tab), false);
  live = { ...live, panel: tab.id };
  assert.equal(isSolved(live, tab), true);
  live = applyStep(applyStep(live, tab, ui), addSolidify, ui);
  const set = value => ({ ...live, modifiers: [{ ...live.modifiers[0], values: { ...live.modifiers[0].values, [thickness.id]: value } }] });
  assert.equal(isSolved(set(0.05), thickness), false);
  assert.equal(isSolved(set(0.01 * 6), thickness), true, 'float noise (0.060000000000000005) still matches');
  assert.equal(ticks(0.1 + 0.2, 0.1), 3);
  assert.ok(interactiveFields(timeline, 2).has(thickness.id));
  assert.ok(!interactiveFields(timeline, 3).has(thickness.id), 'a solved dial is locked');
});

test('cameras convert from Blender (Z up) to three.js (Y up) and keep the framing on portrait screens', () => {
  assert.deepEqual(toThree([1, 2, 3]), [1, 3, -2]);
  assert.equal(verticalFov(30, 1.5), 30);
  assert.ok(verticalFov(30, 0.5) > 50);
  const camera = {
    position: { set(...xyz) { this.xyz = xyz; } }, up: { set() {} },
    lookAt(...target) { this.target = target; }, updateProjectionMatrix() {},
  };
  applyCamera(camera, { position: [0, -4, 1], target: [0, 0, 1], fov: 30 }, 1);
  assert.deepEqual(camera.position.xyz, [0, 1, 4]);
  assert.deepEqual(camera.target, [0, 1, -0]);
});

test('number fields read like Blender', () => {
  const field = unit => ({ kind: 'float', unit });
  assert.equal(formatValue(field('m'), 0.08), '0.08 m');
  assert.equal(formatValue(field('m'), 0.1), '0.1 m');
  assert.equal(formatValue(field('°'), 30), '30°');
  assert.equal(formatValue({ kind: 'int' }, 2), '2');
});
