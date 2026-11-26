// Timeline cameras are stored in Blender coordinates (Z up); three.js and glTF use Y up.
export function toThree([x, y, z]) {
  return [x, z, -y];
}

/**
 * Blender recorded `fov` as the vertical angle of a square render. Keep that
 * framing visible on any screen: on portrait views the width becomes the
 * limiting side, so the vertical angle grows.
 */
export function verticalFov(fov, aspect) {
  if (aspect >= 1) return fov;
  return (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * 180) / Math.PI;
}

export function applyCamera(camera, record, aspect) {
  camera.position.set(...toThree(record.position));
  camera.up.set(0, 1, 0);
  camera.aspect = aspect;
  camera.fov = verticalFov(record.fov, aspect);
  camera.lookAt(...toThree(record.target));
  camera.updateProjectionMatrix();
}
