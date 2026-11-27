import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { applyCamera, toThree, verticalFov } from '../learn/src/camera.js';
import { formatValue, roundToStep } from '../learn/src/format.js';
import { Vector3 } from 'three';
import { editTarget, navigationDone } from '../learn/src/scene-view.js';
import {
  applyStep, initialState, interactiveFields, isSceneLesson, isSolved, lessonMenuItems, objectVisible, outlinerTree, stateAt, ticks, toolField,
} from '../learn/src/state.js';
import { resample, traceMatches } from '../learn/src/trace.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

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
  // Header controls: the display toggles each modifier has and the arrow menu's items.
  const headerIds = action => new Set(Object.values(ui.modifiers).flatMap(definition => (action === 'toggle_modifier'
    ? definition.toggles
    : ui.modifierHeader.menu.filter(item => !item.separator).map(item => item.id))
    .map(id => `modifier.${definition.short}.${id}`)));
  // Operator buttons inside a subpanel (Multires: Subdivide).
  const operatorIds = new Set(Object.values(ui.modifiers).flatMap(definition => definition.subpanels
    .flatMap(subpanel => (subpanel.operators ?? []).flat().filter(Boolean).map(operator => operator.id))));
  // Modifier lessons, and the modifier steps of sculpt lessons (Multires).
  for (const timeline of Object.values(timelines).filter(candidate => !isSceneLesson(candidate))) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    if (timeline.module === 'modifiers' || timeline.steps.some(step => step.modifier)) assert.ok(tabIds.has(timeline.initial.panel));
    for (const step of timeline.steps) {
      if (timeline.module === 'sculpt' && !step.modifier && step.action !== 'select_panel') continue;
      const known = { select_panel: tabIds, add_modifier: menuIds, set_value: fieldIds, multires_subdivide: operatorIds }[step.action]
        ?? headerIds(step.action);
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

test('scene lessons (Levels 1 and 2) only use Blender\'s 3D Viewport header, menus, Adjust Last Operation and Outliner', () => {
  const { header, menus, operators, selectModes, proportional, navigation, select } = ui.view3d;
  const items = new Map(Object.values(menus).flatMap(menu => menu.items.filter(item => !item.separator).map(item => [item.id, item])));
  const fieldsOf = operator => operators[operator]?.sections.flatMap(section => section.fields) ?? [];
  const scenes = Object.values(timelines).filter(isSceneLesson);
  assert.ok(scenes.filter(timeline => timeline.module === 'basics').length >= 12);
  assert.ok(scenes.filter(timeline => timeline.module === 'modeling').length >= 16);
  for (const timeline of scenes) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    assert.ok(timeline.initial.text, `${timeline.example} has an intro`);
    timeline.steps.forEach((step, index) => {
      const before = stateAt(timeline, ui, index - 1);
      const where = `${timeline.example} step ${index + 1} (${step.action} ${step.id})`;
      assert.ok(step.after?.scene && step.camera, `${where} carries what Blender reported after it`);
      if (step.action === 'menu') {
        // The path is the one a learner taps: a header button of this mode, then each submenu in turn.
        const [first, ...rest] = step.path;
        assert.ok(header[before.mode].some(entry => entry.id === first), `${where}: ${first} is in the ${before.mode} header`);
        let menu = menus[header[before.mode].find(entry => entry.id === first).menu];
        for (const id of rest) {
          const item = menu.items.find(candidate => candidate.id === id);
          assert.ok(item, `${where}: ${id} is in ${menu.label}`);
          if (id !== step.id) menu = menus[item.menu];
        }
        const item = items.get(step.id);
        assert.equal(item.kind, 'operator', where);
        assert.ok(item.enabled, `${where} is enabled in Blender`);
        // A Python menu item (Extrude Faces) runs another operator; the panel then shows the one Blender ran.
        assert.ok(item.operator === step.operator || step.after.redo?.operator === step.operator, `${where} runs ${step.operator}`);
      } else if (step.action === 'redo_value') {
        // The field is in the panel the step before left open, and ◀ ▶ reach the value.
        assert.equal(before.redo?.operator, step.operator, `${where} edits the last operation`);
        const field = fieldsOf(step.operator).find(candidate => candidate.id === step.id);
        assert.ok(field, where);
        assert.ok(step.id in before.redo.values, `${where} is a field Blender draws`);
        assert.ok(step.step > 0);
        assert.equal(roundToStep(step.value, step.step), step.value, `${where} sits on its fixed step`);
        assert.ok(step.value >= field.softMin && step.value <= field.softMax, where);
        assert.ok(Math.abs(step.after.redo.values[step.id] - step.value) < 1e-6, `${where}: Blender ran it again with the new value`);
      } else if (step.action === 'select_mode') {
        assert.ok(selectModes.some(item => item.id === step.id && item.value === step.value), where);
        assert.equal(before.mode, 'EDIT');
      } else if (step.action === 'proportional') {
        assert.equal(step.id, proportional.id, where);
      } else if (step.action === 'set_mode') {
        assert.ok(ui.sculpt.modeMenu.items.some(item => item.id === step.id && item.value === step.value), where);
        assert.equal(step.after.mode, step.value);
      } else if (step.action === 'tap') {
        assert.equal(step.id, select.id, where);
        if (step.after.mode === 'EDIT') assert.ok(step.after.selection, `${where} selects something`);
        else assert.ok(step.after.scene.selected.includes(step.after.scene.active), `${where} selects the object it clicks`);
      } else if (['orbit', 'pan', 'zoom'].includes(step.action)) {
        assert.equal(step.id, navigation[step.action].id, where);
        assert.ok(step.verify, `${where} ships a render from its new view`);
      } else if (step.action === 'knife' || step.action === 'loop_cut') {
        // The tool was started from its menu item (the step before), and the click changed the mesh.
        assert.equal(before.modal, step.action === 'knife' ? 'mesh.knife_tool' : 'mesh.loopcut_slide', where);
        assert.ok(step.mesh && step.edit, `${where} changes the mesh`);
        if (step.action === 'loop_cut') assert.ok(step.ring.every(edge => edge < before.edit.edges.length), where);
      } else if (step.action === 'outliner_select' || step.action === 'outliner_hide' || step.action === 'rename') {
        const name = step.action === 'rename' ? step.target : step.value;
        const listed = before.scene.objects.some(object => object.name === name) || before.scene.collections.some(c => c.name === name);
        assert.ok(listed, `${where}: ${name} is in the Outliner`);
        if (step.action === 'rename') assert.ok(step.after.scene.objects.some(object => object.name === step.value), where);
      } else {
        assert.fail(`${where}: unknown scene action`);
      }
    });
    // Menu items a learner can pick are exactly the ones the lesson uses.
    assert.ok([...lessonMenuItems(timeline)].every(id => items.has(id)));
  }
});

test('the Outliner lists collections, then their objects, and hides what a closed eye hides', () => {
  const scene = {
    objects: [{ name: 'Rail', collection: 'Fence', hidden: false }, { name: 'Post', collection: 'Fence', hidden: false }, { name: 'Ground', collection: null, hidden: true }],
    collections: [{ name: 'Fence', parent: null, hidden: true }],
    active: 'Post', selected: ['Post'],
  };
  const tree = outlinerTree(scene);
  assert.deepEqual(tree.collections.map(c => [c.name, c.objects, c.hidden]), [['Fence', ['Post', 'Rail'], true]]);
  assert.deepEqual(tree.objects, ['Ground']);
  assert.equal(objectVisible(scene, 'Post'), false, 'a hidden collection hides its objects');
  assert.equal(objectVisible(scene, 'Ground'), false);
  assert.equal(objectVisible({ ...scene, collections: [{ name: 'Fence', parent: null, hidden: false }] }, 'Rail'), true);
});

test('a click in Edit Mode is judged on the element Blender selected; orbit, zoom and pan by how the view moved', () => {
  const edit = {
    verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0]],
    faces: [[0, 1, 2, 3]],
  };
  assert.deepEqual(editTarget(edit, ['VERT'], [0.9, 0.1, 0]), { kind: 'vert', index: 1 });
  assert.deepEqual(editTarget(edit, ['EDGE'], [0.5, 1, 0]), { kind: 'edge', index: 2 });
  assert.deepEqual(editTarget(edit, ['FACE'], [0.5, 0.5, 0]), { kind: 'face', index: 0 });
  const view = (target, offset) => ({ target: new Vector3(...target), offset: new Vector3(...offset), distance: new Vector3(...offset).length() });
  const start = view([0, 0, 0], [0, 0, 10]);
  assert.equal(navigationDone('orbit', start, view([0, 0, 0], [5, 0, 8.66]), {}), true);
  assert.equal(navigationDone('orbit', start, view([0, 0, 0], [1, 0, 9.95]), {}), false);
  assert.equal(navigationDone('zoom', start, view([0, 0, 0], [0, 0, 7]), { distance: 6 }), true);
  assert.equal(navigationDone('zoom', start, view([0, 0, 0], [0, 0, 13]), { distance: 6 }), false, 'zooming the other way');
  assert.equal(navigationDone('pan', start, view([2, 0, 0], [0, 0, 10]), {}), true);
  assert.equal(navigationDone('pan', start, view([2, 0, 0], [5, 0, 8.66]), {}), false, 'a pan does not turn the view');
});

test('scene steps take the state Blender reported: mode, selection and the last operation', () => {
  const timeline = timelines['extrude-arm'];
  const state = stateAt(timeline, ui, timeline.steps.length - 1);
  const last = timeline.steps.at(-1);
  assert.equal(state.mode, last.after.mode);
  assert.deepEqual(state.scene, last.after.scene);
  assert.deepEqual(state.redo, last.after.redo);
  assert.ok(state.edit, 'the Edit Mode mesh is carried from the last step that changed it');
  const extrude = timeline.steps.findIndex(step => step.action === 'redo_value');
  const before = stateAt(timeline, ui, extrude - 1);
  const step = timeline.steps[extrude];
  assert.equal(isSolved(before, step), false);
  const live = { ...before, redo: { ...before.redo, values: { ...before.redo.values, [step.id]: step.value } } };
  assert.equal(isSolved(live, step), true, 'setting the field in Adjust Last Operation solves the step');
});

test('sculpt timelines only name controls of Blender\'s Sculpt Mode header, mode menu and brush shelf', () => {
  const { modeMenu, header, shelf } = ui.sculpt;
  const brushes = new Map(shelf.brushes.map(brush => [brush.id, brush]));
  const known = {
    set_mode: new Set(modeMenu.items.map(item => item.id)),
    select_brush: new Set(brushes.keys()),
    set_value: new Set([header.size.id, header.strength.id, ...header.remesh.fields.filter(field => field.kind === 'float').map(field => field.id)]),
    remesh: new Set([header.remesh.button.id]),
    set_direction: new Set(header.direction.items.map(item => item.id)),
    set_symmetry: new Set(header.symmetry.items.map(item => item.id)),
    stroke: new Set(['sculpt.stroke']),
  };
  assert.ok(byModule('sculpt').length >= 2);
  for (const timeline of byModule('sculpt')) {
    assert.equal(timeline.blenderVersion, ui.blenderVersion);
    assert.equal(timeline.initial.mode, 'OBJECT');
    let mode = timeline.initial.mode;
    for (const step of timeline.steps) {
      if (step.action === 'set_mode') mode = step.value;
      // Brush settings exist in Sculpt Mode only.
      if (mode === 'SCULPT') assert.ok(step.tool, `${step.id} carries the brush settings Blender reported`);
      else assert.equal(step.tool ?? null, null);
      // Modifier steps (Multires) follow the Properties editor's contract above.
      if (step.modifier || step.action === 'select_panel') continue;
      assert.ok(known[step.action]?.has(step.id), `${timeline.example}: ${step.action} ${step.id}`);
      if (step.action === 'select_brush') assert.equal(brushes.get(step.id).name, step.value);
      if (step.action === 'set_value') assert.equal(roundToStep(step.value, step.step), step.value);
      if (step.action === 'stroke') {
        assert.ok(step.mesh, 'a stroke changes the mesh');
        assert.ok(step.stroke.points.length >= 2 && step.stroke.radius > 0);
        assert.ok((step.stroke.movedVertices ?? step.stroke.maskedVertices) > 0, 'Blender really moved (or masked) vertices');
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

test('a Mask stroke changes only Blender\'s mask: same shape, more of it protected, and the mesh ships the mask', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const read = async (timeline, mesh) => {
    const primitive = (await io.read(new URL(`sculpt/${timeline.example}/${mesh}`, examples).pathname)).getRoot().listMeshes()[0].listPrimitives()[0];
    return { position: primitive.getAttribute('POSITION').getArray(), mask: primitive.getAttribute('_MASK')?.getArray() };
  };
  const masked = byModule('sculpt').filter(timeline => timeline.steps.some(step => step.stroke?.brushType === 'MASK'));
  assert.ok(masked.length >= 2);
  for (const timeline of masked) {
    let previous = timeline.initial.mesh;
    for (const step of timeline.steps.filter(candidate => candidate.mesh)) {
      if (step.stroke?.brushType === 'MASK') {
        assert.ok(step.stroke.maskedVertices > 0, `${timeline.example}: Blender reports masked vertices`);
        const [before, after] = [await read(timeline, previous), await read(timeline, step.mesh)];
        assert.ok(after.mask, `${step.mesh} carries the mask`);
        assert.deepEqual(after.position, before.position, `${step.mesh}: masking does not move the surface`);
        const changed = after.mask.filter((value, i) => Math.abs(value - before.mask[i]) > 1e-3).length;
        assert.ok(changed > 0.5 * step.stroke.maskedVertices, `${step.mesh}: ${changed} vertices masked in the shipped mesh`);
      }
      previous = step.mesh;
    }
  }
});

test('Remesh rebuilds the mesh: the shipped mesh has the vertex count Blender reported, and the Voxel Size set before it', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const count = async (timeline, mesh) => (await io.read(new URL(`sculpt/${timeline.example}/${mesh}`, examples).pathname))
    .getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getCount();
  const remeshed = byModule('sculpt').filter(timeline => timeline.steps.some(step => step.action === 'remesh'));
  assert.ok(remeshed.length >= 2);
  for (const timeline of remeshed) {
    let previous = timeline.initial.mesh;
    let voxel = null;
    for (const step of timeline.steps) {
      if (step.id === 'sculpt.voxel_size') voxel = step.value;
      if (step.action === 'remesh') {
        assert.ok(step.mesh, 'Remesh changes the mesh');
        assert.equal(step.tool.voxel_size, voxel, 'Remesh uses the Voxel Size the lesson set');
        assert.equal(await count(timeline, previous), step.remesh.before);
        assert.equal(await count(timeline, step.mesh), step.remesh.vertices);
        assert.ok(step.remesh.vertices > 4 * step.remesh.before, `${timeline.example}: ${step.remesh.before} → ${step.remesh.vertices}`);
      }
      if (step.mesh) previous = step.mesh;
    }
  }
});

test('Multires Subdivide adds a level: each press multiplies the shipped mesh and raises all three levels by one', async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  const count = async (timeline, mesh) => (await io.read(new URL(`sculpt/${timeline.example}/${mesh}`, examples).pathname))
    .getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getCount();
  const multires = byModule('sculpt').filter(timeline => timeline.steps.some(step => step.action === 'multires_subdivide'));
  assert.ok(multires.length >= 2);
  for (const timeline of multires) {
    let previous = timeline.initial.mesh;
    let level = 0;
    for (const step of timeline.steps) {
      if (step.action === 'multires_subdivide') {
        level += 1;
        assert.deepEqual(Object.values(step.values), [level, level, level], `${timeline.example}: Viewport, Sculpt and Render levels`);
        const [before, after] = [await count(timeline, previous), await count(timeline, step.mesh)];
        assert.ok(after > 3.5 * before, `${timeline.example}: ${before} → ${after} vertices`);
      }
      if (step.mesh) previous = step.mesh;
    }
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
