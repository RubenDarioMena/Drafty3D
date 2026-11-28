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
    this.indexMap = { verts: [], edges: [], faces: [] };
    this.vertexEdges = new Map();
    this.edgeFaces = new Map();
    this.edgeIds = new Map();
    this.selection = { verts: new Set(), edges: new Set(), faces: new Set() };
  }

  edgeBetween(a, b) { return this.edgeIds.get(key(a, b)); }

  facesOfEdge(id) { return this.edgeFaces.get(id); }
}

export function fromEdit(edit, transform = {}) {
  const mesh = new Mesh();
  mesh.object = edit.object;
  mesh.transform = transform;
  const local = coordinates(transform, true);
  function add(kind, value) {
    const id = mesh[kind].size;
    mesh[kind].set(id, value);
    mesh.indexMap[kind].push(id);
    return id;
  }
  for (const point of edit.verts) {
    const id = add('verts', new Float64Array(local(point)));
    mesh.vertexEdges.set(id, new Set());
  }
  for (const edge of edit.edges) {
    const [a, b] = edge.map(i => mesh.indexMap.verts[i]);
    const id = add('edges', [a, b]);
    mesh.edgeIds.set(key(a, b), id);
    mesh.edgeFaces.set(id, new Set());
    mesh.vertexEdges.get(a).add(id);
    mesh.vertexEdges.get(b).add(id);
  }
  for (const face of edit.faces) {
    const cycle = face.map(i => mesh.indexMap.verts[i]);
    const id = add('faces', cycle);
    cycle.forEach((a, i) => {
      const edge = mesh.edgeBetween(a, cycle[(i + 1) % cycle.length]);
      mesh.edgeFaces.get(edge).add(id);
    });
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
