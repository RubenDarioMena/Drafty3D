import { Mesh } from '../mesh.js';
import { faceNormal, unit } from './geometry.js';

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

const falloffs = {
  LINEAR: () => 0,
  SMOOTH: x => x * x * (3 - 2 * x),
  SPHERE: x => Math.sqrt(x * (2 - x)),
  ROOT: Math.sqrt,
  SHARP: x => x * x,
  INVERSE_SQUARE: x => x * (2 - x),
};

function vertexNormal(mesh, v) {
  const faces = new Set();
  for (const edge of mesh.vertexEdges.get(v)) for (const f of mesh.facesOfEdge(edge)) faces.add(f);
  const sum = [0, 0, 0];
  for (const f of faces) {
    const cycle = mesh.faces.get(f), i = cycle.indexOf(v);
    const ray = j => unit(sub(mesh.verts.get(cycle[j]), mesh.verts.get(v)));
    const cosine = dot(ray((i + cycle.length - 1) % cycle.length), ray((i + 1) % cycle.length));
    const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
    faceNormal(mesh, f).forEach((x, j) => { sum[j] += angle * x; });
  }
  return unit(sum);
}

// Circular arc through both endpoints, tangent to the first endpoint's plane.
// Reflecting its normal across the chord midpoint gives the other radial normal.
function arc(a, b, normal, t) {
  const chord = sub(b, a), direction = unit(chord);
  const axial = dot(direction, normal);
  const radial = normal.map((x, i) => x - axial * direction[i]);
  if (4 * axial * axial < 1e-5 || Math.hypot(...radial) < 1e-8) return mix(a, b, t);
  const halfAngle = Math.asin(Math.min(1, Math.abs(axial)));
  const angle = (2 * t - 1) * halfAngle;
  const along = (1 + Math.sin(angle) / Math.abs(axial)) / 2;
  const rise = Math.hypot(...chord) * (Math.cos(halfAngle) - Math.cos(angle)) / (2 * axial);
  const outward = unit(radial);
  return a.map((x, i) => x + along * chord[i] + rise * outward[i]);
}

function smoothRail(mesh, start, end, smoothness, falloff) {
  const a = mesh.verts.get(start), b = mesh.verts.get(end);
  if (!smoothness) return t => mix(a, b, t);
  const na = vertexNormal(mesh, start), nb = vertexNormal(mesh, end);
  // Loop Cut uses even smoothing: compensate for the angle between endpoint normals.
  const projection = Math.abs(dot(na, unit(na.map((x, i) => x + nb[i]))));
  const strength = projection > 1e-8 ? smoothness / projection : smoothness;
  return t => {
    const curve = mix(arc(a, b, na, t), arc(b, a, nb, 1 - t), t);
    return mix(mix(a, b, t), curve, strength * (1 + falloffs[falloff](2 * Math.min(t, 1 - t))));
  };
}

// Orient all rails from the same side of the strip, independent of the click.
function railsOf(mesh, ring) {
  let first = Infinity;
  for (const edge of ring) first = Math.min(first, edge);
  const rails = new Map([[first, mesh.edges.get(first)]]);
  for (const [edge, [start]] of rails) {
    for (const face of mesh.facesOfEdge(edge)) {
      const cycle = mesh.faces.get(face);
      if (cycle.length !== 4) continue;
      const i = cycle.findIndex((v, j) => mesh.edgeBetween(v, cycle[(j + 1) % 4]) === edge);
      const a = cycle[(i + 3) % 4], b = cycle[(i + 2) % 4];
      const opposite = mesh.edgeBetween(a, b);
      if (ring.has(opposite) && !rails.has(opposite)) rails.set(opposite, cycle[i] === start ? [a, b] : [b, a]);
    }
  }
  return rails;
}

export function loopCut(baseMesh, { edge, numberCuts = 1, smoothness = 0, falloff = 'INVERSE_SQUARE', edgeSlide = 0 }) {
  if (!Number.isSafeInteger(numberCuts) || numberCuts < 1 || !Number.isFinite(smoothness) ||
      !Number.isFinite(edgeSlide) || !Object.hasOwn(falloffs, falloff)) throw new RangeError('Invalid loop cut');
  const rails = railsOf(baseMesh, baseMesh.edgeRing(edge));
  const mesh = Object.assign(new Mesh(), structuredClone(baseMesh));
  mesh.selection = { verts: new Set(), edges: new Set(), faces: new Set() };
  const paths = new Map(), faces = new Set();
  for (const [id, [start, end]] of rails) {
    const a = mesh.verts.get(start), b = mesh.verts.get(end);
    const pointAt = smoothRail(baseMesh, start, end, smoothness, falloff);
    const points = [a];
    for (let k = 1; k <= numberCuts; k++) points.push(pointAt(k / (numberCuts + 1)));
    points.push(b);
    const path = [start];
    for (let k = 1; k <= numberCuts; k++) {
      // Positive slide moves toward the start of the oriented rail.
      const target = points[k - Math.sign(edgeSlide)];
      const v = mesh.addVert(mix(points[k], target, Math.min(1, Math.abs(edgeSlide))));
      path.push(v);
      mesh.selection.verts.add(v);
    }
    paths.set(id, [...path, end]);
    for (const f of mesh.facesOfEdge(id)) faces.add(f);
  }

  function pathFrom(a, b) {
    const path = paths.get(baseMesh.edgeBetween(a, b));
    if (!path) return [a, b];
    return path[0] === a ? path : path.toReversed();
  }

  for (const f of faces) {
    const cycle = baseMesh.faces.get(f), n = cycle.length;
    mesh.removeFace(f);
    const i = cycle.findIndex((a, j) => paths.has(baseMesh.edgeBetween(a, cycle[(j + 1) % n])));
    if (n !== 4 || !paths.has(baseMesh.edgeBetween(cycle[(i + 2) % n], cycle[(i + 3) % n]))) {
      // The ring stops here, but the adjacent polygon must share the split edge.
      mesh.addFace(cycle.flatMap((v, j) => pathFrom(v, cycle[(j + 1) % n]).slice(0, -1)));
      continue;
    }
    const left = pathFrom(cycle[i], cycle[(i + 1) % 4]);
    const right = pathFrom(cycle[(i + 3) % 4], cycle[(i + 2) % 4]);
    for (let k = 1; k < left.length; k++) {
      mesh.addFace([left[k - 1], left[k], right[k], right[k - 1]]);
      if (k <= numberCuts) mesh.selection.edges.add(mesh.edgeBetween(left[k], right[k]));
    }
  }
  for (const [id, path] of paths) {
    mesh.removeEdge(id);
    if (!faces.size) for (let k = 1; k < path.length; k++) mesh.addEdge(path[k - 1], path[k]);
  }
  return mesh;
}

export const redo = loopCut;
