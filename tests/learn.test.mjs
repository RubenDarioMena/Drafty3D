import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { applyCamera, toThree, verticalFov } from '../learn/src/camera.js';
import { formatValue, roundToStep } from '../learn/src/format.js';
import { applyStep, initialState, interactiveFields, isSolved, stateAt, ticks, toolField } from '../learn/src/state.js';
import { resample, traceMatches } from '../learn/src/trace.js';

const examples = new URL('../learn/public/examples/', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, examples), 'utf8'));
const ui = await readJson('blender-ui.json');
const catalog = await readJson('index.json');
const timelines = Object.fromEntries(await Promise.all(catalog.lessons.map(async lesson => [lesson.example, await readJson(lesson.timeline)])));

const byModule = module => Object.values(timelines).filter(timeline => timeline.module === module);

test('every id in the timelines exists in the UI read from Blender (the pipeline ↔ UI contract)', () => {
  const tabIds = new Set(ui.propertiesTabs.filter(tab => !tab.separator).map(tab => tab.id));
  const menuIds = new Set(ui.addModifierMenu.categories.flatMap(category => category.items.map(item => item.id)));
  const fields = new Map(Object.values(ui.modifiers).flatMap(definition => definition.fields.map(field => [field.id, field])));
  const fieldIds = new Set(fields.keys());
  for (const timeline of byModule('modifiers')) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    assert.ok(tabIds.has(timeline.initial.panel));
    for (const step of timeline.steps) {
      const known = { select_panel: tabIds, add_modifier: menuIds, set_value: fieldIds }[step.action];
      assert.ok(known?.has(step.id), `${timeline.example}: ${step.id}`);
      if (step.action === 'set_value' && fields.get(step.id).kind === 'enum') {
        assert.ok(fields.get(step.id).items.some(item => item.value === step.value), `${step.id} = ${step.value} is a Blender option`);
      } else if (step.action === 'set_value' && fields.get(step.id).kind === 'pointer') {
        assert.ok((timeline.helpers ?? []).some(helper => helper.name === step.value), `${step.id} points at ${step.value}, one of the lesson's objects`);
      } else if (step.action === 'set_value' && fields.get(step.id).kind === 'bool') {
        assert.equal(typeof step.value, 'boolean', `${step.id} is a checkbox or toggle`);
        assert.equal(step.step, undefined);
      } else if (step.action === 'set_value') {
        const field = fields.get(step.id);
        assert.ok(step.step > 0);
        assert.equal(roundToStep(step.value, step.step), step.value, `${step.id} sits on its fixed slider step`);
        assert.ok(step.value >= field.softMin && step.value <= field.softMax, `${step.id} = ${step.value} is reachable with ◀ ▶`);
      }
    }
  }
});

test('sculpt timelines only name controls of Blender\'s Sculpt Mode header, mode menu and brush shelf', () => {
  const { modeMenu, header, shelf } = ui.sculpt;
  const brushes = new Map(shelf.brushes.map(brush => [brush.id, brush]));
  const known = {
    set_mode: new Set(modeMenu.items.map(item => item.id)),
    select_brush: new Set(brushes.keys()),
    set_value: new Set([header.size.id, header.strength.id]),
    set_direction: new Set(header.direction.items.map(item => item.id)),
    set_symmetry: new Set(header.symmetry.items.map(item => item.id)),
    stroke: new Set(['sculpt.stroke']),
  };
  assert.ok(byModule('sculpt').length >= 2);
  for (const timeline of byModule('sculpt')) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    assert.equal(timeline.initial.mode, 'OBJECT');
    for (const step of timeline.steps) {
      assert.ok(known[step.action]?.has(step.id), `${timeline.example}: ${step.action} ${step.id}`);
      if (step.action === 'select_brush') assert.equal(brushes.get(step.id).name, step.value);
      if (step.action === 'set_value') assert.equal(roundToStep(step.value, step.step), step.value);
      if (step.action !== 'set_mode') assert.ok(step.tool, `${step.id} carries the brush settings Blender reported`);
      if (step.action === 'stroke') {
        assert.ok(step.mesh, 'a stroke changes the mesh');
        assert.ok(step.stroke.points.length >= 2 && step.stroke.radius > 0);
        assert.ok(step.stroke.movedVertices > 0, 'Blender really moved vertices');
        assert.equal(step.stroke.brush, step.tool.brush);
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

test('each Your turn is a variant of its Watch lesson: same tools in the same order, different values or strokes', () => {
  const turns = Object.values(timelines).filter(timeline => timeline.mode === 'your-turn');
  const watches = Object.values(timelines).filter(timeline => timeline.mode === 'watch');
  assert.deepEqual(turns.map(timeline => timeline.variantOf).sort(), watches.map(timeline => timeline.example).sort(),
    'every Watch lesson has exactly one Your turn variant');
  for (const turn of turns) {
    const watch = timelines[turn.variantOf];
    assert.equal(watch.mode, 'watch');
    assert.deepEqual(turn.steps.map(step => [step.action, step.id]), watch.steps.map(step => [step.action, step.id]));
    assert.ok(turn.steps.some((step, index) => step.value !== watch.steps[index].value
      || JSON.stringify(step.stroke?.path) !== JSON.stringify(watch.steps[index].stroke?.path)));
    for (const step of turn.steps) assert.ok(step.help, `${turn.example} ${step.id} has help text for "Show me"`);
  }
});

test('no step is already done when the lesson reaches it (each lesson starts from Blender defaults)', () => {
  for (const timeline of Object.values(timelines)) {
    timeline.steps.forEach((step, index) => {
      assert.equal(isSolved(stateAt(timeline, ui, index - 1), step), false, `${timeline.example} step ${index + 1} (${step.id})`);
    });
  }
});

test('the sculpt lock: mode, brush, header values, direction and mirror open only in their target position', () => {
  const timeline = timelines['sleepy-buddy'];
  const step = id => timeline.steps.find(candidate => candidate.id === id);
  let live = initialState(timeline);
  assert.equal(live.mode, 'OBJECT');
  assert.equal(live.tool, null);
  assert.equal(isSolved(live, step('object.mode.sculpt')), false);
  live = applyStep(live, step('object.mode.sculpt'), ui);
  assert.equal(live.mode, 'SCULPT');
  assert.equal(isSolved({ ...live, tool: { ...live.tool, brush: 'Draw' } }, step('sculpt.brush.grab')), false);
  assert.equal(isSolved({ ...live, tool: { ...live.tool, brush: 'Grab' } }, step('sculpt.brush.grab')), true);
  const size = timeline.steps.find(candidate => candidate.id === 'sculpt.size');
  assert.equal(toolField(size), 'size');
  assert.equal(isSolved({ ...live, tool: { ...live.tool, size: size.value - size.step } }, size), false);
  assert.equal(isSolved({ ...live, tool: { ...live.tool, size: size.value } }, size), true);
  const mirror = step('sculpt.symmetry.x');
  assert.equal(isSolved({ ...live, tool: { ...live.tool, symmetry: ['Y'] } }, mirror), false);
  assert.equal(isSolved({ ...live, tool: { ...live.tool, symmetry: ['X', 'Y'] } }, mirror), true);
  assert.equal(isSolved({ ...live, tool: { ...live.tool, direction: 'ADD' } }, step('sculpt.direction.subtract')), false);
  assert.equal(isSolved(live, timeline.steps.find(candidate => candidate.action === 'stroke')), false, 'strokes are judged by the trace');
});

test('the happy buddy ends in Blender\'s last sculpted mesh with Smooth active', () => {
  const timeline = timelines['pebble-buddy'];
  const state = stateAt(timeline, ui, timeline.steps.length - 1);
  assert.equal(state.mode, 'SCULPT');
  assert.equal(state.tool.brush, 'Smooth');
  assert.deepEqual(state.tool.symmetry, ['X']);
  assert.equal(state.mesh, timeline.steps.filter(step => step.mesh).at(-1).mesh);
});

test('a traced stroke counts when it follows the dotted guide from its start', () => {
  const line = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 20, y: 200 }));
  const wobble = line.map((point, i) => ({ x: point.x, y: point.y + (i % 2 ? 9 : -9) }));
  assert.equal(traceMatches(wobble, line, 28).ok, true);
  assert.equal(traceMatches(line.map(point => ({ ...point, y: point.y + 80 })), line, 28).reason, 'coverage');
  assert.equal(traceMatches(line.slice().reverse(), line, 28).reason, 'direction');
  assert.equal(traceMatches(line.slice(0, 3), line, 28).ok, false, 'a third of the line is not the stroke');
  // A short stroke under a wide brush: still drawn from its start, and a tap is not a stroke.
  const short = [{ x: 0, y: 0 }, { x: 20, y: -40 }, { x: 40, y: -80 }];
  assert.equal(traceMatches(short.slice().reverse(), short, 120).reason, 'direction');
  assert.equal(traceMatches([{ x: 0, y: 0 }, { x: 2, y: -2 }], short, 120).reason, 'short');
  // A loop (an eye socket) may start anywhere along it.
  const loop = Array.from({ length: 25 }, (_, i) => ({ x: 300 + 40 * Math.cos(i / 24 * 2 * Math.PI), y: 300 + 40 * Math.sin(i / 24 * 2 * Math.PI) }));
  assert.equal(traceMatches([...loop.slice(12), ...loop.slice(1, 13)], loop, 28).ok, true);
  assert.equal(resample(line, 5).length, 5);
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
  assert.equal(formatValue({ kind: 'int', unit: 'px' }, 300), '300 px');
  assert.equal(formatValue({ kind: 'float', unit: '', precision: 3 }, 1), '1.000');
});
