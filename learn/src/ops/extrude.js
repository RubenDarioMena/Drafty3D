import { Mesh } from '../mesh.js';

// Return a new mesh. Face IDs and the translation are relative to the base mesh
// (offset is a vector in local Blender coordinates).
export function extrudeRegion(baseMesh, { faces = baseMesh.selection.faces, offset }) {
  if (offset?.length !== 3 || !offset.every(Number.isFinite)) throw new RangeError('Invalid offset');
  const mesh = Object.assign(new Mesh(), structuredClone(baseMesh));
  const region = new Set(faces);
  if (!region.size) return mesh;
  const copies = new Map();
  const regionEdges = new Map();
  const selection = { verts: new Set(), edges: new Set(), faces: new Set() };
  for (const face of region) {
    const cycle = mesh.faces.get(face);
    if (!cycle) throw new RangeError('Unknown region face');
    for (const v of cycle) {
      if (copies.has(v)) continue;
      const copy = mesh.addVert(mesh.verts.get(v).map((x, axis) => x + offset[axis]));
      copies.set(v, copy);
      selection.verts.add(copy);
    }
    selection.faces.add(mesh.addFace(cycle.map(v => copies.get(v))));
    cycle.forEach((a, i) => {
      const b = cycle[(i + 1) % cycle.length];
      const edge = mesh.edgeBetween(a, b);
      // A second selected face makes this an internal edge.
      regionEdges.set(edge, regionEdges.has(edge) ? null : [a, b]);
      selection.edges.add(mesh.edgeBetween(copies.get(a), copies.get(b)));
    });
  }

  for (const face of region) mesh.removeFace(face);
  for (const [edge, boundary] of regionEdges) {
    if (boundary) {
      // Follow the original face along the base and the opposite winding at the cap.
      const [a, b] = boundary;
      mesh.addFace([a, b, copies.get(b), copies.get(a)]);
    } else if (!mesh.facesOfEdge(edge).size) {
      mesh.removeEdge(edge);
    }
  }
  for (const v of copies.keys()) {
    if (!mesh.vertexEdges.get(v).size) mesh.removeVert(v);
  }
  mesh.selection = selection;
  return mesh;
}

// Adjust Last Operation evaluates the same operator on its saved pre-operation mesh.
export const redo = extrudeRegion;
