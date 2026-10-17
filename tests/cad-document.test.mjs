import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  createExampleDocument,
  validateDocument,
  addObject,
  updateObject,
  removeObject,
  cloneDocument,
  serializeDocument,
  parseDocument,
  CadHistory,
  DOCUMENT_LIMITS,
} from "../cad/document.js";

test("el ejemplo guarda las fuentes y el corte paramétrico sin perder sus referencias", () => {
  const document = createExampleDocument();
  const restored = parseDocument(serializeDocument(document));
  assert.deepEqual(restored, document);
  assert.equal(restored.objects.length, 3);
  assert.equal(restored.objects[0].visible, false);
  assert.equal(restored.objects[1].visible, false);
  assert.equal(restored.objects[2].visible, true);
  assert.deepEqual(restored.objects[0].params, { width: 60, depth: 40, height: 8, x: 0, y: 0, z: 0 });
  assert.deepEqual(restored.objects[1].params, { radius: 6, height: 12, x: 30, y: 20, z: -2 });
  assert.deepEqual(restored.objects[2].params, { operation: "cut", left: "base", right: "agujero" });
  updateObject(restored, "base", { params: { width: 80 } });
  assert.equal(restored.objects[2].params.left, "base");
  assert.equal(restored.objects[0].params.depth, 40);
});

test("el borrado bloquea dependencias y permite retirar una cadena completa sin huérfanos", () => {
  const document = createExampleDocument();
  addObject(document, { id: "redondeo", type: "fillet", params: { source: "soporte", radius: 1 } });
  addObject(document, { id: "movido", type: "transform", params: { source: "redondeo", x: 10, rz: 45 } });
  const previous = cloneDocument(document);
  assert.throws(() => removeObject(document, "base"), /depende de esta pieza/);
  assert.deepEqual(document, previous);
  const removed = removeObject(document, "base", { cascade: true });
  assert.deepEqual(removed.map((object) => object.id), ["base", "soporte", "redondeo", "movido"]);
  assert.deepEqual(document.objects.map((object) => object.id), ["agujero"]);
  validateDocument(document);
});

test("las referencias deben existir antes de la operación y no se cambian identidades", () => {
  const document = createExampleDocument();
  const original = serializeDocument(document);
  assert.throws(() => updateObject(document, "base", { id: "otro" }), /no se pueden cambiar/);
  assert.throws(() => updateObject(document, "soporte", { params: { left: "soporte" } }), /pieza anterior/);
  assert.throws(() => updateObject(document, "soporte", { params: { right: "base" } }), /dos piezas diferentes/);
  assert.throws(() => addObject(document, { type: "fillet", params: { source: "inexistente", radius: 2 } }), /pieza anterior/);
  const reversed = cloneDocument(document);
  reversed.objects.reverse();
  assert.throws(() => validateDocument(reversed), /pieza anterior/);
  assert.equal(serializeDocument(document), original);
});

test("los tamaños inválidos se rechazan antes de mutar el documento", () => {
  const document = createDocument();
  const box = addObject(document, { type: "box" });
  const cylinder = addObject(document, { type: "cylinder" });
  assert.notEqual(box.id, cylinder.id);
  const snapshot = cloneDocument(document);
  for (const height of [0, -2, 0.000001, NaN, Infinity, "12", 100_001]) {
    assert.throws(() => updateObject(document, box.id, { params: { height } }));
  }
  assert.throws(() => updateObject(document, box.id, { params: { x: 1_000_001 } }), /límite/);
  assert.throws(() => updateObject(document, box.id, { visible: "false" }), /visibilidad/);
  assert.throws(() => addObject(document, { type: "box", id: box.id }), /duplicado/);
  assert.deepEqual(document, snapshot);
});

test("los perfiles mantienen puntos numéricos, área y límites razonables", () => {
  const document = createDocument();
  const points = [[0, 0], [30, 0], [30, 20], [0, 20]];
  const object = addObject(document, { type: "extrusion", params: { points, height: 8 } });
  points[0][0] = 99;
  assert.equal(object.params.points[0][0], 0);
  assert.throws(() => updateObject(document, object.id, { params: { points: [[0, 0], [1, 1], [2, 2]] } }), /área/);
  assert.throws(() => updateObject(document, object.id, { params: { points: [[0, 0], [1, NaN], [2, 0]] } }), /finito/);
  assert.throws(() => updateObject(document, object.id, { params: { points: Array.from({ length: 1025 }, () => [0, 0]) } }), /1024/);
  assert.deepEqual(object.params.points, [[0, 0], [30, 0], [30, 20], [0, 20]]);
});

test("los perfiles rechazan vértices duplicados, cruces y contactos entre lados", () => {
  const document = createDocument();
  const profile = addObject(document, { type: "extrusion", params: { points: [[0, 0], [4, 0], [4, 4], [0, 4]] } });
  const original = cloneDocument(document);
  for (const points of [
    [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
    [[0, 0], [4, 0], [4, 4], [4, 0], [0, 4]],
  ]) assert.throws(() => updateObject(document, profile.id, { params: { points } }), /puntos duplicados/);
  for (const points of [
    [[0, 0], [4, 4], [0, 4], [4, 0]],
    // Cruce con área distinta de cero: también debe rechazarse.
    [[0, 0], [4, 4], [0, 3], [4, 0]],
    // Un vértice no contiguo toca el interior del primer lado.
    [[0, 0], [4, 0], [4, 4], [2, 0], [0, 4]],
    // Dos lados contiguos retroceden y se solapan.
    [[0, 0], [4, 0], [2, 0], [2, 4], [0, 4]],
  ]) assert.throws(() => updateObject(document, profile.id, { params: { points } }), /auto-intersecciones/);
  assert.deepEqual(document, original);
});

test("los perfiles cóncavos y los vértices contiguos colineales siguen siendo válidos", () => {
  const document = createDocument();
  const concave = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
  addObject(document, { type: "extrusion", params: { points: concave } });
  addObject(document, { type: "extrusion", params: { points: [...concave].reverse() } });
  addObject(document, { type: "extrusion", params: { points: [[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]] } });
  addObject(document, { type: "extrusion", params: { points: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 2]] } });
  assert.equal(validateDocument(document), document);
});

test("un croquis se guarda sin volumen, se extruye por referencia y conserva su historial", () => {
  const document = createDocument("Desde cero");
  const points = [[0, 0], [40, 0], [40, 30], [0, 30]];
  addObject(document, { id: "perfil", type: "sketch", params: { points } });
  const standalone = parseDocument(serializeDocument(document));
  assert.equal(standalone.version, 1);
  assert.equal(standalone.objects[0].type, "sketch");
  assert.equal(standalone.objects[0].params.height, undefined);
  const history = new CadHistory(standalone);
  addObject(document, { id: "volumen", type: "extrusion", params: { sketch: "perfil", height: 8 } });
  history.commit(document);
  updateObject(document, "perfil", { params: { points: [[0, 0], [50, 0], [50, 30], [0, 30]] } });
  history.commit(document);
  const restored = parseDocument(serializeDocument(document));
  assert.equal(restored.objects[1].params.sketch, "perfil");
  assert.equal(restored.objects[1].params.points, undefined);
  assert.deepEqual(history.undo().objects[0].params.points, points);
  assert.equal(history.undo().objects.length, 1);
  assert.equal(history.redo().objects[1].params.sketch, "perfil");
  assert.throws(() => removeObject(restored, "perfil"), /depende/);
  assert.deepEqual(removeObject(restored, "perfil", { cascade: true }).map(({ id }) => id), ["perfil", "volumen"]);
});

test("el apoyo de un croquis propaga dependencias y rechaza referencias incompatibles", () => {
  const document = createDocument();
  addObject(document, { id: "base", type: "box" });
  const params = { points: [], profile: { type: "circle", center: [10, 10], radius: 3 }, support: { source: "base", face: 5, faceCount: 6 } };
  addObject(document, { id: "circulo", type: "sketch", params });
  addObject(document, { id: "herramienta", type: "extrusion", params: { sketch: "circulo", height: 12, reverse: true } });
  addObject(document, { id: "corte", type: "boolean", params: { operation: "cut", left: "base", right: "herramienta" } });
  const original = serializeDocument(document);
  assert.throws(() => addObject(document, { type: "extrusion", params: { sketch: "base" } }), /croquis independiente/);
  assert.throws(() => addObject(document, { type: "extrusion", params: { sketch: "circulo", points: [] } }), /vinculada/);
  assert.throws(() => addObject(document, { type: "sketch", params: { ...params, support: { source: "circulo", face: 0, faceCount: 1 } } }), /sólido CAD/);
  assert.throws(() => addObject(document, { type: "fillet", params: { source: "circulo" } }), /Extruye primero/);
  assert.throws(() => addObject(document, { type: "transform", params: { source: "circulo" } }), /Extruye primero/);
  assert.throws(() => addObject(document, { type: "boolean", params: { operation: "fuse", left: "base", right: "circulo" } }), /Extruye primero/);
  assert.throws(() => updateObject(document, "circulo", { params: { profile: { ...params.profile, radius: 0 } } }), /mayor que cero/);
  assert.throws(() => addObject(document, { type: "sketch", params: { points: [[0, 0], [10, 0]] } }), /entre 3/);
  assert.equal(serializeDocument(document), original);
  assert.deepEqual(removeObject(document, "base", { cascade: true }).map(({ id }) => id), ["base", "circulo", "herramienta", "corte"]);
});

test("las transformaciones usan grados y completan los ejes que la interfaz omite", () => {
  const document = createExampleDocument();
  const transformed = addObject(document, { type: "transform", params: { source: "soporte", x: 12, rz: 90 } });
  assert.deepEqual(transformed.params, { source: "soporte", x: 12, y: 0, z: 0, rx: 0, ry: 0, rz: 90 });
  updateObject(document, transformed.id, { params: { ry: -45 } });
  assert.equal(document.objects.at(-1).params.rz, 90);
  assert.throws(() => updateObject(document, transformed.id, { params: { rx: 360_001 } }), /grados/);
});

test("la importación acepta datos STEP o STL y rechaza código o datos corruptos", () => {
  const document = createDocument();
  const data = Buffer.from("ISO-10303-21;\nEND-ISO-10303-21;").toString("base64");
  addObject(document, { type: "import", params: { format: "step", data } });
  assert.equal(parseDocument(serializeDocument(document)).objects[0].params.data, data);
  assert.throws(() => addObject(document, { type: "import", params: { format: "js", data } }), /STEP o STL/);
  assert.throws(() => addObject(document, { type: "import", params: { format: "stl", data: "console.log('ejecutar')" } }), /base64/);
  assert.throws(() => parseDocument("window.proyecto = {}"), /JSON válido/);
  assert.throws(() => parseDocument('{"version":1,"name":"Importación","objects":[],"script":"alert(1)"}'), /no está permitido/);
  assert.throws(() => parseDocument('{"version":999,"name":"Importación","objects":[]}'), /versión/);
  assert.throws(() => parseDocument(" ".repeat(40 * 1024 * 1024 + 1)), /40 MB/);
});

test("el validador admite archivos base64 grandes sin desbordar su expresión regular", () => {
  const document = createDocument();
  const data = Buffer.alloc(2 * 1024 * 1024, 1).toString("base64");
  addObject(document, { type: "import", params: { format: "stl", data } });
  assert.equal(document.objects[0].params.data, data);
});

test("el límite de operaciones se aplica de forma atómica", () => {
  const document = createDocument();
  for (let i = 0; i < 100; i++) addObject(document, { type: "box", id: `caja-${i}` });
  assert.throws(() => addObject(document, { type: "sphere" }), /100 operaciones/);
  assert.equal(document.objects.length, 100);
});

test("deshacer restaura snapshots independientes y una edición elimina la rama de rehacer", () => {
  let document = createDocument();
  const history = new CadHistory(document);
  addObject(document, { type: "box", id: "base" });
  history.commit(document);
  updateObject(document, "base", { params: { width: 60 } });
  history.commit(document);
  document = history.undo();
  assert.equal(document.objects[0].params.width, 30);
  assert.equal(history.canRedo, true);
  document.objects[0].params.width = 45;
  assert.equal(history.current.objects[0].params.width, 30);
  history.commit(document);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo().objects[0].params.width, 45);
  assert.equal(history.undo().objects[0].params.width, 30);
  assert.equal(history.undo().objects.length, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.redo().objects.length, 1);
  history.reset(createExampleDocument());
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test("el historial limita memoria, omite duplicados y conserva estado al fallar una edición", () => {
  const document = createDocument();
  const history = new CadHistory(document, 2);
  addObject(document, { type: "box", id: "base" });
  history.commit(document);
  history.commit(document);
  updateObject(document, "base", { params: { width: 70 } });
  history.commit(document);
  assert.equal(history.undo().objects[0].params.width, 30);
  assert.equal(history.canUndo, false);
  const bad = history.current;
  bad.objects[0].params.height = -1;
  assert.throws(() => history.commit(bad));
  assert.equal(history.canRedo, true);
  assert.equal(history.redo().objects[0].params.width, 70);
});

test("el presupuesto del historial retira snapshots antiguos antes de acumular importaciones", () => {
  const document = createDocument("Pieza importada");
  const data = Buffer.alloc(48 * 1024, 1).toString("base64");
  addObject(document, { type: "import", id: "importada", params: { format: "stl", data } });
  const snapshotBytes = Buffer.byteLength(serializeDocument(document));
  const history = new CadHistory(document, 50, snapshotBytes * 2);
  assert.equal(new CadHistory().byteBudget, DOCUMENT_LIMITS.historyBytes);
  for (let i = 1; i <= 8; i++) {
    updateObject(document, "importada", { name: `Versión ${i}` });
    history.commit(document);
    assert.ok(history.byteSize <= history.byteBudget);
    assert.ok(history.snapshotCount <= 2);
  }
  assert.equal(history.current.objects[0].name, "Versión 8");
  assert.equal(history.undo().objects[0].name, "Versión 7");
  assert.equal(history.canUndo, false);
  assert.equal(history.redo().objects[0].params.data, data);
  history.undo();
  updateObject(document, "importada", { name: "Nueva rama" });
  history.commit(document);
  assert.equal(history.canRedo, false);
  assert.equal(history.byteSize, Buffer.byteLength(serializeDocument(history.current)) + Buffer.byteLength(serializeDocument(history.undo())));
});

test("un snapshot mayor que el presupuesto conserva el documento actual completo", () => {
  const document = createExampleDocument();
  const history = new CadHistory(createDocument(), 50, 100);
  history.commit(document);
  assert.deepEqual(history.current, document);
  assert.ok(history.byteSize > history.byteBudget);
  assert.equal(history.snapshotCount, 1);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  history.reset(createDocument());
  assert.equal(history.snapshotCount, 1);
  assert.equal(history.byteSize, Buffer.byteLength(serializeDocument(history.current)));
});
