// Blender vs three.js check: both sides draw world normals (Blender axes) as colors for the same mesh and camera.
import * as THREE from 'three';
import { applyCamera } from './camera.js';
import { createLoader, loadSceneGeometries } from './viewer.js';

const SIZE = 384;
const loader = createLoader();
const examples = new URL('./examples/', document.baseURI);

const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
      gl_FragColor = vec4(vec3(n.x, -n.z, n.y) * 0.5 + 0.5, 1.0);
    }`,
});

async function pixelsOf(source) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, SIZE, SIZE);
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

export function compare(reference, rendered) {
  const inside = (data, i) => data[i * 4 + 3] > 127;
  const colorStep = (data, i, j) => Math.max(...[0, 1, 2].map(c => Math.abs(data[i * 4 + c] - data[j * 4 + c]))) / 255;
  // EEVEE and WebGL smooth edges differently, by up to a pixel. A pixel only one side covers is a
  // miss only when the other side has nothing next to it; thin pieces (table legs, fence boards) are
  // mostly edge, and shifting the camera half a pixel already moves IoU from 0.994 to 0.98.
  const around = [1, -1, SIZE, -SIZE, SIZE + 1, SIZE - 1, -SIZE + 1, -SIZE - 1];
  const near = (data, i) => around.some(offset => inside(data, i + offset));
  // The same goes for the line between two flat faces, when both pictures have it there: an edge, not
  // surface. A crease or a crack only one side shows still counts, and a face in the wrong place still
  // differs everywhere inside it.
  const edge = (data, i) => [1, -1, SIZE, -SIZE].some(offset => colorStep(data, i, i + offset) > 0.1);
  let union = 0;
  let intersection = 0;
  let interior = 0;
  let diffSum = 0;
  let bad = 0;
  const offsets = [-2, 2, -2 * SIZE, 2 * SIZE];
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const a = inside(reference, i);
    const b = inside(rendered, i);
    if (a || b) union += 1;
    if (a !== b && (a ? near(rendered, i) : near(reference, i))) intersection += 1;
    if (!(a && b)) continue;
    intersection += 1;
    if (offsets.some(offset => !inside(reference, i + offset) || !inside(rendered, i + offset))) continue;
    if (edge(reference, i) && edge(rendered, i)) continue;
    interior += 1;
    const diff = Math.max(...[0, 1, 2].map(c => Math.abs(reference[i * 4 + c] - rendered[i * 4 + c]))) / 255;
    diffSum += diff;
    if (diff > 0.1) bad += 1;
  }
  return {
    iou: union ? intersection / union : 1,
    meanDiff: interior ? diffSum / interior : 0,
    badFraction: interior ? bad / interior : 0,
    coverage: union / (SIZE * SIZE),
  };
}

// `debug` also returns three.js's picture, to look at a failing step next to Blender's.
window.verifyStep = async ({ timeline: timelinePath, mesh, camera, reference, debug = false }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const folder = new URL(timelinePath.replace(/[^/]+$/, ''), examples);
  // Every mesh in the file: one object in the modifier and sculpt lessons, the whole scene in Levels 1 and 2.
  const scene = new THREE.Scene();
  for (const geometry of (await loadSceneGeometries(loader, folder, [mesh])).get(mesh).values()) {
    scene.add(new THREE.Mesh(geometry, material));
  }
  const view = camera.ortho ? new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100) : new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  applyCamera(view, camera, 1);
  renderer.render(scene, view);
  const image = new Image();
  image.src = reference;
  await image.decode();
  const result = compare(await pixelsOf(image), await pixelsOf(renderer.domElement));
  if (debug) result.image = renderer.domElement.toDataURL();
  renderer.dispose();
  return result;
};

/**
 * Objects in a step's file, their vertex counts and where their vertices are: what changed when the
 * picture cannot show it (a name, a copy on top of the original, an Inset on a flat face).
 */
window.sceneStructure = async ({ timeline: timelinePath, mesh }) => {
  const folder = new URL(timelinePath.replace(/[^/]+$/, ''), examples);
  const objects = (await loadSceneGeometries(loader, folder, [mesh])).get(mesh);
  return [...objects].map(([name, geometry]) => {
    const position = geometry.getAttribute('position');
    // Sum of squared distances from the object's centre, to the millimetre: moving vertices inside a face changes it.
    let spread = 0;
    geometry.computeBoundingBox();
    const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) spread += point.fromBufferAttribute(position, i).distanceToSquared(centre);
    return [name, position.count, Math.round(spread * 1000)];
  }).sort();
};

document.documentElement.dataset.ready = 'true';
