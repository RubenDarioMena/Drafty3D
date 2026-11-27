// Pure lesson state. Every state the UI shows is derived from the timeline Blender recorded.

export function newModifier(ui, type) {
  const definition = ui.modifiers[type];
  return {
    type,
    name: definition.defaultName,
    visible: true,
    values: Object.fromEntries(definition.fields.map(field => [field.id, field.default])),
  };
}

/** What Blender reported after a scene step (Levels 1 and 2): objects, mode, selection, the last operator. */
const SCENE_KEYS = ['scene', 'mode', 'selectMode', 'proportional', 'redo', 'selection'];

function sceneState(record) {
  // `tool` is the modal tool waiting for clicks (the Knife, Loop Cut); sculpt lessons use `tool` for brushes.
  return { ...Object.fromEntries(SCENE_KEYS.map(key => [key, record[key] ?? null])), modal: record.tool ?? null, edit: record.edit ?? null };
}

export const isSceneLesson = timeline => Boolean(timeline.initial.scene);

export function initialState(timeline) {
  if (isSceneLesson(timeline)) {
    return { ...sceneState(timeline.initial), mesh: timeline.initial.mesh, camera: timeline.initial.camera, panel: null, modifiers: [], tool: null };
  }
  return {
    panel: timeline.initial.panel ?? null,
    modifiers: [],
    // Sculpt lessons: the object's mode and the active brush settings Blender reported.
    mode: timeline.initial.mode ?? 'OBJECT',
    tool: timeline.initial.tool ?? null,
    mesh: timeline.initial.mesh,
    camera: timeline.initial.camera,
  };
}

export function applyStep(state, step, ui) {
  if (step.after) {
    const next = { ...state, ...sceneState(step.after), edit: 'edit' in step ? step.edit : state.edit, camera: step.camera };
    if (step.mesh) next.mesh = step.mesh;
    return next;
  }
  const next = { ...state, modifiers: state.modifiers.map(mod => ({ ...mod, values: { ...mod.values } })) };
  if (step.action === 'select_panel') next.panel = step.id;
  if (step.action === 'add_modifier') next.modifiers.push(newModifier(ui, step.modifier));
  if (step.action === 'set_value' && step.modifier) next.modifiers.find(mod => mod.type === step.modifier).values[step.id] = step.value;
  if (step.action === 'toggle_modifier') next.modifiers.find(mod => mod.type === step.modifier).visible = step.value;
  if (step.action === 'move_modifier') {
    const moved = next.modifiers.find(mod => mod.type === step.modifier);
    const rest = next.modifiers.filter(mod => mod !== moved);
    next.modifiers = step.value === 'FIRST' ? [moved, ...rest] : [...rest, moved];
  }
  if (step.action === 'apply_modifier') next.modifiers = next.modifiers.filter(mod => mod.type !== step.modifier);
  // Multires Subdivide raises the levels; the step carries the numbers Blender reported.
  if (step.action === 'multires_subdivide') Object.assign(next.modifiers.find(mod => mod.type === step.modifier).values, step.values);
  if (step.action === 'set_mode') next.mode = step.value;
  // Sculpt steps carry the brush settings Blender reported after the step; take them as they are.
  if ('tool' in step) next.tool = step.tool;
  if (step.mesh) next.mesh = step.mesh;
  next.camera = step.camera;
  return next;
}

/** State after steps[0..index]; index -1 is the starting scene. */
export function stateAt(timeline, ui, index) {
  let state = initialState(timeline);
  for (let i = 0; i <= index; i += 1) state = applyStep(state, timeline.steps[i], ui);
  return state;
}

/** Number of fixed slider steps from zero; comparing these avoids float noise like 0.1 + 0.2. */
export function ticks(value, step) {
  return Math.round(value / step);
}

/** Header field a sculpt set_value step changes: "sculpt.size" → "size". */
export function toolField(step) {
  return step.id.startsWith('sculpt.') ? step.id.slice('sculpt.'.length) : null;
}

/** Combination lock: is the current step's control in its target position? Strokes are judged by trace.js. */
export function isSolved(live, step) {
  if (step.action === 'select_panel') return live.panel === step.id;
  if (step.action === 'add_modifier') return live.modifiers.some(mod => mod.type === step.modifier);
  if (step.action === 'toggle_modifier') return live.modifiers.find(mod => mod.type === step.modifier)?.visible === step.value;
  if (step.action === 'move_modifier') {
    const index = live.modifiers.findIndex(mod => mod.type === step.modifier);
    return index >= 0 && index === (step.value === 'FIRST' ? 0 : live.modifiers.length - 1);
  }
  if (step.action === 'apply_modifier') return !live.modifiers.some(mod => mod.type === step.modifier);
  if (step.action === 'set_mode') return live.mode === step.value;
  if (step.action === 'select_mode') return live.selectMode?.length === 1 && live.selectMode[0] === step.value;
  if (step.action === 'proportional') return live.proportional === step.value;
  if (step.action === 'redo_value') {
    const value = live.redo?.operator === step.operator ? live.redo.values[step.id] : undefined;
    return typeof value === 'number' && ticks(value, step.step) === ticks(step.value, step.step);
  }
  if (step.action === 'select_brush') return live.tool?.brush === step.value;
  if (step.action === 'set_direction') return live.tool?.direction === step.value;
  if (step.action === 'set_symmetry') return (live.tool?.symmetry ?? []).includes(step.id.split('.').pop().toUpperCase()) === step.value;
  if (step.action === 'set_value' && !step.modifier) {
    return Boolean(live.tool) && ticks(live.tool[toolField(step)], step.step) === ticks(step.value, step.step);
  }
  if (step.action === 'set_value') {
    const mod = live.modifiers.find(candidate => candidate.type === step.modifier);
    if (!mod) return false;
    // Enum buttons and checkboxes match exactly; numbers match on their fixed slider step.
    if (typeof step.value !== 'number') return mod.values[step.id] === step.value;
    return ticks(mod.values[step.id], step.step) === ticks(step.value, step.step);
  }
  return false;
}

/** Buttons that do something once (header toggles, menu items, Multires Subdivide): pressing the right one solves the step. */
export const STACK_ACTIONS = new Set(['toggle_modifier', 'move_modifier', 'apply_modifier', 'multires_subdivide']);

/** The header menu (the small arrow) that holds a step's control, if it lives in one. */
export function menuOf(step) {
  return step.action === 'move_modifier' || step.action === 'apply_modifier' ? `modifier.${step.id.split('.')[1]}.menu` : null;
}

/** Controls a learner may use in Your turn: lesson targets whose step is not solved yet. */
export function interactiveFields(timeline, solvedCount) {
  const steps = timeline.steps.slice(solvedCount).filter(step => step.action === 'set_value' || STACK_ACTIONS.has(step.action));
  return new Set(steps.flatMap(step => [step.id, menuOf(step)].filter(Boolean)));
}

/** Step size of each lesson field, from the timeline (the only source of slider granularity). */
export function fieldSteps(timeline) {
  return Object.fromEntries(timeline.steps.filter(step => (step.action === 'set_value' || step.action === 'redo_value') && step.step)
    .map(step => [step.id, step.step]));
}

/** Menu items a scene lesson uses anywhere: the only ones a learner can pick (others stay greyed out). */
export function lessonMenuItems(timeline) {
  return new Set(timeline.steps.filter(step => step.action === 'menu').map(step => step.id));
}

/** Objects in a recorded scene, grouped the way the Outliner lists them: collections, then their objects. */
export function outlinerTree(scene) {
  const node = name => ({
    name,
    collections: scene.collections.filter(collection => collection.parent === name).map(collection => ({ ...node(collection.name), hidden: collection.hidden })),
    objects: scene.objects.filter(object => object.collection === name).map(object => object.name).sort(),
  });
  return node(null);
}

/** Whether an object is drawn: its own eye and every collection above it. */
export function objectVisible(scene, name) {
  const object = scene.objects.find(candidate => candidate.name === name);
  if (!object || object.hidden) return false;
  for (let parent = object.collection; parent; parent = scene.collections.find(c => c.name === parent)?.parent ?? null) {
    if (scene.collections.find(c => c.name === parent)?.hidden) return false;
  }
  return true;
}

export function lessonModifierTypes(timeline) {
  return new Set(timeline.steps.filter(step => step.action === 'add_modifier').map(step => step.modifier));
}
