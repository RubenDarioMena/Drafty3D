// Presupuesto del archivo y del trabajo de selección, no solo del renderizado.
export const MAX_MESH_TRIANGLES = 250_000;
export const MESH_QUALITIES = Object.freeze([
  { label: 'Mínima', ratio: 0.02, angle: 0.75 },
  { label: 'Estándar', ratio: 0.006, angle: 0.4 },
  { label: 'Fina', ratio: 0.002, angle: 0.2 },
  { label: 'Alta', ratio: 0.0006, angle: 0.1 },
  { label: 'Muy alta', ratio: 0.0002, angle: 0.05 },
]);

export function meshQuality(level, extent) {
  if (!Number.isInteger(level) || !MESH_QUALITIES[level]) throw new Error('Elige una resolución de malla válida.');
  return { ...MESH_QUALITIES[level], deflection: Math.max(0.0001, Math.min(10, Math.max(extent, 0.001) * MESH_QUALITIES[level].ratio)) };
}

export function recommendedMeshQuality(level, { milliseconds, triangles, sceneTriangles }) {
  // La teselación de curvas crece aproximadamente con el cuadrado de la densidad.
  // Esto es una estimación; cada vista previa mide la escena y el picking reales.
  const available = Math.max(0, MAX_MESH_TRIANGLES - Math.max(0, sceneTriangles - triangles));
  const timeHeadroom = 24 / Math.max(1, milliseconds);
  const memoryHeadroom = available / Math.max(1, triangles);
  const headroom = Math.min(timeHeadroom, memoryHeadroom);
  return Math.max(0, Math.min(4, level + Math.floor(Math.log(Math.max(0.01, headroom)) / Math.log(4))));
}

export function binaryStl(mesh) {
  const triangles = mesh.indices.length / 3;
  if (!Number.isInteger(triangles) || triangles < 1 || triangles > MAX_MESH_TRIANGLES) throw new Error('La malla excede el presupuesto de triángulos. Reduce la resolución.');
  const data = new Uint8Array(84 + triangles * 50);
  data.set(new TextEncoder().encode('Drafty3D mesh snapshot; units: mm'));
  const view = new DataView(data.buffer);
  view.setUint32(80, triangles, true);
  for (let face = 0; face < triangles; face++) {
    const vertices = [0, 1, 2].map(corner => Array.from(mesh.positions.subarray(mesh.indices[face * 3 + corner] * 3, mesh.indices[face * 3 + corner] * 3 + 3)));
    const [a, b, c] = vertices;
    const u = b.map((value, axis) => value - a[axis]);
    const v = c.map((value, axis) => value - a[axis]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal) || 1;
    const values = [...normal.map(value => value / length), ...vertices.flat()];
    values.forEach((value, index) => view.setFloat32(84 + face * 50 + index * 4, value, true));
  }
  return data;
}

export function bytesToBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
