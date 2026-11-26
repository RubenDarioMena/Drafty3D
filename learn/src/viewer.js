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

    this.overlay = new StrokeOverlay(canvas.parentElement);

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      if (this.controls.enabled && this.controls.update()) this.needsRender = true;
      if (!this.needsRender) return;
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.overlay.update(this);
    });
  }

  showGuide(points, radius) {
    this.overlay.showGuide(points, radius);
    this.needsRender = true;
  }

  showBrush(point, radius) {
    this.overlay.showBrush(point, radius);
    this.needsRender = true;
  }

  hideBrush() {
    this.overlay.hideBrush();
  }

  clearOverlay() {
    this.overlay.clear();
  }

  /** Canvas pixel position of a point recorded in Blender's coordinates (Z up). */
  project(point) {
    const vector = new THREE.Vector3(...toThree(point)).project(this.camera);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    return { x: (vector.x + 1) / 2 * width, y: (1 - vector.y) / 2 * height, z: vector.z };
  }

  /** On-screen radius of a brush of `radius` metres centred on a Blender point. */
  projectRadius(point, radius) {
    const center = new THREE.Vector3(...toThree(point));
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(radius);
    const a = this.project(point);
    const edge = center.add(right).project(this.camera);
    const b = { x: (edge.x + 1) / 2 * this.canvas.clientWidth, y: (1 - edge.y) / 2 * this.canvas.clientHeight };
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /**
   * Plays one stroke as Blender computed it: both meshes come from Blender and share their
   * vertices, so the in-between frames only blend the two results along the brush path.
   * Grab moves its whole region with the cursor; other brushes change the surface as the
   * brush passes over it. Returns a function that sets the progress (0..1).
   */
  strokeMorph(from, to, stroke) {
    const start = from.getAttribute('position');
    const end = to.getAttribute('position');
    if (!start || !end || start.count !== end.count) return t => this.setGeometry(t < 1 ? from : to);
    const geometry = from.clone();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const startNormal = from.getAttribute('normal');
    const endNormal = to.getAttribute('normal');
    const moving = [];
    const timing = [];
    const trail = stroke.points.map(point => new THREE.Vector3(...toThree(point)));
    const vertex = new THREE.Vector3();
    for (let i = 0; i < start.count; i += 1) {
      const dx = end.getX(i) - start.getX(i);
      const dy = end.getY(i) - start.getY(i);
      const dz = end.getZ(i) - start.getZ(i);
      if (dx * dx + dy * dy + dz * dz < 1e-12) continue;
      moving.push(i);
      if (stroke.brushType === 'GRAB') {
        timing.push(0);
        continue;
      }
      // When the brush is closest to this vertex (mirrored copies use the mirrored trail).
      vertex.set(start.getX(i), start.getY(i), start.getZ(i));
      const mirror = vertex.x < 0 && trail.every(point => point.x >= 0);
      if (mirror) vertex.x = -vertex.x;
      let best = Infinity;
      let when = 0;
      trail.forEach((point, index) => {
        const distance = point.distanceToSquared(vertex);
        if (distance < best) {
          best = distance;
          when = index / Math.max(1, trail.length - 1);
        }
      });
      timing.push(when);
    }
    this.setGeometry(geometry);
    const soft = 0.18;
    return t => {
      moving.forEach((i, k) => {
        const local = stroke.brushType === 'GRAB' ? t : Math.min(1, Math.max(0, (t * (1 + soft) - timing[k]) / soft));
        position.setXYZ(i, start.getX(i) + (end.getX(i) - start.getX(i)) * local,
          start.getY(i) + (end.getY(i) - start.getY(i)) * local,
          start.getZ(i) + (end.getZ(i) - start.getZ(i)) * local);
        if (normal && startNormal && endNormal) {
          normal.setXYZ(i, startNormal.getX(i) + (endNormal.getX(i) - startNormal.getX(i)) * local,
            startNormal.getY(i) + (endNormal.getY(i) - startNormal.getY(i)) * local,
            startNormal.getZ(i) + (endNormal.getZ(i) - startNormal.getZ(i)) * local);
        }
      });
      position.needsUpdate = true;
      if (normal) normal.needsUpdate = true;
      this.needsRender = true;
      if (t >= 1) {
        this.setGeometry(to);
        geometry.dispose();
      }
    };
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

/**
 * 2D layer over the 3D view: the brush ring (Blender's circle cursor) and the dotted guide
 * of a stroke. Both are kept in 3D and re-projected every frame, so they follow the camera.
 */
class StrokeOverlay {
  constructor(parent) {
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.classList.add('stroke-overlay');
    this.svg.setAttribute('aria-hidden', 'true');
    this.guide = document.createElementNS(ns, 'polyline');
    this.guide.classList.add('guide');
    this.startDot = document.createElementNS(ns, 'circle');
    this.startDot.classList.add('guide-start');
    this.startDot.setAttribute('r', '7');
    this.endMark = document.createElementNS(ns, 'path');
    this.endMark.classList.add('guide-end');
    this.trace = document.createElementNS(ns, 'polyline');
    this.trace.classList.add('trace');
    this.ring = document.createElementNS(ns, 'circle');
    this.ring.classList.add('brush-ring');
    this.inner = document.createElementNS(ns, 'circle');
    this.inner.classList.add('brush-ring', 'inner');
    this.svg.append(this.guide, this.startDot, this.endMark, this.trace, this.ring, this.inner);
    parent.append(this.svg);
    this.state = { guide: null, brush: null, trace: [] };
    this.clear();
  }

  /** Points in Blender coordinates; `radius` in metres. */
  showGuide(points, radius) {
    this.state.guide = { points, radius };
  }

  showBrush(point, radius) {
    this.state.brush = { point, radius };
  }

  /** The learner's finger path, in canvas pixels. */
  showTrace(points) {
    this.state.trace = points;
    this.trace.setAttribute('points', points.map(point => `${point.x},${point.y}`).join(' '));
  }

  hideBrush() {
    this.state.brush = null;
    this.ring.style.display = this.inner.style.display = 'none';
  }

  clear() {
    this.state = { guide: null, brush: null, trace: [] };
    for (const node of [this.guide, this.startDot, this.endMark, this.ring, this.inner]) node.style.display = 'none';
    this.trace.setAttribute('points', '');
  }

  /** Guide in canvas pixels (for matching the learner's trace). */
  guidePixels(viewer) {
    return this.state.guide ? this.state.guide.points.map(point => viewer.project(point)) : [];
  }

  update(viewer) {
    const { guide, brush } = this.state;
    const show = (node, visible) => { node.style.display = visible ? '' : 'none'; };
    show(this.guide, guide);
    show(this.startDot, guide);
    show(this.endMark, guide);
    if (guide) {
      const pixels = this.guidePixels(viewer);
      this.guide.setAttribute('points', pixels.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '));
      this.guide.style.strokeWidth = `${Math.max(3, Math.min(14, viewer.projectRadius(guide.points[0], guide.radius) * 0.5))}px`;
      this.startDot.setAttribute('cx', pixels[0].x);
      this.startDot.setAttribute('cy', pixels[0].y);
      const last = pixels[pixels.length - 1];
      const before = pixels[Math.max(0, pixels.length - 3)];
      const angle = Math.atan2(last.y - before.y, last.x - before.x);
      const arrow = (dx, dy) => `${last.x + Math.cos(angle) * dx - Math.sin(angle) * dy},${last.y + Math.sin(angle) * dx + Math.cos(angle) * dy}`;
      this.endMark.setAttribute('d', `M${arrow(-12, -8)} L${arrow(0, 0)} L${arrow(-12, 8)}`);
    }
    show(this.ring, brush);
    show(this.inner, brush);
    if (brush) {
      const center = viewer.project(brush.point);
      const radius = viewer.projectRadius(brush.point, brush.radius);
      for (const [node, scale] of [[this.ring, 1], [this.inner, 0.5]]) {
        node.setAttribute('cx', center.x);
        node.setAttribute('cy', center.y);
        node.setAttribute('r', Math.max(2, radius * scale));
      }
    }
  }
}
