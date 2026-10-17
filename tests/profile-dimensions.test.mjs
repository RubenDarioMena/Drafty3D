import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_LIMITS, createDocument, addObject } from '../cad/document.js';
import { measureRectangle, createRectangleProfile, measureCircle, createCircleProfile } from '../cad/profile-dimensions.js';

test('las medidas exactas admiten decimales y producen parámetros válidos del documento', () => {
  const rectangle = createRectangleProfile({ u: -2.25, v: 3.5, width: 40.5, height: 30.25 });
  assert.deepEqual(rectangle, { points: [[-2.25, 3.5], [38.25, 3.5], [38.25, 33.75], [-2.25, 33.75]], profile: null });
  assert.deepEqual(measureRectangle(rectangle.points), { u: -2.25, v: 3.5, width: 40.5, height: 30.25 });
  const circle = createCircleProfile({ u: -5.25, v: 7.5, radius: 2.125 });
  assert.deepEqual(measureCircle(circle.profile), { u: -5.25, v: 7.5, radius: 2.125 });
  const document = createDocument();
  for (const params of [rectangle, circle]) addObject(document, { type: 'extrusion', params });
});

test('redimensionar conserva la esquina inicial y el sentido en los cuatro cuadrantes', () => {
  for (const signU of [-1, 1]) for (const signV of [-1, 1]) for (const verticalFirst of [false, true]) {
    const start = [12.5, -4.25];
    const end = [start[0] + signU * 40, start[1] + signV * 30];
    const previous = verticalFirst
      ? [start, [start[0], end[1]], end, [end[0], start[1]]]
      : [start, [end[0], start[1]], end, [start[0], end[1]]];
    const snapshot = structuredClone(previous);
    const resized = createRectangleProfile({ width: 5.5, height: 2.25 }, previous);
    assert.deepEqual(resized.points[0], start);
    assert.deepEqual(resized.points[2], [start[0] + signU * 5.5, start[1] + signV * 2.25]);
    assert.equal(resized.points[1][verticalFirst ? 0 : 1], start[verticalFirst ? 0 : 1]);
    assert.deepEqual(measureRectangle(resized.points), { u: 12.5, v: -4.25, width: 5.5, height: 2.25 });
    assert.deepEqual(previous, snapshot, 'La edición no modifica el perfil de entrada.');
  }
});

test('cambiar U/V desplaza la esquina anclada sin cambiar tamaño ni orientación', () => {
  const original = [[10, 20], [-30, 20], [-30, -10], [10, -10]];
  assert.deepEqual(createRectangleProfile({ u: 3.25, v: -1.5 }, original).points, [[3.25, -1.5], [-36.75, -1.5], [-36.75, -31.5], [3.25, -31.5]]);
  const circle = { type: 'circle', center: [-1.5, 6.25], radius: 4.125 };
  assert.deepEqual(createCircleProfile({ radius: 7.5 }, circle).profile, { ...circle, radius: 7.5 });
  assert.deepEqual(createCircleProfile({ u: 8, v: -2 }, circle).profile, { type: 'circle', center: [8, -2], radius: 4.125 });
  assert.deepEqual(circle.center, [-1.5, 6.25]);
  assert.equal(circle.radius, 4.125);
});

test('la detección no confunde polígonos, cruces ni perfiles degenerados con rectángulos', () => {
  for (const points of [
    null, [], [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 1], [0, 1], [1, 0]],
    [[0, 0], [1, 0], [1, 0], [0, 0]],
    [[0, 0], [4, 0], [3, 3], [0, 3]],
    [[0, 0], [1, 1], [0, 2], [-1, 1]],
    [[0, 0], [1, 0], [1, 1], [0.00001, 1]],
    [[0, 0], [1, 0], [1, Infinity], [0, 1]],
    [[0, 0], [1, 0], [1, 1], ['0', 1]],
  ]) assert.equal(measureRectangle(points), null);
  assert.deepEqual(measureRectangle([[0.1 + 0.2, 0], [4, 0], [4, 3], [0.3, 3]]), { u: 0.1 + 0.2, v: 0, width: 4 - (0.1 + 0.2), height: 3 });
  assert.throws(() => createRectangleProfile({ width: 4, height: 3 }, [[0, 0], [1, 0], [0, 1]]), /no es un rectángulo/);
});

test('las cotas rechazan valores no finitos, nulos, negativos y fuera del límite', () => {
  for (const value of [null, NaN, Infinity, -Infinity, '12', 0, -2, DOCUMENT_LIMITS.minimumDimension / 2, DOCUMENT_LIMITS.dimension + 1]) {
    assert.throws(() => createRectangleProfile({ width: value, height: 2 }));
    assert.throws(() => createRectangleProfile({ width: 2, height: value }));
    assert.throws(() => createCircleProfile({ radius: value }));
  }
  for (const value of [null, NaN, Infinity, '2', DOCUMENT_LIMITS.coordinate + 1, -DOCUMENT_LIMITS.coordinate - 1]) {
    assert.throws(() => createRectangleProfile({ u: value, width: 2, height: 2 }));
    assert.throws(() => createRectangleProfile({ v: value, width: 2, height: 2 }));
    assert.throws(() => createCircleProfile({ u: value, radius: 2 }));
    assert.throws(() => createCircleProfile({ v: value, radius: 2 }));
  }
  assert.throws(() => createRectangleProfile({ u: DOCUMENT_LIMITS.coordinate, width: 2, height: 2 }), /esquina opuesta/);
  assert.throws(() => createCircleProfile({ u: DOCUMENT_LIMITS.coordinate, radius: 2 }), /borde/);
  assert.throws(() => createCircleProfile({ radius: 2 }, { type: 'circle', center: [0, 0], radius: NaN }), /no es un círculo/);
});

test('los extremos permitidos y los orígenes predeterminados son utilizables', () => {
  for (const value of [DOCUMENT_LIMITS.minimumDimension, DOCUMENT_LIMITS.dimension]) {
    const rectangle = createRectangleProfile({ width: value, height: value });
    assert.deepEqual(measureRectangle(rectangle.points), { u: 0, v: 0, width: value, height: value });
    const circle = createCircleProfile({ radius: value });
    assert.deepEqual(measureCircle(circle.profile), { u: 0, v: 0, radius: value });
  }
  assert.deepEqual(createRectangleProfile({ u: DOCUMENT_LIMITS.coordinate - 1, v: -DOCUMENT_LIMITS.coordinate, width: 1, height: 1 }).points[2], [DOCUMENT_LIMITS.coordinate, -DOCUMENT_LIMITS.coordinate + 1]);
});
