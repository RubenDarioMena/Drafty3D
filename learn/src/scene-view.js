// Shared pieces of the Level 1 and 2 lessons (whole scenes, Edit Mode): drawing a state, the
// virtual keys, and deciding what a click in the 3D Viewport lands on.

/** Shows a lesson state in the 3D Viewport: Blender's step mesh, or a scene's objects and Edit Mode overlay. */
export function showState(viewer, geometries, state, preview = null) {
  if (!state.scene) {
    viewer.setGeometry(geometries.get(state.mesh));
    return;
  }
  const editing = state.mode === 'EDIT';
  viewer.setObjects(geometries.get(state.mesh), state.scene, editing);
  viewer.setEdit(editing ? state.edit : null, state.selection, state.selectMode, preview);
}

/** Labels along a menu step's path: "Object ▸ Transform ▸ Move". */
export function menuLabels(ui, path) {
  const items = Object.values(ui.view3d.menus).flatMap(menu => menu.items);
  const header = Object.values(ui.view3d.header).flat();
  return path.map(id => header.find(entry => entry.id === id)?.label ?? items.find(item => item.id === id)?.label ?? id);
}

/** An Adjust Last Operation field by its id. */
export function redoField(ui, operator, id) {
  return ui.view3d.operators[operator]?.sections.flatMap(section => section.fields).find(field => field.id === id);
}

/** Steps that move the 3D view with the mouse (no Blender operator in the header). */
export const NAVIGATION = new Set(['orbit', 'pan', 'zoom']);

/** Steps that click in the 3D Viewport rather than on a control. */
export const VIEWPORT_ACTIONS = new Set(['tap', 'knife', 'loop_cut', ...NAVIGATION]);

/** The id of the control a scene step uses, for highlights (null for clicks in the 3D Viewport). */
export function controlOf(step, ui) {
  if (step.action === 'menu') return step.path[0];
  if (step.action === 'set_mode') return ui.sculpt.modeMenu.id;
  if (step.action === 'outliner_select') return `outliner.row.${step.value}`;
  if (step.action === 'outliner_hide') return `outliner.hide.${step.value}`;
  if (step.action === 'rename') return `outliner.row.${step.target}`;
  if (VIEWPORT_ACTIONS.has(step.action)) return null;
  return step.id;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function inside(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const world = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function pointToSegment(point, a, b) {
  const ab = [0, 1, 2].map(i => b[i] - a[i]);
  const length = ab.reduce((sum, value) => sum + value * value, 0);
  const t = length ? Math.max(0, Math.min(1, [0, 1, 2].reduce((sum, i) => sum + (point[i] - a[i]) * ab[i], 0) / length)) : 0;
  return world(point, [0, 1, 2].map(i => a[i] + ab[i] * t));
}

const center = (edit, face) => [0, 1, 2].map(axis => face.reduce((sum, vertex) => sum + edit.verts[vertex][axis], 0) / face.length);

/** The vertex, edge or face Blender's click selected: the one nearest the recorded click point. */
export function editTarget(edit, selectMode, point) {
  const nearest = (list, measure) => list.reduce((best, item, index) => (measure(item) < measure(list[best]) ? index : best), 0);
  if (selectMode.includes('VERT')) return { kind: 'vert', index: nearest(edit.verts, vertex => world(vertex, point)) };
  if (selectMode.includes('EDGE')) {
    return { kind: 'edge', index: nearest(edit.edges, edge => pointToSegment(point, edit.verts[edge[0]], edit.verts[edge[1]])) };
  }
  return { kind: 'face', index: nearest(edit.faces, face => world(center(edit, face), point)) };
}

// How far (CSS pixels) a finger may land from a vertex, an edge or a knife point and still count.
const REACH = { vert: 30, edge: 26, point: 32 };

/** Whether a click at canvas point `at` lands on an Edit Mode element. */
export function hitsElement(viewer, edit, target, at) {
  const project = vertex => viewer.project(edit.verts[vertex]);
  if (target.kind === 'vert') return distance(project(target.index), at) <= REACH.vert;
  if (target.kind === 'edge') {
    const [a, b] = edit.edges[target.index];
    return segmentDistance(at, project(a), project(b)) <= REACH.edge;
  }
  const face = edit.faces[target.index];
  return inside(at, face.map(project)) || distance(viewer.project(center(edit, face)), at) <= REACH.vert;
}

/** Whether a click lands on any edge of a Loop Cut's ring (any of them makes the same cut). */
export function hitsRing(viewer, edit, ring, at) {
  return ring.some(index => {
    const [a, b] = edit.edges[index];
    return segmentDistance(at, viewer.project(edit.verts[a]), viewer.project(edit.verts[b])) <= REACH.edge;
  });
}

/** Whether a click lands on a knife point (Blender coordinates). */
export function hitsPoint(viewer, point, at) {
  return distance(viewer.project(point), at) <= REACH.point;
}

/**
 * Judges a learner's camera move against the recorded one: an orbit turns the view at least 20°,
 * a zoom changes the distance by a quarter in the recorded direction, a pan slides the view
 * sideways by at least 15% of the distance without turning it.
 */
export function navigationDone(action, before, after, recorded) {
  const angle = before.offset.angleTo(after.offset) * 180 / Math.PI;
  if (action === 'orbit') return angle >= 20;
  if (action === 'zoom') {
    const ratio = after.distance / before.distance;
    return recorded.distance < before.distance ? ratio <= 0.8 : ratio >= 1.25;
  }
  return angle < 10 && before.target.distanceTo(after.target) >= 0.15 * before.distance;
}

/** Whether a lesson Shift-clicks anywhere (only those show the ⇧ Shift key). */
export const usesShift = timeline => timeline.steps.some(step => step.toggle);

/** The ⇧ Shift and ⏎ Enter keys over the 3D Viewport (phones have no keyboard). */
export class Keys {
  constructor() {
    this.root = document.getElementById('viewport-keys');
    this.shiftButton = document.getElementById('key-shift');
    this.enterButton = document.getElementById('key-enter');
    this.shift = false;
  }

  show(shift, enter) {
    this.root.hidden = !shift && !enter;
    this.shiftButton.hidden = !shift;
    this.enterButton.hidden = !enter;
  }

  setShift(on) {
    this.shift = on;
    this.shiftButton.classList.toggle('on', on);
    this.shiftButton.setAttribute('aria-pressed', String(on));
  }
}
