export const WORK_PLANES = Object.freeze({
  XY: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  XZ: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
  YZ: { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
});

export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function onPlane(plane, x, y) {
  return plane.origin.map((value, i) => value + plane.u[i] * x + plane.v[i] * y);
}

export function extrusionPlane(params, supportPlane) {
  const base = supportPlane || params.plane || WORK_PLANES.XY;
  return { ...base, origin: base.origin.map((value, i) => value + (params[['x', 'y', 'z'][i]] || 0)) };
}
