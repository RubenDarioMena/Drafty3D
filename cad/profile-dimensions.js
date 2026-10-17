import { DOCUMENT_LIMITS } from './document.js';

const finitePoint = (point) => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === 'number' && Number.isFinite(value));
// Absorbe únicamente el redondeo de los cálculos, sin convertir un trapecio en rectángulo.
const same = (a, b) => Math.abs(a - b) <= 16 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
const supplied = (values, key, fallback) => values[key] === undefined ? fallback : values[key];

function measurements(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Las medidas deben ser un objeto.');
}

function coordinate(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} debe ser un número finito.`);
  if (Math.abs(value) > DOCUMENT_LIMITS.coordinate) throw new Error(`${label} supera el límite de ${DOCUMENT_LIMITS.coordinate} mm.`);
  return value;
}

function dimension(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} debe ser un número finito.`);
  if (value < DOCUMENT_LIMITS.minimumDimension) throw new Error(`${label} debe ser de al menos ${DOCUMENT_LIMITS.minimumDimension} mm.`);
  if (value > DOCUMENT_LIMITS.dimension) throw new Error(`${label} supera el límite de ${DOCUMENT_LIMITS.dimension} mm.`);
  return value;
}

function rectangleLayout(points) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(finitePoint)) return null;
  const [a, b, c, d] = points;
  const firstHorizontal = same(a[1], b[1]) && !same(a[0], b[0]);
  const firstVertical = same(a[0], b[0]) && !same(a[1], b[1]);
  if (!firstHorizontal && !firstVertical) return null;
  const expected = firstHorizontal
    ? [[c[0], a[1]], [a[0], c[1]]]
    : [[a[0], c[1]], [c[0], a[1]]];
  if (!expected[0].every((value, axis) => same(value, b[axis])) || !expected[1].every((value, axis) => same(value, d[axis]))) return null;
  if (same(a[0], c[0]) || same(a[1], c[1])) return null;
  return {
    u: a[0], v: a[1], width: Math.abs(c[0] - a[0]), height: Math.abs(c[1] - a[1]),
    directionU: Math.sign(c[0] - a[0]), directionV: Math.sign(c[1] - a[1]), firstHorizontal,
  };
}

/** Detecta cuatro esquinas consecutivas de un rectángulo paralelo a U/V.
 * U/V corresponden a la primera esquina dibujada, no al mínimo del contorno.
 * Acepta ambos sentidos y cualquier esquina inicial; devuelve null para otro perfil.
 */
export function measureRectangle(points) {
  const layout = rectangleLayout(points);
  if (!layout) return null;
  const { u, v, width, height } = layout;
  return { u, v, width, height };
}

/** Crea o redimensiona un rectángulo exacto sin modificar los argumentos.
 * Las cotas omitidas conservan el valor previo; un perfil nuevo parte de U=V=0.
 * previousPoints conserva la primera esquina, el cuadrante y el orden del contorno.
 * Devuelve parámetros de perfil aptos para un croquis o una extrusión.
 */
export function createRectangleProfile(values, previousPoints = []) {
  measurements(values);
  const previous = rectangleLayout(previousPoints);
  if (!Array.isArray(previousPoints) || (previousPoints.length && !previous)) throw new Error('El perfil existente no es un rectángulo paralelo a U/V.');
  const u = coordinate(supplied(values, 'u', previous?.u ?? 0), 'La esquina U');
  const v = coordinate(supplied(values, 'v', previous?.v ?? 0), 'La esquina V');
  const width = dimension(supplied(values, 'width', previous?.width), 'El ancho');
  const height = dimension(supplied(values, 'height', previous?.height), 'El alto');
  const endU = coordinate(u + width * (previous?.directionU ?? 1), 'La esquina opuesta U');
  const endV = coordinate(v + height * (previous?.directionV ?? 1), 'La esquina opuesta V');
  const points = previous?.firstHorizontal === false
    ? [[u, v], [u, endV], [endU, endV], [endU, v]]
    : [[u, v], [endU, v], [endU, endV], [u, endV]];
  return { points, profile: null };
}

/** Lee el centro U/V y radio de un círculo; devuelve null para otro perfil. */
export function measureCircle(profile) {
  if (profile?.type !== 'circle' || !finitePoint(profile.center) || typeof profile.radius !== 'number' || !Number.isFinite(profile.radius) || profile.radius <= 0) return null;
  return { u: profile.center[0], v: profile.center[1], radius: profile.radius };
}

/** Crea o modifica un círculo exacto. Las cotas omitidas conservan el valor previo.
 * Un círculo nuevo parte del origen; el radio siempre es positivo. No muta el perfil.
 */
export function createCircleProfile(values, previousProfile = null) {
  measurements(values);
  const previous = measureCircle(previousProfile);
  if (previousProfile != null && !previous) throw new Error('El perfil existente no es un círculo.');
  const u = coordinate(supplied(values, 'u', previous?.u ?? 0), 'El centro U');
  const v = coordinate(supplied(values, 'v', previous?.v ?? 0), 'El centro V');
  const radius = dimension(supplied(values, 'radius', previous?.radius), 'El radio');
  for (const center of [u, v]) {
    coordinate(center - radius, 'El borde del círculo');
    coordinate(center + radius, 'El borde del círculo');
  }
  return { points: [], profile: { type: 'circle', center: [u, v], radius } };
}
