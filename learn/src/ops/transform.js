import { Euler, Quaternion, Vector3 } from 'three';
import { Mesh } from '../mesh.js';

function transformSelection(base, apply) {
  const mesh = Object.assign(new Mesh(), structuredClone(base));
  const selected = new Set(mesh.selection.verts);
  for (const edge of mesh.selection.edges) for (const v of mesh.edges.get(edge)) selected.add(v);
  for (const face of mesh.selection.faces) for (const v of mesh.faces.get(face)) selected.add(v);
  if (!selected.size) return mesh;

  const { rotation = [0, 0, 0], scale = [1, 1, 1] } = mesh.transform ?? {};
  if (scale.includes(0)) throw new RangeError('Cannot invert zero scale');
  const stretch = new Vector3(...scale);
  const orient = new Quaternion().setFromEuler(new Euler(...rotation.map(d => d * Math.PI / 180), 'ZYX'));
  const inverse = orient.clone().invert();
  // Working relative to the pivot cancels object translation.
  const pivot = new Vector3();
  for (const v of selected) pivot.add(new Vector3(...mesh.verts.get(v)));
  pivot.divideScalar(selected.size);
  const point = new Vector3();
  for (const v of selected) {
    const local = mesh.verts.get(v);
    point.fromArray(local).sub(pivot).multiply(stretch).applyQuaternion(orient);
    apply(point).applyQuaternion(inverse).divide(stretch).add(pivot).toArray(local);
  }
  return mesh;
}

// Blender's constraint_axis mask enables global components. All false is free.
function components(value, constraintAxis, neutral) {
  const values = typeof value === 'number' ? [value, value, value] : value;
  if (values?.length !== 3 || !values.every(Number.isFinite)) throw new RangeError('Invalid transform value');
  if (constraintAxis && (constraintAxis.length !== 3 || !constraintAxis.every(x => typeof x === 'boolean'))) {
    throw new RangeError('Invalid axis constraint');
  }
  const constrained = constraintAxis?.some(Boolean);
  return new Vector3(...values.map((x, i) => constrained && !constraintAxis[i] ? neutral : x));
}

export function translate(base, { value, constraintAxis }) {
  const offset = components(value, constraintAxis, 0);
  return transformSelection(base, p => p.add(offset));
}

export function resize(base, { value, constraintAxis }) {
  const factors = components(value, constraintAxis, 1);
  return transformSelection(base, p => p.multiply(factors));
}

// The rotation value is a right-handed angle in radians about the global axis.
export function rotate(base, { value, axis = 'Z', constraintAxis }) {
  if (!Number.isFinite(value)) throw new RangeError('Invalid rotation angle');
  let index = ['X', 'Y', 'Z'].indexOf(axis);
  if (constraintAxis?.some(Boolean)) {
    const mask = components(1, constraintAxis, 0).toArray();
    const count = mask.reduce((a, b) => a + b);
    index = count === 1 ? mask.indexOf(1) : mask.indexOf(0);
  }
  if (index < 0) throw new RangeError('Invalid rotation axis');
  const direction = new Vector3().setComponent(index, 1);
  return transformSelection(base, p => p.applyAxisAngle(direction, value));
}
