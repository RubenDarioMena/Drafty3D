import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { cameraPose, orthoHalfHeight, toThree, verticalFov } from './camera.js';

// three's DRACOLoader references its decoders with import.meta.url, so Vite bundles them next to the app (offline).
export function createLoader() {
  return new GLTFLoader().setDRACOLoader(new DRACOLoader());
}

/**
 * Scene lessons (Levels 1 and 2): each step mesh holds every visible object, one glTF node per
 * object, named as in Blender. Returns, per file, the objects' world-space geometries by name.
 */
export async function loadSceneGeometries(loader, folderUrl, names) {
  const entries = await Promise.all([...new Set(names)].map(async name => {
    const gltf = await loader.loadAsync(new URL(name, folderUrl).href);
    gltf.scene.updateMatrixWorld(true);
    const objects = new Map();
    gltf.scene.traverse(node => {
      if (node.isMesh) objects.set(node.name, node.geometry.clone().applyMatrix4(node.matrixWorld));
    });
    return [name, objects];
  }));
  return new Map(entries);
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
    shadeMask(geometry);
    return [name, geometry];
  }));
  return new Map(entries);
}

// Blender draws masked surface darker (Sculpt Mode's mask overlay, opacity 0.75).
const MASK_SHADE = 0.75;

/** A sculpt mask exported from Blender (`_MASK`, 0 free to 1 protected) becomes vertex colors. */
function shadeMask(geometry) {
  const mask = geometry?.getAttribute('_mask');
  if (!mask) return;
  const colors = new Float32Array(mask.count * 3);
  for (let i = 0; i < mask.count; i += 1) colors.fill(1 - MASK_SHADE * mask.getX(i), i * 3, i * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a3a3a);
    this.perspective = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    // Front, Right, Top… (View ▸ Viewpoint) are orthographic in Blender.
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    this.camera = this.perspective;
    this.scene.add(this.perspective, this.orthographic);
    this.recordFov = 30;
    this.orthoSize = 1;
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
    for (const camera of [this.perspective, this.orthographic]) {
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(-1, 1.4, 1);
      camera.add(key);
    }

    // Blender's viewport draws back faces too (an open cylinder shows its inner wall).
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }));
    this.scene.add(this.mesh);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enabled = false;
    this.controls.addEventListener('change', () => { this.needsRender = true; });
    // A finger on the view wins over a camera still gliding to Blender's view: the gesture is the learner's.
    this.controls.addEventListener('start', () => this.cameraTween?.kill());

    this.overlay = new StrokeOverlay(canvas.parentElement);
    this.objects = new THREE.Group();
    this.scene.add(this.objects);
    this.edit = new THREE.Group();
    this.scene.add(this.edit);
    this.outline = new SelectionOutline();

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      if (this.controls.enabled && this.controls.update()) this.needsRender = true;
      if (!this.needsRender) return;
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.outline.render(this.renderer, this.camera);
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
    this.needsRender = true;
  }

  /** Knife points (Blender coordinates); the first `done` are clicked and joined by the cut line. */
  showKnife(points, done) {
    this.overlay.showKnife(points, done);
    this.needsRender = true;
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
    const color = geometry.getAttribute('color');
    const startColor = from.getAttribute('color');
    const endColor = to.getAttribute('color');
    const moving = [];
    const timing = [];
    const drag = stroke.drag ?? stroke.brushType === 'GRAB';
    const trail = stroke.points.map(point => new THREE.Vector3(...toThree(point)));
    const vertex = new THREE.Vector3();
    for (let i = 0; i < start.count; i += 1) {
      const dx = end.getX(i) - start.getX(i);
      const dy = end.getY(i) - start.getY(i);
      const dz = end.getZ(i) - start.getZ(i);
      const shaded = color && endColor && Math.abs(endColor.getX(i) - startColor.getX(i)) > 1e-6;
      if (dx * dx + dy * dy + dz * dz < 1e-12 && !shaded) continue;
      moving.push(i);
      if (drag) {
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
        const local = drag ? t : Math.min(1, Math.max(0, (t * (1 + soft) - timing[k]) / soft));
        position.setXYZ(i, start.getX(i) + (end.getX(i) - start.getX(i)) * local,
          start.getY(i) + (end.getY(i) - start.getY(i)) * local,
          start.getZ(i) + (end.getZ(i) - start.getZ(i)) * local);
        if (normal && startNormal && endNormal) {
          normal.setXYZ(i, startNormal.getX(i) + (endNormal.getX(i) - startNormal.getX(i)) * local,
            startNormal.getY(i) + (endNormal.getY(i) - startNormal.getY(i)) * local,
            startNormal.getZ(i) + (endNormal.getZ(i) - startNormal.getZ(i)) * local);
        }
        if (color) {
          const shade = startColor.getX(i) + (endColor.getX(i) - startColor.getX(i)) * local;
          color.setXYZ(i, shade, shade, shade);
        }
      });
      position.needsUpdate = true;
      if (normal) normal.needsUpdate = true;
      if (color) color.needsUpdate = true;
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
    this.aspect = width / height;
    this.perspective.aspect = this.aspect;
    this.perspective.fov = verticalFov(this.recordFov, this.aspect);
    this.perspective.updateProjectionMatrix();
    this.applyOrtho();
    this.outline.resize(this.renderer);
    this.needsRender = true;
  }

  applyOrtho() {
    const half = orthoHalfHeight(this.orthoSize, this.aspect ?? 1);
    Object.assign(this.orthographic, { top: half, bottom: -half, left: -half * (this.aspect ?? 1), right: half * (this.aspect ?? 1) });
    this.orthographic.updateProjectionMatrix();
  }

  /** Switches between Blender's perspective and orthographic views, keeping the camera where it is. */
  useCamera(camera) {
    if (this.camera === camera) return;
    camera.position.copy(this.camera.position);
    camera.quaternion.copy(this.camera.quaternion);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    this.camera = camera;
    this.controls.object = camera;
    this.needsRender = true;
  }

  /**
   * Objects of a scene lesson, as Blender drew them: every visible object, the selected ones
   * outlined (the active one lighter). In Edit Mode Blender draws no outline.
   */
  setObjects(objects, scene, editing) {
    if (this.shownObjects !== objects) {
      this.shownObjects = objects;
      this.objects.clear();
      for (const [name, geometry] of objects ?? []) {
        const mesh = new THREE.Mesh(geometry, this.mesh.material);
        mesh.name = name;
        this.objects.add(mesh);
      }
    }
    const selected = editing ? [] : scene.selected;
    this.outline.set(this.objects.children.filter(mesh => selected.includes(mesh.name)), scene.active);
    this.mesh.visible = false;
    this.needsRender = true;
  }

  /** The object under a canvas point (a click in Object Mode), or null. */
  objectAt(x, y) {
    const pointer = new THREE.Vector2((x / this.canvas.clientWidth) * 2 - 1, 1 - (y / this.canvas.clientHeight) * 2);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);
    return raycaster.intersectObjects(this.objects.children, false)[0]?.object.name ?? null;
  }

  /**
   * Edit Mode overlay, from the mesh Blender reported: edges, vertex dots in Vertex select mode,
   * and the selection in Blender's orange. `preview` edges are drawn yellow (the loop a Loop Cut makes).
   */
  setEdit(edit, selection, selectMode, preview = null) {
    this.edit.traverse(node => { node.geometry?.dispose(); });
    this.edit.clear();
    const material = this.mesh.material;
    const editing = Boolean(edit);
    // Pushes the surfaces back a little so the edges in front of them always win the depth test.
    if (material.polygonOffset !== editing) {
      Object.assign(material, { polygonOffset: editing, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      material.needsUpdate = true;
    }
    this.needsRender = true;
    if (!edit) return;
    const verts = edit.verts.map(point => new THREE.Vector3(...toThree(point)));
    const chosen = {
      verts: new Set(selection?.verts ?? []), edges: new Set(selection?.edges ?? []), faces: new Set(selection?.faces ?? []),
    };
    const segments = (indices, color) => {
      if (!indices.length) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(indices.flatMap(index => edit.edges[index].map(vertex => verts[vertex])));
      this.edit.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })));
    };
    const all = edit.edges.map((_, index) => index);
    segments(all.filter(index => !chosen.edges.has(index)), 0x111111);
    segments(all.filter(index => chosen.edges.has(index)), 0xffa000);
    if (preview) {
      // Blender previews the new loop in yellow: it runs across each face between the clicked ring's edges.
      const ring = preview.map(index => edit.edges[index]);
      const middle = edge => verts[edge[0]].clone().add(verts[edge[1]]).multiplyScalar(0.5);
      const points = edit.faces.flatMap(face => {
        const crossed = ring.filter(edge => face.includes(edge[0]) && face.includes(edge[1]));
        return crossed.length === 2 ? [middle(crossed[0]), middle(crossed[1])] : [];
      });
      if (points.length) {
        this.edit.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffff40 })));
      }
    }
    const faces = edit.faces.filter((_, index) => chosen.faces.has(index));
    if (faces.length) {
      const triangles = faces.flatMap(face => face.slice(1, -1).flatMap((vertex, i) => [verts[face[0]], verts[vertex], verts[face[i + 2]]]));
      const geometry = new THREE.BufferGeometry().setFromPoints(triangles);
      this.edit.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffa000, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
      })));
    }
    if (selectMode?.includes('VERT')) {
      const dots = (indices, color) => {
        if (!indices.length) return;
        const geometry = new THREE.BufferGeometry().setFromPoints(indices.map(index => verts[index]));
        this.edit.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 6, sizeAttenuation: false })));
      };
      const indices = verts.map((_, index) => index);
      dots(indices.filter(index => !chosen.verts.has(index)), 0x111111);
      dots(indices.filter(index => chosen.verts.has(index)), 0xffa000);
    }
  }

  /** Objects a modifier points at (a Boolean cutter, a Curve path): drawn as Blender draws a wire object. */
  setHelpers(helpers) {
    if (this.helpers) {
      this.scene.remove(this.helpers);
      this.helpers.traverse(node => node.geometry?.dispose());
    }
    this.helpers = new THREE.Group();
    for (const helper of helpers) {
      const geometry = new THREE.BufferGeometry().setFromPoints(helper.segments.map(point => new THREE.Vector3(...toThree(point))));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x111111 }));
      lines.name = helper.name;
      this.helpers.add(lines);
    }
    this.scene.add(this.helpers);
    this.needsRender = true;
  }

  setGeometry(geometry) {
    this.mesh.visible = true;
    if (this.objects.children.length) {
      this.objects.clear();
      this.shownObjects = null;
      this.outline.set([], null);
      this.setEdit(null);
    }
    if (geometry && this.mesh.geometry !== geometry) {
      this.mesh.geometry = geometry;
      const shaded = Boolean(geometry.getAttribute('color'));
      if (this.mesh.material.vertexColors !== shaded) {
        this.mesh.material.vertexColors = shaded;
        this.mesh.material.needsUpdate = true;
      }
      this.needsRender = true;
    }
  }

  setOrbit(enabled) {
    this.controls.enabled = enabled;
  }

  /**
   * Moves to a camera Blender recorded; animated moves are GSAP tweens. Orthographic views
   * (`ortho`, half the visible height) switch camera at the end of the move; leaving one switches
   * back to perspective first, as Blender's Auto Perspective does when you orbit.
   */
  showCamera(record, duration = 0) {
    this.cameraTween?.kill();
    const pose = cameraPose(record);
    const ortho = Boolean(record.ortho);
    if (!ortho) this.useCamera(this.perspective);
    const to = { position: pose.position, target: pose.target, fov: record.fov ?? this.recordFov, size: record.ortho ?? this.orthoSize };
    const from = {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      fov: this.recordFov,
      size: this.orthoSize,
    };
    const apply = t => {
      const mix = (a, b) => a.map((value, i) => value + (b[i] - value) * t);
      if (t >= 1 && ortho) this.useCamera(this.orthographic);
      this.camera.position.set(...mix(from.position, to.position));
      this.controls.target.set(...mix(from.target, to.target));
      this.recordFov = from.fov + (to.fov - from.fov) * t;
      this.perspective.fov = verticalFov(this.recordFov, this.perspective.aspect);
      this.orthoSize = from.size + (to.size - from.size) * t;
      this.applyOrtho();
      this.camera.zoom = 1;
      this.camera.up.set(0, 1, 0);
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

  /** The camera as the learner left it, in Blender's terms (for judging orbit, pan and zoom). */
  view() {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    return {
      target, offset,
      // An orthographic view zooms by scale, not distance.
      distance: offset.length() / (this.camera.isOrthographicCamera ? this.camera.zoom : 1),
      size: this.camera.isOrthographicCamera ? this.orthoSize / this.camera.zoom : null,
    };
  }
}

/**
 * Blender's selection outline: selected objects get an orange rim, the active one a lighter one.
 * The selected objects are drawn as a flat mask, then a full-screen pass colours the pixels just
 * outside that mask.
 */
class SelectionOutline {
  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1);
    this.scene = new THREE.Scene();
    this.selectedMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    this.activeMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: {
        mask: { value: this.target.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        radius: { value: 2 },
        selectedColor: { value: new THREE.Color(0xf15800) },
        activeColor: { value: new THREE.Color(0xffaa40) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D mask; uniform vec2 texel; uniform float radius; uniform vec3 selectedColor; uniform vec3 activeColor;
        varying vec2 vUv;
        void main() {
          if (texture2D(mask, vUv).r > 0.5) discard;
          float selected = 0.0;
          float lead = 0.0; // the active object ("active" is a reserved word in GLSL ES)
          for (int x = -3; x <= 3; x++) {
            for (int y = -3; y <= 3; y++) {
              if (float(x * x + y * y) > radius * radius) continue;
              vec4 near = texture2D(mask, vUv + vec2(float(x), float(y)) * texel);
              selected = max(selected, near.r);
              lead = max(lead, near.g);
            }
          }
          if (selected < 0.5) discard;
          gl_FragColor = vec4(lead > 0.5 ? activeColor : selectedColor, 1.0);
        }`,
      depthTest: false, depthWrite: false, transparent: true,
    }));
    this.quad.frustumCulled = false;
    this.overlay = new THREE.Scene();
    this.overlay.add(this.quad);
    this.flat = new THREE.Camera();
  }

  resize(renderer) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.quad.material.uniforms.texel.value.set(1 / size.x, 1 / size.y);
    this.quad.material.uniforms.radius.value = Math.max(1.5, Math.min(3, renderer.getPixelRatio() * 1.5));
  }

  set(meshes, active) {
    this.scene.clear();
    for (const mesh of meshes) {
      this.scene.add(new THREE.Mesh(mesh.geometry, mesh.name === active ? this.activeMaterial : this.selectedMaterial));
    }
  }

  render(renderer, camera) {
    if (!this.scene.children.length) return;
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    renderer.autoClear = false;
    renderer.render(this.overlay, this.flat);
    renderer.autoClear = true;
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
    // Knife cuts: the line cut so far and the numbered points still to click.
    this.cut = document.createElementNS(ns, 'polyline');
    this.cut.classList.add('knife-cut');
    this.marks = document.createElementNS(ns, 'g');
    this.marks.classList.add('knife-marks');
    this.svg.append(this.guide, this.startDot, this.endMark, this.trace, this.ring, this.inner, this.cut, this.marks);
    parent.append(this.svg);
    this.state = { guide: null, brush: null, trace: [] };
    this.clear();
  }

  /** Points in Blender coordinates; the first `done` are already clicked. */
  showKnife(points, done) {
    this.state.knife = { points, done };
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
    this.state = { guide: null, brush: null, trace: [], knife: null };
    for (const node of [this.guide, this.startDot, this.endMark, this.ring, this.inner, this.cut]) node.style.display = 'none';
    this.marks.replaceChildren();
    this.trace.setAttribute('points', '');
  }

  updateKnife(viewer) {
    const { knife } = this.state;
    this.cut.style.display = knife && knife.done > 1 ? '' : 'none';
    this.marks.replaceChildren();
    if (!knife) return;
    const ns = 'http://www.w3.org/2000/svg';
    const pixels = knife.points.map(point => viewer.project(point));
    this.cut.setAttribute('points', pixels.slice(0, knife.done).map(point => `${point.x},${point.y}`).join(' '));
    pixels.forEach((pixel, index) => {
      const mark = document.createElementNS(ns, 'g');
      mark.classList.add('knife-mark');
      mark.classList.toggle('done', index < knife.done);
      mark.classList.toggle('next', index === knife.done);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', pixel.x);
      circle.setAttribute('cy', pixel.y);
      circle.setAttribute('r', '11');
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', pixel.x);
      label.setAttribute('y', pixel.y + 4);
      label.textContent = String(index + 1);
      mark.append(circle, label);
      this.marks.append(mark);
    });
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
    this.updateKnife(viewer);
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
