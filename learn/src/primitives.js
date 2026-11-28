// Faces are outward-oriented cycles in Blender local coordinates.
function mesh(verts, faces) {
  const edges = new Map();
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length];
      const key = [Math.min(a, b), Math.max(a, b)].join(',');
      if (!edges.has(key)) edges.set(key, [a, b]);
    });
  }
  return { verts, edges: [...edges.values()], faces };
}

export function cube({ size = 2 } = {}) {
  const verts = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    verts.push([x, y, z].map(v => v * size / 2));
  }
  return mesh(verts, [[0,1,3,2], [2,3,7,6], [6,7,5,4], [4,5,1,0], [2,6,4,0], [7,3,1,5]]);
}

export function grid({ x_subdivisions: nx = 10, y_subdivisions: ny = 10, size = 2 } = {}) {
  const verts = [], faces = [];
  for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
    const i = verts.length;
    verts.push([(x / nx - 0.5) * size, (y / ny - 0.5) * size, 0]);
    if (x && y) faces.push([i - nx - 2, i - nx - 1, i, i - 1]);
  }
  return mesh(verts, faces);
}

export function plane({ size = 2 } = {}) {
  return grid({ size, x_subdivisions: 1, y_subdivisions: 1 });
}

export function cylinder({ vertices = 32, radius = 1, depth = 2 } = {}) {
  const verts = [], faces = [], bottom = [], top = [];
  for (let i = 0; i < vertices; i++) {
    const angle = 2 * Math.PI * i / vertices;
    const x = radius * Math.sin(angle), y = radius * Math.cos(angle);
    verts.push([x, y, -depth / 2], [x, y, depth / 2]);
    const a = 2 * i, b = 2 * ((i + 1) % vertices);
    faces.push([a, a + 1, b + 1, b]);
    bottom.push(a);
    top.push(a + 1);
  }
  return mesh(verts, [...faces, bottom, top.reverse()]);
}

export function uvSphere({ segments = 32, ring_count = 16, radius = 1 } = {}) {
  const verts = [[0, 0, radius]], faces = [];
  const south = 1 + (ring_count - 1) * segments;
  for (let r = 1; r < ring_count; r++) {
    const latitude = Math.PI * r / ring_count;
    for (let s = 0; s < segments; s++) {
      const longitude = 2 * Math.PI * s / segments;
      const width = radius * Math.sin(latitude);
      verts.push([-width * Math.sin(longitude), width * Math.cos(longitude), radius * Math.cos(latitude)]);
      const a = verts.length - 1;
      const b = a - s + (s + 1) % segments;
      faces.push(r === 1 ? [0, a, b] : [a - segments, a, b, b - segments]);
      if (r === ring_count - 1) faces.push([a, south, b]);
    }
  }
  verts.push([0, 0, -radius]);
  return mesh(verts, faces);
}
