import { Mesh } from '../mesh.js';
import { cross, faceNormal, unit } from './geometry.js';

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

function direction(mesh, a, b) {
  return unit(mesh.verts.get(b).map((x, i) => x - mesh.verts.get(a)[i]));
}

// For an even offset, project the displacement onto both incident edge normals.
function miter(inward, thickness) {
  if (inward.length !== 2) return [0, 0, 0];
  const [a, b] = inward;
  const divisor = 1 + dot(a, b);
  return a.map((x, i) => divisor > 1e-12 ? thickness * (x + b[i]) / divisor : 0);
}

function cornerAngle(mesh, prev, v, next) {
  const a = direction(mesh, v, prev), b = direction(mesh, v, next);
  // Half-angle form also matches Blender for a collapsed side of the inset.
  const opposite = dot(a, b) < 0;
  const chord = a.map((x, i) => opposite ? x + b[i] : x - b[i]);
  const angle = 2 * Math.asin(Math.min(1, Math.hypot(...chord) / 2));
  return opposite ? Math.PI - angle : angle;
}

function depthDirection(mesh, v, fan, connected, normals, boundaryNormals) {
  if (boundaryNormals.length === 2) {
    return unit(boundaryNormals[0].map((x, i) => x + boundaryNormals[1][i]));
  }
  const weighted = [0, 0, 0];
  for (const face of connected) {
    const { prev, b } = fan.get(face);
    const angle = cornerAngle(mesh, prev, v, b);
    normals.get(face).forEach((x, i) => { weighted[i] += angle * x; });
  }
  return unit(weighted);
}

// The ring inherits the source face normals. Blender weights the even-depth
// correction by corner angles measured after applying thickness.
function applyDepth(mesh, depth, directions, sourceNormals) {
  const offsets = new Map();
  for (const [v, normal] of directions) {
    offsets.set(v, { normal, shell: 0, totalAngle: 0 });
  }
  for (const [face, sourceNormal] of sourceNormals) {
    const cycle = mesh.faces.get(face);
    cycle.forEach((v, i) => {
      const offset = offsets.get(v);
      if (!offset) return;
      const angle = cornerAngle(mesh, cycle[(i + cycle.length - 1) % cycle.length], v,
        cycle[(i + 1) % cycle.length]);
      const projection = Math.abs(dot(sourceNormal, offset.normal));
      offset.shell += projection > 1e-6 ? angle / projection : angle;
      offset.totalAngle += angle;
    });
  }
  for (const [v, { normal, shell, totalAngle }] of offsets) {
    if (totalAngle) normal.forEach((x, i) => { mesh.verts.get(v)[i] += x * depth * shell / totalAngle; });
  }
}

export function insetRegion(baseMesh, {
  faces = baseMesh.selection.faces, thickness, depth = 0, useIndividual = false,
}) {
  if (!Number.isFinite(thickness) || !Number.isFinite(depth)) throw new RangeError('Invalid inset');
  const mesh = Object.assign(new Mesh(), structuredClone(baseMesh));
  const region = new Set(faces);
  if (!region.size) return mesh;

  const normals = new Map();
  const directions = new Map();
  const sourceNormals = new Map();
  const corners = new Map();
  const boundary = [];
  const oldEdges = new Set();
  for (const face of region) {
    normals.set(face, faceNormal(baseMesh, face));
    const cycle = baseMesh.faces.get(face);
    cycle.forEach((a, i) => {
      const b = cycle[(i + 1) % cycle.length];
      const edge = mesh.edgeBetween(a, b);
      oldEdges.add(edge);
      const neighbors = [...mesh.facesOfEdge(edge)].filter(f => f !== face && region.has(f));
      const neighbor = useIndividual || neighbors.length !== 1 ? undefined : neighbors[0];
      if (neighbor === undefined) boundary.push({ face, a, b });
      if (!corners.has(a)) corners.set(a, new Map());
      corners.get(a).set(face, { neighbor, b, prev: cycle[(i + cycle.length - 1) % cycle.length] });
    });
  }

  // Connect face corners through shared edges. Regions that only touch at a
  // vertex need separate inner vertices, as do neighboring individual insets.
  for (const [v, fan] of corners) {
    for (const [face, corner] of fan) {
      if (corner.neighbor !== undefined) fan.get(corner.neighbor).previousNeighbor = face;
    }
    for (const first of fan.keys()) {
      if (fan.get(first).inner !== undefined) continue;
      const connected = new Set([first]);
      const inward = [];
      const boundaryNormals = [];
      for (const face of connected) {
        const { neighbor, previousNeighbor, prev, b } = fan.get(face);
        const normal = normals.get(face);
        if (neighbor === undefined) {
          inward.push(unit(cross(normal, direction(baseMesh, v, b))));
          boundaryNormals.push(normal);
        } else connected.add(neighbor);
        if (previousNeighbor === undefined) {
          inward.push(unit(cross(normal, direction(baseMesh, prev, v))));
          boundaryNormals.push(normal);
        } else connected.add(previousNeighbor);
      }

      const move = miter(inward, thickness);
      const point = baseMesh.verts.get(v).map((x, i) => x + move[i]);
      const inner = inward.length ? mesh.addVert(point) : v;
      if (depth) directions.set(inner, depthDirection(baseMesh, v, fan, connected, normals, boundaryNormals));
      for (const face of connected) fan.get(face).inner = inner;
    }
  }

  const inner = (face, v) => corners.get(v).get(face).inner;
  mesh.selection = { verts: new Set(), edges: new Set(), faces: new Set() };
  for (const face of region) {
    const cap = baseMesh.faces.get(face).map(v => inner(face, v));
    mesh.removeFace(face);
    const capFace = mesh.addFace(cap);
    mesh.selection.faces.add(capFace);
    if (depth) sourceNormals.set(capFace, normals.get(face));
    cap.forEach((v, i) => {
      mesh.selection.verts.add(v);
      mesh.selection.edges.add(mesh.edgeBetween(v, cap[(i + 1) % cap.length]));
    });
  }
  for (const { face, a, b } of boundary) {
    const wall = mesh.addFace([a, b, inner(face, b), inner(face, a)]);
    if (depth) sourceNormals.set(wall, normals.get(face));
  }
  if (depth) applyDepth(mesh, depth, directions, sourceNormals);
  for (const edge of oldEdges) {
    if (!mesh.facesOfEdge(edge).size) mesh.removeEdge(edge);
  }
  return mesh;
}

export const redo = insetRegion;
