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

/** Half the visible height of an orthographic view (`ortho`, recorded on a square render) on any screen. */
export function orthoHalfHeight(ortho, aspect) {
  return aspect >= 1 ? ortho : ortho / aspect;
}

/**
 * Where a three.js camera with +Y up stands for a recorded view. Top and bottom views record
 * Blender's `up` (the screen's up direction): the camera steps a hair away from it, so three's
 * Y-up look-at turns the picture the same way and orbiting still works.
 */
export function cameraPose(record) {
  const position = toThree(record.position);
  const target = toThree(record.target);
  const distance = Math.hypot(...position.map((value, i) => value - target[i]));
  // Only straight-down or straight-up views need it; any other Blender view has no roll.
  if (record.up && Math.abs(position[1] - target[1]) > distance * 0.999) {
    const up = toThree(record.up);
    position.forEach((value, i) => { position[i] = value - up[i] * distance * 1e-3; });
  }
  return { position, target };
}

export function applyCamera(camera, record, aspect) {
  const { position, target } = cameraPose(record);
  camera.position.set(...position);
  camera.up.set(0, 1, 0);
  if (camera.isOrthographicCamera) {
    const half = orthoHalfHeight(record.ortho, aspect);
    Object.assign(camera, { top: half, bottom: -half, left: -half * aspect, right: half * aspect, zoom: 1 });
  } else {
    camera.aspect = aspect;
    camera.fov = verticalFov(record.fov, aspect);
  }
  camera.lookAt(...target);
  camera.updateProjectionMatrix();
}
