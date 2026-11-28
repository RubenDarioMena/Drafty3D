import { Euler, Quaternion, Vector3 } from 'three';
import { cube, cylinder, grid, plane, uvSphere } from './primitives.js';

const rad = Math.PI / 180;
const axes = ['X', 'Y', 'Z'];
const unit = i => new Vector3().setComponent(i, 1);
const orientation = angles => new Quaternion().setFromEuler(new Euler(...angles.map(a => a * rad), 'ZYX'));
const vector = a => new Vector3().fromArray(a);

export function createScene(scene = { objects: [], collections: [], active: null, selected: [] }) {
  return structuredClone(scene);
}

// Use copy-on-write so the previous scene can also serve as the redo base.
function transform(scene, apply) {
  const selected = scene.objects.filter(o => scene.selected.includes(o.name));
  const pivot = new Vector3();
  for (const o of selected) pivot.add(vector(o.location));
  pivot.divideScalar(selected.length || 1);
  return { ...scene, objects: scene.objects.map(o => selected.includes(o) ? apply(o, pivot) : o) };
}

export function translate(scene, delta) {
  return transform(scene, o => ({ ...o, location: vector(o.location).add(vector(delta)).toArray() }));
}

export function rotate(scene, axis, degrees) {
  const direction = typeof axis === 'string' ? unit(axes.indexOf(axis.toUpperCase())) : vector(axis).normalize();
  const turn = new Quaternion().setFromAxisAngle(direction, degrees * rad);
  return transform(scene, (o, pivot) => {
    const angles = new Euler().setFromQuaternion(turn.clone().multiply(orientation(o.rotation)), 'ZYX');
    return { ...o, rotation: [angles.x, angles.y, angles.z].map(a => a / rad),
      location: vector(o.location).sub(pivot).applyQuaternion(turn).add(pivot).toArray() };
  });
}

export function resize(scene, factors) {
  const scale = vector(factors);
  return transform(scene, (o, pivot) => {
    const rotation = orientation(o.rotation);
    const localScale = o.scale.map((s, i) => {
      const basis = unit(i).applyQuaternion(rotation);
      const stretched = basis.clone().multiply(scale);
      return s * stretched.length() * (basis.dot(stretched) < 0 ? -1 : 1);
    });
    return { ...o, scale: localScale, location: vector(o.location).sub(pivot).multiply(scale).add(pivot).toArray() };
  });
}

function available(objects, name) {
  const names = new Set(objects.map(o => o.name));
  if (!names.has(name)) return name;
  const base = name.replace(/\.\d+$/, '');
  let suffix = 1;
  while (names.has(base + '.' + String(suffix).padStart(3, '0'))) suffix++;
  return base + '.' + String(suffix).padStart(3, '0');
}

export function duplicate(scene, delta = [0, 0, 0]) {
  const objects = [...scene.objects], selected = [];
  let active = scene.active;
  for (const o of scene.objects.filter(o => scene.selected.includes(o.name))) {
    const name = available(objects, o.name);
    objects.push({ ...structuredClone(o), name });
    selected.push(name);
    if (o.name === active) active = name;
  }
  return translate({ ...scene, objects, selected, active }, delta);
}

export function deselect(scene, name) {
  return { ...scene, selected: name === undefined ? [] : scene.selected.filter(n => n !== name) };
}

export function select(scene, name, toggle = false) {
  if (!scene.objects.some(o => o.name === name)) throw new Error('Unknown object ' + name);
  if (toggle && scene.selected.includes(name)) return deselect(scene, name);
  return { ...scene, active: name, selected: toggle ? [...scene.selected, name] : [name] };
}

export function selectAll(scene) {
  const collections = new Map(scene.collections.map(c => [c.name, c]));
  const visible = scene.objects.filter(o => {
    for (let c = collections.get(o.collection); c; c = collections.get(c.parent)) if (c.hidden) return false;
    return !o.hidden;
  });
  return { ...scene, selected: visible.map(o => o.name) };
}

export function rename(scene, target, requested) {
  const name = available(scene.objects.filter(o => o.name !== target), requested);
  return { ...scene, objects: scene.objects.map(o => o.name === target ? { ...o, name } : o),
    active: scene.active === target ? name : scene.active, selected: scene.selected.map(n => n === target ? name : n) };
}

export function toggleCollection(scene, name, hidden) {
  return { ...scene, collections: scene.collections.map(c => c.name === name ? { ...c, hidden: hidden ?? !c.hidden } : c) };
}

const primitives = { cube: ['Cube', cube], cylinder: ['Cylinder', cylinder], uv_sphere: ['Sphere', uvSphere],
  plane: ['Plane', plane], grid: ['Grid', grid] };

export function addPrimitive(scene, kind, params = {}) {
  const [base, generate] = primitives[kind];
  const name = available(scene.objects, base);
  const object = { name, collection: null, location: params.location ?? [0,0,0], rotation: params.rotation ?? [0,0,0],
    scale: [1,1,1], hidden: false, mesh: generate(params) };
  return { ...scene, objects: [...scene.objects, object], active: name, selected: [name] };
}

export function compareScene(actual, expected, { tol = 1e-4 } = {}) {
  const fail = reason => ({ ok: false, reason });
  if (actual.active !== expected.active) return fail('Different active object');
  if (JSON.stringify([...actual.selected].sort()) !== JSON.stringify([...expected.selected].sort())) return fail('Different selection');
  for (const group of ['objects', 'collections']) {
    const entries = new Map(actual[group].map(o => [o.name, o]));
    if (entries.size !== actual[group].length || entries.size !== expected[group].length) return fail('Different ' + group);
    for (const ref of expected[group]) {
      const o = entries.get(ref.name);
      if (!o) return fail('Missing ' + ref.name);
      for (const key of ['hidden', 'collection', 'parent']) if (o[key] !== ref[key]) return fail(ref.name + '.' + key);
      if (group === 'collections') continue;
      for (const key of ['location', 'scale']) {
        if (!ref[key].every((v, i) => Math.abs(v - o[key][i]) <= tol)) return fail(ref.name + '.' + key);
      }
      if (!(orientation(o.rotation).angleTo(orientation(ref.rotation)) <= tol)) return fail(ref.name + '.rotation');
    }
  }
  return { ok: true, reason: null };
}

// Record the effective drag parameters once. Each panel edit replaces one field
// and re-executes the operator on its original scene.
export function objectOperator(base, operator, values) {
  const params = {};
  const prefix = 'redo.' + operator + '.';
  for (const [id, value] of Object.entries(values)) {
    const path = id.slice(prefix.length).replace(/^TRANSFORM_OT_translate\./, '');
    const [key, axis] = path.split('.');
    if (axis && 'xyz'.includes(axis) && axis.length === 1) {
      (params[key] ??= [0,0,0])['xyz'.indexOf(axis)] = value;
    } else params[path] = value;
  }
  switch (operator) {
    case 'transform.translate': return translate(base, params.value);
    case 'transform.rotate': return rotate(base, params.orient_axis, params.value);
    case 'transform.resize': return resize(base, params.value);
    case 'object.duplicate_move': return duplicate(base, params.value);
    case 'object.select_all': return selectAll(base);
    default: {
      const kind = /^mesh\.primitive_(.+)_add$/.exec(operator)?.[1];
      if (!primitives[kind]) throw new Error('Unsupported operator ' + operator);
      return addPrimitive(base, kind, params);
    }
  }
}

export function beginOperator(scene, operator, values = {}) {
  function evaluate(fields) {
    return { scene: objectOperator(scene, operator, fields), redo: (id, value) => evaluate({ ...fields, [id]: value }) };
  }
  return evaluate(values);
}
