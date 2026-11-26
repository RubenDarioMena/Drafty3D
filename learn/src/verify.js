// Blender vs three.js check: both sides draw world normals (Blender axes) as colors for the same mesh and camera.
import * as THREE from 'three';
import { applyCamera } from './camera.js';
import { createLoader, loadGeometries } from './viewer.js';

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
    if (!(a && b)) continue;
    intersection += 1;
    if (offsets.some(offset => !inside(reference, i + offset) || !inside(rendered, i + offset))) continue;
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

window.verifyStep = async ({ timeline: timelinePath, mesh, camera, reference }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  const folder = new URL(timelinePath.replace(/[^/]+$/, ''), examples);
  const geometry = (await loadGeometries(loader, folder, [mesh])).get(mesh);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const view = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  applyCamera(view, camera, 1);
  renderer.render(scene, view);
  const image = new Image();
  image.src = reference;
  await image.decode();
  const result = compare(await pixelsOf(image), await pixelsOf(renderer.domElement));
  renderer.dispose();
  return result;
};

document.documentElement.dataset.ready = 'true';
