export function unit(vector) {
  const length = Math.hypot(...vector);
  return vector.map(x => length ? x / length : 0);
}

export function cross(a, b) {
  return a.map((_, i) => {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    return a[j] * b[k] - a[k] * b[j];
  });
}

function cycleOf(mesh, face) {
  const cycle = mesh.faces.get(face);
  if (!cycle) throw new RangeError('Unknown face');
  return cycle;
}

// Newell's method uses the entire oriented polygon, including collinear corners.
export function faceNormal(mesh, face) {
  const cycle = cycleOf(mesh, face);
  const normal = [0, 0, 0];
  cycle.forEach((v, i) => {
    const a = mesh.verts.get(v), b = mesh.verts.get(cycle[(i + 1) % cycle.length]);
    for (let axis = 0; axis < 3; axis++) {
      const j = (axis + 1) % 3, k = (axis + 2) % 3;
      normal[axis] += (a[j] - b[j]) * (a[k] + b[k]);
    }
  });
  return unit(normal);
}

export function faceCenter(mesh, face) {
  const cycle = cycleOf(mesh, face);
  return [0, 1, 2].map(axis =>
    cycle.reduce((sum, v) => sum + mesh.verts.get(v)[axis], 0) / cycle.length);
}

export function regionNormal(mesh, faces) {
  const sum = [0, 0, 0];
  for (const face of faces) {
    faceNormal(mesh, face).forEach((x, i) => { sum[i] += x; });
  }
  return unit(sum);
}

export function normalOffset(mesh, faces, distance) {
  if (!Number.isFinite(distance)) throw new RangeError('Invalid distance');
  const scale = mesh.transform?.scale ?? [1, 1, 1];
  if (scale.includes(0)) throw new RangeError('Cannot invert zero scale');
  // Transform the normal by inverse transpose and normalize in world units.
  // Object rotation cancels when transforming the translation back to local space.
  const direction = unit(regionNormal(mesh, faces).map((x, i) => x / scale[i]));
  return direction.map((x, i) => distance * x / scale[i]);
}
