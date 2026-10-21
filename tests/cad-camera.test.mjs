import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CadViewport } from '../cad/viewport.js';

test('seleccionar antes del próximo frame utiliza la cámara y el plano actuales', () => {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
  camera.position.set(100, -130, 105);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const viewport = {
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 50, top: 20, width: 600, height: 600 }) } },
    camera, pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(),
  };
  const focus = new THREE.Vector3(10, 20, 30);
  for (const normal of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)]) {
    camera.up.copy(normal.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
    camera.position.copy(focus).addScaledVector(normal, 100);
    camera.lookAt(focus);
    // No render or camera matrix refresh here: this is an immediate pointer event.
    CadViewport.prototype.updateRay.call(viewport, { clientX: 350, clientY: 320 });
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, focus);
    const hit = viewport.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    assert.ok(hit && hit.distanceTo(focus) < 1e-8, 'El centro del canvas debe apuntar al centro del plano actual.');
    assert.ok(viewport.raycaster.ray.origin.distanceTo(camera.position) < 1e-8);
  }
});
