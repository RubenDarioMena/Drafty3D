import { Euler, Matrix4, Vector3, Quaternion, MathUtils } from 'three';
import { addObject, updateObject, validateDocument } from './document.js';

export function placementMatrix(params) {
  const rotation = new Euler(...['rx', 'ry', 'rz'].map((key) => MathUtils.degToRad(params[key] || 0)), 'ZYX');
  return new Matrix4().compose(new Vector3(params.x || 0, params.y || 0, params.z || 0), new Quaternion().setFromEuler(rotation), new Vector3(1, 1, 1));
}

/** Un gesto modifica un nodo; las referencias posteriores conservan su identidad. */
export function applyPlacement(document, id, elements) {
  const delta = new Matrix4().fromArray(elements);
  if (elements.length !== 16 || !elements.every(Number.isFinite)) throw new Error('El movimiento no es válido.');
  const position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  delta.decompose(position, quaternion, scale);
  if (scale.distanceTo(new Vector3(1, 1, 1)) > 1e-6 || Math.abs(delta.determinant() - 1) > 1e-6) throw new Error('Solo se permiten movimientos y giros rígidos.');
  const object = document.objects.find((item) => item.id === id);
  if (!object) throw new Error('Selecciona una pieza para moverla.');
  const translationOnly = Math.abs(quaternion.w) > 1 - 1e-12;
  if (translationOnly && ['box', 'cylinder', 'sphere', 'extrusion'].includes(object.type)) {
    updateObject(document, id, { params: Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, object.params[key] + position.getComponent(i)])) });
    return;
  }
  const matrix = object.type === 'transform' ? delta.multiply(placementMatrix(object.params)) : delta;
  matrix.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion, 'ZYX');
  const params = Object.fromEntries(['x', 'y', 'z'].map((key, i) => [key, position.getComponent(i)]));
  ['rx', 'ry', 'rz'].forEach((key, i) => { params[key] = MathUtils.radToDeg(rotation[['x', 'y', 'z'][i]]); });
  if (object.type === 'transform') updateObject(document, id, { params });
  else {
    const base = addObject(document, { name: `${object.name.slice(0, 100)} · origen`, type: object.type, params: object.params, color: object.color, visible: false });
    document.objects.pop();
    const index = document.objects.indexOf(object);
    document.objects.splice(index, 1, base, { ...object, type: 'transform', params: { source: base.id, ...params } });
    validateDocument(document);
  }
}
