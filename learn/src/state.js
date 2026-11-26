// Pure lesson state. Every state the UI shows is derived from the timeline Blender recorded.

export function newModifier(ui, type) {
  const definition = ui.modifiers[type];
  return {
    type,
    name: definition.defaultName,
    values: Object.fromEntries(definition.fields.map(field => [field.id, field.default])),
  };
}

export function initialState(timeline) {
  return {
    panel: timeline.initial.panel,
    modifiers: [],
    mesh: timeline.initial.mesh,
    camera: timeline.initial.camera,
  };
}

export function applyStep(state, step, ui) {
  const next = { ...state, modifiers: state.modifiers.map(mod => ({ ...mod, values: { ...mod.values } })) };
  if (step.action === 'select_panel') next.panel = step.id;
  if (step.action === 'add_modifier') next.modifiers.push(newModifier(ui, step.modifier));
  if (step.action === 'set_value') next.modifiers.find(mod => mod.type === step.modifier).values[step.id] = step.value;
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

/** Combination lock: is the current step's control in its target position? */
export function isSolved(live, step) {
  if (step.action === 'select_panel') return live.panel === step.id;
  if (step.action === 'add_modifier') return live.modifiers.some(mod => mod.type === step.modifier);
  if (step.action === 'set_value') {
    const mod = live.modifiers.find(candidate => candidate.type === step.modifier);
    return Boolean(mod) && ticks(mod.values[step.id], step.step) === ticks(step.value, step.step);
  }
  return false;
}

/** Fields a learner may turn in Your turn: lesson targets whose step is not solved yet. */
export function interactiveFields(timeline, solvedCount) {
  return new Set(timeline.steps.slice(solvedCount).filter(step => step.action === 'set_value').map(step => step.id));
}

/** Step size of each lesson field, from the timeline (the only source of slider granularity). */
export function fieldSteps(timeline) {
  return Object.fromEntries(timeline.steps.filter(step => step.action === 'set_value').map(step => [step.id, step.step]));
}

export function lessonModifierTypes(timeline) {
  return new Set(timeline.steps.filter(step => step.action === 'add_modifier').map(step => step.modifier));
}
