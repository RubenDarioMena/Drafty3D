import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createDocument, serializeDocument, parseDocument, updateObject, CadHistory } from '../cad/document.js';
import { recommendedMeshQuality, bytesToBase64, binaryStl } from '../cad/mesh-quality.js';

test('el proyecto conserva CAD y malla independientes, con undo y redo portables', () => {
  const doc = createDocument();
  const cad = addObject(doc, { type: 'box' });
  const history = new CadHistory(doc);
  const data = bytesToBase64(binaryStl({ positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]), indices: new Uint32Array([0,1,2]) }));
  addObject(doc, { type: 'mesh', params: { data, quality: 1 } });
  updateObject(doc, cad.id, { visible: false });
  history.commit(doc);
  assert.deepEqual(parseDocument(serializeDocument(doc)), doc);
  const before = history.undo();
  assert.equal(before.objects.length, 1);
  assert.equal(before.objects[0].visible, true);
  assert.deepEqual(history.redo(), doc);
  assert.throws(() => addObject(doc, { type: 'mesh', params: { data, quality: 9 } }), /resolución/);
});

test('el máximo recomendado considera tiempo de selección y el resto de la escena', () => {
  assert.equal(recommendedMeshQuality(1, { milliseconds: 80, triangles: 5000, sceneTriangles: 5000 }), 0);
  const empty = recommendedMeshQuality(1, { milliseconds: 2, triangles: 5000, sceneTriangles: 5000 });
  const crowded = recommendedMeshQuality(1, { milliseconds: 2, triangles: 5000, sceneTriangles: 249000 });
  assert.ok(crowded < empty);
});
