import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { createDocument, addObject, validateDocument, CadHistory, removeObject } from '../cad/document.js';
import { applyPlacement, placementMatrix } from '../cad/placement.js';

test('arrastrar una primitiva actualiza sus parámetros y un solo deshacer restaura el estado', () => {
  const doc = createDocument();
  addObject(doc, { id: 'base', type: 'box' });
  const history = new CadHistory(doc);
  applyPlacement(doc, 'base', new Matrix4().makeTranslation(12, -7, 3).toArray());
  history.commit(doc);
  assert.equal(doc.objects.length, 1);
  assert.deepEqual([doc.objects[0].params.x, doc.objects[0].params.y, doc.objects[0].params.z], [12, -7, 3]);
  assert.equal(history.undo().objects[0].params.x, 0);
  assert.equal(history.redo().objects[0].params.x, 12);
});

test('girar conserva el identificador de la pieza y las dependencias posteriores', () => {
  const doc = createDocument();
  addObject(doc, { id: 'base', type: 'box', visible: false });
  addObject(doc, { id: 'copia', type: 'transform', params: { source: 'base', x: 100 } });
  const delta = new Matrix4().makeTranslation(15, 10, 5).multiply(new Matrix4().makeRotationZ(Math.PI / 2)).multiply(new Matrix4().makeTranslation(-15, -10, -5));
  applyPlacement(doc, 'base', delta.toArray());
  assert.equal(doc.objects.length, 3);
  assert.equal(doc.objects[1].id, 'base');
  assert.equal(doc.objects[2].params.source, 'base');
  assert.equal(doc.objects[1].params.source, doc.objects[0].id);
  assert.ok(new Vector3(15, 10, 5).applyMatrix4(placementMatrix(doc.objects[1].params)).distanceTo(new Vector3(15, 10, 5)) < 1e-8);
  applyPlacement(doc, 'base', new Matrix4().makeTranslation(8, 0, 0).toArray());
  assert.equal(doc.objects.length, 3, 'Mover el mismo nodo no acumula transformaciones nuevas.');
  assert.ok(new Vector3(15, 10, 5).applyMatrix4(placementMatrix(doc.objects[1].params)).distanceTo(new Vector3(23, 10, 5)) < 1e-8);
  validateDocument(doc);
});

test('un croquis en una cara tiene una dependencia válida y no acepta ejes deformados', () => {
  const doc = createDocument();
  addObject(doc, { id: 'base', type: 'box' });
  const params = { points: [], profile: { type: 'circle', center: [4, 5], radius: 2 }, support: { source: 'base', face: 5, faceCount: 6 }, plane: { origin: [0, 0, 10], u: [1, 0, 0], v: [0, 1, 0] }, reverse: true };
  addObject(doc, { id: 'perfil', type: 'extrusion', params });
  assert.throws(() => removeObject(doc, 'base'), /depende/);
  assert.throws(() => addObject(doc, { type: 'extrusion', params: { ...params, plane: { ...params.plane, u: [2, 0, 0] } } }), /unitarios/);
  assert.throws(() => applyPlacement(doc, 'base', new Matrix4().makeScale(2, 1, 1).toArray()), /rígidos/);
  assert.throws(() => addObject(doc, { type: 'extrusion', params: { ...params, profile: { ...params.profile, radius: -2 } } }), /mayor/);
});
