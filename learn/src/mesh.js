const kinds = ['verts', 'edges', 'faces'];
const key = (a, b) => a < b ? [a, b].join(',') : [b, a].join(',');

// Blender XYZ Euler rotation applies X first, then Y, then Z.
function coordinates({ location = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }, inverse) {
  if (inverse && scale.includes(0)) throw new RangeError('Cannot invert zero scale');
  const angles = rotation.map(degrees => degrees * Math.PI / 180 * (inverse ? -1 : 1));
  const cos = angles.map(Math.cos);
  const sin = angles.map(Math.sin);
  const axes = inverse ? [2, 1, 0] : [0, 1, 2];
  return point => {
    const p = Array.from(point, (v, i) => inverse ? v - location[i] : v * scale[i]);
    for (const axis of axes) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      [p[a], p[b]] = [cos[axis] * p[a] - sin[axis] * p[b], sin[axis] * p[a] + cos[axis] * p[b]];
    }
    return p.map((v, i) => inverse ? v / scale[i] : v + location[i]);
  };
}

export class Mesh {
  constructor() {
    for (const kind of kinds) this[kind] = new Map();
    this.nextId = { verts: 0, edges: 0, faces: 0 };
    // Maps indices in the imported snapshot to stable IDs.
    this.indexMap = { verts: [], edges: [], faces: [] };
    this.vertexEdges = new Map();
    this.edgeFaces = new Map();
    this.edgeIds = new Map();
    this.selection = { verts: new Set(), edges: new Set(), faces: new Set() };
  }

  addVert(point) {
    if (point.length !== 3 || !point.every(Number.isFinite)) throw new RangeError('Invalid vertex');
    const id = this.nextId.verts++;
    this.verts.set(id, new Float64Array(point));
    this.vertexEdges.set(id, new Set());
    return id;
  }

  addEdge(a, b) {
    if (!this.verts.has(a) || !this.verts.has(b) || a === b) throw new RangeError('Invalid endpoints');
    const existing = this.edgeBetween(a, b);
    if (existing !== undefined) return existing;
    const id = this.nextId.edges++;
    this.edges.set(id, [a, b]);
    this.edgeIds.set(key(a, b), id);
    this.edgeFaces.set(id, new Set());
    this.vertexEdges.get(a).add(id);
    this.vertexEdges.get(b).add(id);
    return id;
  }

  addFace(cycle) {
    if (cycle.length < 3 || new Set(cycle).size !== cycle.length || !cycle.every(v => this.verts.has(v))) {
      throw new RangeError('Invalid face cycle');
    }
    const id = this.nextId.faces++;
    this.faces.set(id, Array.from(cycle));
    cycle.forEach((a, i) => {
      const edge = this.addEdge(a, cycle[(i + 1) % cycle.length]);
      this.edgeFaces.get(edge).add(id);
    });
    return id;
  }

  // Remove one element at a time, from faces down to unused edges and vertices.
  removeFace(id) {
    const cycle = this.faces.get(id);
    if (!cycle) throw new RangeError('Unknown face');
    cycle.forEach((a, i) => {
      this.edgeFaces.get(this.edgeBetween(a, cycle[(i + 1) % cycle.length])).delete(id);
    });
    this.faces.delete(id);
    this.selection.faces.delete(id);
  }

  removeEdge(id) {
    if (this.edgeFaces.get(id)?.size !== 0) throw new RangeError('Expected an unused edge');
    const [a, b] = this.edges.get(id);
    this.vertexEdges.get(a).delete(id);
    this.vertexEdges.get(b).delete(id);
    this.edgeIds.delete(key(a, b));
    this.edgeFaces.delete(id);
    this.edges.delete(id);
    this.selection.edges.delete(id);
  }

  removeVert(id) {
    if (this.vertexEdges.get(id)?.size !== 0) throw new RangeError('Expected an isolated vertex');
    this.vertexEdges.delete(id);
    this.verts.delete(id);
    this.selection.verts.delete(id);
  }

  edgeBetween(a, b) { return this.edgeIds.get(key(a, b)); }

  facesOfEdge(id) { return this.edgeFaces.get(id); }

  edgeRing(edgeId) {
    if (!this.edges.has(edgeId)) throw new RangeError('Unknown edge');
    const ring = new Set([edgeId]);
    for (const edge of ring) {
      const faces = this.facesOfEdge(edge);
      if (faces.size > 2) continue;
      for (const face of faces) {
        const cycle = this.faces.get(face);
        if (cycle.length !== 4) continue;
        const i = cycle.findIndex((v, j) => this.edgeBetween(v, cycle[(j + 1) % 4]) === edge);
        ring.add(this.edgeBetween(cycle[(i + 2) % 4], cycle[(i + 3) % 4]));
      }
    }
    return ring;
  }

  edgeLoop(edgeId) {
    if (!this.edges.has(edgeId)) throw new RangeError('Unknown edge');
    const loop = new Set([edgeId]);
    for (const edge of loop) {
      for (const v of this.edges.get(edge)) {
        const spokes = this.vertexEdges.get(v);
        if (spokes.size !== 4 || ![...spokes].every(e => this.facesOfEdge(e).size === 2 &&
          [...this.facesOfEdge(e)].every(f => this.faces.get(f).length === 4))) continue;
        // The opposite spoke shares neither of the incoming edge's two quads.
        const opposite = [...spokes].filter(e =>
          [...this.facesOfEdge(e)].every(f => !this.facesOfEdge(edge).has(f)));
        if (opposite.length === 1) loop.add(opposite[0]);
      }
    }
    return loop;
  }
}

export function fromEdit(edit, transform = {}) {
  const mesh = new Mesh();
  mesh.object = edit.object;
  mesh.transform = transform;
  const local = coordinates(transform, true);
  for (const point of edit.verts) mesh.indexMap.verts.push(mesh.addVert(local(point)));
  for (const [a, b] of edit.edges) {
    mesh.indexMap.edges.push(mesh.addEdge(mesh.indexMap.verts[a], mesh.indexMap.verts[b]));
  }
  for (const face of edit.faces) {
    mesh.indexMap.faces.push(mesh.addFace(face.map(i => mesh.indexMap.verts[i])));
  }
  if (edit.selection) applySelection(mesh, edit.selection);
  return mesh;
}

export function applySelection(mesh, selection, indexMap = mesh.indexMap) {
  mesh.selection = Object.fromEntries(kinds.map(kind => [kind, new Set(selection[kind].map(i => {
    const id = indexMap[kind][i];
    if (!mesh[kind].has(id)) throw new RangeError('Unknown ' + kind + ' index ' + i);
    return id;
  }))]));
}

export function toEdit(mesh, transform = mesh.transform ?? {}) {
  const world = coordinates(transform, false);
  const dense = {};
  const selection = {};
  for (const kind of kinds) {
    dense[kind] = new Map(Array.from(mesh[kind].keys(), (id, i) => [id, i]));
    selection[kind] = Array.from(mesh.selection[kind], id => dense[kind].get(id));
  }
  const indices = cycle => cycle.map(id => dense.verts.get(id));
  return { object: mesh.object, verts: Array.from(mesh.verts.values(), world),
    edges: Array.from(mesh.edges.values(), indices), faces: Array.from(mesh.faces.values(), indices), selection };
}
