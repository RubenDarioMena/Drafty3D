import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { toThree, verticalFov } from './camera.js';

// three's DRACOLoader references its decoders with import.meta.url, so Vite bundles them next to the app (offline).
export function createLoader() {
  return new GLTFLoader().setDRACOLoader(new DRACOLoader());
}

/** Loads Blender's evaluated step meshes. three.js only displays them; it never recomputes a modifier. */
export async function loadGeometries(loader, folderUrl, names) {
  const entries = await Promise.all([...new Set(names)].map(async name => {
    const gltf = await loader.loadAsync(new URL(name, folderUrl).href);
    let geometry;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(node => {
      if (node.isMesh && !geometry) geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    });
    return [name, geometry];
  }));
  return new Map(entries);
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a3a3a);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.scene.add(this.camera);
    this.recordFov = 30;
    this.needsRender = true;

    const grid = new THREE.GridHelper(20, 40, 0x555555, 0x474747);
    this.scene.add(grid);
    const axes = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-10, 0.001, 0), new THREE.Vector3(10, 0.001, 0),
      new THREE.Vector3(0, 0.001, 10), new THREE.Vector3(0, 0.001, -10),
    ]);
    axes.setAttribute('color', new THREE.Float32BufferAttribute([0.85, 0.3, 0.3, 0.85, 0.3, 0.3, 0.45, 0.75, 0.25, 0.45, 0.75, 0.25], 3));
    this.scene.add(new THREE.LineSegments(axes, new THREE.LineBasicMaterial({ vertexColors: true })));

    // View-relative "studio" lighting, close to Blender's Solid shading.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-1, 1.4, 1);
    this.camera.add(key);

    // Blender's viewport draws back faces too (an open cylinder shows its inner wall).
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }));
    this.scene.add(this.mesh);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.addEventListener('change', () => { this.needsRender = true; });

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      if (this.controls.enabled && this.controls.update()) this.needsRender = true;
      if (!this.needsRender) return;
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas.parentElement;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = verticalFov(this.recordFov, this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  setGeometry(geometry) {
    if (geometry && this.mesh.geometry !== geometry) {
      this.mesh.geometry = geometry;
      this.needsRender = true;
    }
  }

  setOrbit(enabled) {
    this.controls.enabled = enabled;
  }

  /** Moves to a camera Blender recorded; animated moves are GSAP tweens. */
  showCamera(record, duration = 0) {
    this.cameraTween?.kill();
    const to = { position: toThree(record.position), target: toThree(record.target), fov: record.fov };
    const from = {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      fov: this.recordFov,
    };
    const apply = t => {
      const mix = (a, b) => a.map((value, i) => value + (b[i] - value) * t);
      this.camera.position.set(...mix(from.position, to.position));
      this.controls.target.set(...mix(from.target, to.target));
      this.recordFov = from.fov + (to.fov - from.fov) * t;
      this.camera.fov = verticalFov(this.recordFov, this.camera.aspect);
      this.camera.lookAt(this.controls.target);
      this.camera.updateProjectionMatrix();
      this.needsRender = true;
    };
    if (!duration) {
      apply(1);
      return Promise.resolve();
    }
    const progress = { t: 0 };
    return new Promise(resolve => {
      this.cameraTween = gsap.to(progress, {
        t: 1, duration, ease: 'power2.inOut',
        onUpdate: () => apply(progress.t), onComplete: resolve, onInterrupt: resolve,
      });
    });
  }
}
