import * as THREE from 'three';

/** A small overlay built only when subelement selection is requested. */
export class ElementSelection {
  constructor(viewport) {
    this.viewport = viewport;
    this.group = new THREE.Group();
    viewport.scene.add(this.group);
    this.selected = new Set();
  }

  clear(notify = true) {
    this.viewport.clearGroup(this.group);
    this.topology = null;
    this.lines = null; this.points = null; this.highlight = null;
    this.segmentEdges = [];
    this.kind = null;
    this.selected.clear();
    if (notify) this.changed();
  }

  activate(kind, topology) {
    if (this.topology?.id !== topology.id || this.topology?.revision !== topology.revision) {
      this.clear(false);
      this.topology = topology;
      const positions = [];
      this.segmentEdges = [];
      for (const edge of topology.edges) for (let index = 1; index < edge.points.length; index++) {
        positions.push(...edge.points[index - 1], ...edge.points[index]);
        this.segmentEdges.push(edge.index);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#087e92', depthWrite: false }));
      const points = new THREE.BufferGeometry();
      points.setAttribute('position', new THREE.Float32BufferAttribute(topology.vertices.flatMap(vertex => vertex.point), 3));
      this.points = new THREE.Points(points, new THREE.PointsMaterial({ color: '#087e92', size: 9, sizeAttenuation: false, depthWrite: false }));
      this.highlight = new THREE.Group();
      this.group.add(this.lines, this.points, this.highlight);
    }
    this.kind = kind;
    this.selected.clear();
    this.lines.visible = kind === 'edge';
    this.points.visible = kind === 'vertex';
    this.paint();
  }

  pick(event) {
    if (!this.topology) return;
    const view = this.viewport;
    view.updateRay(event);
    const distance = view.camera.position.distanceTo(view.controls.target);
    const tolerance = 8 * 2 * distance * Math.tan(THREE.MathUtils.degToRad(view.camera.fov / 2)) / view.container.clientHeight;
    view.raycaster.params.Line.threshold = tolerance;
    view.raycaster.params.Points.threshold = tolerance;
    const hit = view.raycaster.intersectObject(this.kind === 'edge' ? this.lines : this.points, false)[0];
    const front = view.partHit();
    const visible = hit && (!front || hit.distance <= front.distance + tolerance * 2);
    const index = visible ? (this.kind === 'edge' ? this.segmentEdges[Math.floor(hit.index / 2)] : hit.index) : undefined;
    const multiple = event.ctrlKey || event.metaKey || event.shiftKey;
    if (!multiple) this.selected.clear();
    if (index !== undefined) {
      if (multiple && this.selected.has(index)) this.selected.delete(index);
      else this.selected.add(index);
    }
    this.paint();
  }

  edgeReferences() {
    if (!this.topology || this.topology.isMesh || this.topology.isSketch) return [];
    const indices = this.kind === 'edge' ? [...this.selected] : [...new Set([...this.selected].flatMap(index => this.topology.vertices[index].edges))];
    return indices.sort((a, b) => a - b).map(index => this.topology.edges[index]).filter(edge => edge.signature)
      .map(({ index, signature }) => ({ index, signature }));
  }

  paint() {
    this.viewport.clearGroup(this.highlight);
    const positions = [];
    for (const reference of this.edgeReferences()) {
      const edge = this.topology.edges[reference.index];
      for (let index = 1; index < edge.points.length; index++) positions.push(...edge.points[index - 1], ...edge.points[index]);
    }
    if (positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.highlight.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#e46514', depthTest: false })));
    }
    if (this.kind === 'vertex' && this.selected.size) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...this.selected].flatMap(index => this.topology.vertices[index].point), 3));
      this.highlight.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#e46514', size: 13, sizeAttenuation: false, depthTest: false })));
    }
    this.highlight.renderOrder = 10;
    this.changed();
    this.viewport.render();
  }

  changed() { this.viewport.callbacks.onElements?.(); }
}
