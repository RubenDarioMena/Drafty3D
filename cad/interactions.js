import { WORK_PLANES, extrusionPlane, onPlane } from './planes.js';
import { SketchSession } from './sketch.js';
import { applyPlacement } from './placement.js';
import { addObject, updateObject } from './document.js';
import { Matrix4, Vector3, Quaternion, MathUtils } from 'three';
import { formatNumber, t } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

export class CadInteractions {
  constructor(viewport, app) {
    this.viewport = viewport; this.app = app;
    viewport.callbacks = {
      canAutoMove: () => !app.busy() && !this.locked && !app.operationActive() && document.querySelector('.app').dataset.activeSpace !== 'assembly',
      onAutoMove: () => this.setMode('translate'),
      onElements: () => app.renderElements(),
      canPickElements: () => !app.operationActive(),
      onGesture: (value) => { this.dragging = value; $('#gesture-readout').hidden = !value; app.syncControls(); },
      onPreview: (elements) => {
        this.previewElements = elements;
        this.renderGestureReadout();
      },
      onTransform: async (id, elements) => {
        const applied = await app.mutate(candidate => applyPlacement(candidate, id, elements), 'status.positionUpdated');
        if (!applied) { viewport.setDocument(app.project(), app.geometry()); viewport.setSelection(app.selection()); }
      },
      onPlane: (plane, name) => this.beginSketch({ plane, name: t('view.planeNamed', { plane: name }) }),
      onFace: (id, face) => {
        const mesh = app.geometry().meshes.find((mesh) => mesh.id === id);
        const object = app.project().objects.find((object) => object.id === id);
        const focus = mesh.bounds.min.map((value, i) => (value + mesh.bounds.max[i]) / 2);
        // Proyectar el centro de encuadre al plano exacto de la cara.
        const { origin, u, v } = face.plane;
        const offset = focus.map((value, i) => value - origin[i]);
        const pu = offset.reduce((s, x, i) => s + x * u[i], 0), pv = offset.reduce((s, x, i) => s + x * v[i], 0);
        this.beginSketch({ plane: face.plane, name: t('view.faceNamed', { name: object.name }), support: { source: id, face: face.index, faceCount: mesh.faceCount }, target: id, focus: origin.map((x, i) => x + u[i] * pu + v[i] * pv) });
      },
      onHint: (text) => app.message(text),
    };
    $$('[data-interaction]').forEach((button) => { button.onclick = () => this.setMode(button.dataset.interaction); });
    $('#transform-snap').onchange = () => viewport.setSnap($('#transform-snap').checked);
    $('#sketch-button').onclick = $('#start-sketch').onclick = () => this.choosePlane();
    $('#extrude-sketch-button').onclick = () => {
      const object = app.project().objects.find(item => app.selection().has(item.id) && item.type === 'sketch');
      if (object) this.editSketch(object, 'volume');
      else app.message('sketch.selectToExtrude');
    };
    $$('[data-plane]').forEach((button) => { button.onclick = () => this.beginSketch({ plane: WORK_PLANES[button.dataset.plane], name: t('view.planeNamed', { plane: button.dataset.plane }) }); });
    $('#pick-face').onclick = () => { viewport.setMode('face'); $('#plane-note').textContent = t('view.pickFaceHint'); };
    $('#cancel-plane').onclick = () => { $('#plane-picker').hidden = true; this.setMode('orbit'); };
  }

  get locked() { return Boolean(this.drawing || this.dragging); }

  renderGestureReadout() {
    if (!this.previewElements) return;
    const position = new Vector3(), rotation = new Quaternion();
    new Matrix4().fromArray(this.previewElements).decompose(position, rotation, new Vector3());
    const precision = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    $('#gesture-readout').textContent = this.viewport.mode === 'rotate'
      ? t('canvas.rotationReadout', { degrees: formatNumber(MathUtils.radToDeg(rotation.angleTo(new Quaternion())), precision) })
      : t('canvas.coordinates', { x: formatNumber(position.x, precision), y: formatNumber(position.y, precision), z: formatNumber(position.z, precision) });
  }

  refreshLabels() {
    const hintKey = { orbit: 'canvas.hintOrbit', translate: 'canvas.hintMove', rotate: 'canvas.hintRotate', edge: 'selection.edgeHint', vertex: 'selection.vertexHint' }[this.viewport.mode];
    $('.viewport-hint').textContent = hintKey ? t(hintKey) : '';
    if (!$('#plane-picker').hidden) $('#plane-note').textContent = t(this.viewport.mode === 'face' ? 'view.pickFaceHint' : 'view.planeNote');
    this.renderGestureReadout();
    this.session?.refreshLabels();
  }

  setMode(mode) {
    if (this.app.busy() || this.drawing) return;
    $('#plane-picker').hidden = true;
    this.viewport.setMode(mode);
    $$('[data-interaction]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.interaction === mode)));
    this.refreshLabels();
    if (mode !== 'orbit') this.app.message('canvas.selectToMove');
  }

  choosePlane() {
    if (this.app.busy() || this.locked) return;
    this.app.closeOperation();
    this.viewport.setMode('plane');
    $('#plane-picker').hidden = false;
    $('#plane-note').textContent = t('view.planeNote');
  }

  editSketch(object, stage = 'profile') {
    if (object.params.sketch) object = this.app.project().objects.find(item => item.id === object.params.sketch);
    if (!object) return;
    const mesh = object.params.support ? this.app.geometry().meshes.find((mesh) => mesh.id === object.params.support.source) : null;
    const supportPlane = mesh?.faces.find((face) => face.index === object.params.support.face)?.plane;
    if (object.params.support && !supportPlane) { this.app.message('mesh.supportFaceChanged'); return; }
    const plane = extrusionPlane(object.params, supportPlane);
    const center = object.params.profile?.center || [0, 1].map((axis) => object.params.points.reduce((sum, point) => sum + point[axis], 0) / object.params.points.length);
    this.beginSketch({ plane, name: t(object.params.support ? 'view.profileOnFace' : 'view.profilePlane'), object, support: object.params.support, target: object.params.support?.source, stage, focus: onPlane(plane, ...center) });
  }

  beginSketch({ plane, name, object = null, support, target, focus, stage = 'profile' }) {
    if (this.app.busy() || this.drawing) return;
    $('#plane-picker').hidden = true;
    this.app.closeOperation();
    this.app.showOperation('sketch');
    this.drawing = true;
    $('.workspace').classList.add('is-sketch');
    $('#sketch-panel').hidden = false; $('#sketch-coordinates').hidden = false;
    const project = this.app.project();
    const targets = project.objects.filter((object) => object.type !== 'sketch' && (object.visible || object.id === target) && this.app.geometry().meshes.some(mesh => mesh.id === object.id && mesh.solidCount && !mesh.isMesh));
    this.session = new SketchSession(this.viewport, { plane, name, object, support, targets, target, focus, stage,
      onCancel: () => this.closeSketch(),
      onFinish: async (draft) => {
        let id = object?.id;
        const applied = await this.app.mutate(candidate => {
          if (object) updateObject(candidate, id, { params: { points: draft.points, profile: draft.profile } });
          else id = addObject(candidate, { type: 'sketch', name: t(draft.profile ? 'sketch.sketchCircle' : 'piece.sketch'), params: { points: draft.points, profile: draft.profile, plane, ...(support ? { support } : {}) } }).id;
        }, object ? 'sketch.updatedMessage' : 'sketch.savedMessage', { fromSketch: true });
        if (applied) { this.closeSketch(); this.app.select(id); this.viewport.fit(); }
        else $('#sketch-error').textContent = $('#message').textContent;
      },
      onApply: async (draft) => {
        let id = object?.id;
        const applied = await this.app.mutate((candidate) => {
          if (object?.type === 'extrusion') {
            updateObject(candidate, object.id, { params: { points: draft.points, profile: draft.profile, height: draft.height, reverse: draft.reverse } });
            return;
          }
          let sketchId = object?.id;
          if (object) updateObject(candidate, sketchId, { params: { points: draft.points, profile: draft.profile } });
          else sketchId = addObject(candidate, { type: 'sketch', name: t(draft.profile ? 'sketch.sketchCircle' : 'piece.sketch'), params: { points: draft.points, profile: draft.profile, plane, ...(support ? { support } : {}) } }).id;
          id = addObject(candidate, { type: 'extrusion', name: t(draft.profile ? 'sketch.profileCircle' : 'sketch.profileExtruded'), params: { sketch: sketchId, height: draft.height, reverse: draft.reverse } }).id;
          updateObject(candidate, sketchId, { visible: false });
          if (draft.effect !== 'new') {
            if (!draft.target) throw new Error('Selecciona una pieza de destino para añadir o cortar.');
            const tool = id;
            id = addObject(candidate, { type: 'boolean', name: t(draft.effect === 'cut' ? 'sketch.profileCut' : 'sketch.profileRelief'), params: { operation: draft.effect, left: draft.target, right: tool } }).id;
            updateObject(candidate, draft.target, { visible: false }); updateObject(candidate, tool, { visible: false });
          }
        }, object?.type === 'extrusion' ? 'sketch.profileUpdated' : draft.effect === 'cut' ? 'sketch.cutCreated' : 'sketch.extrusionCreated', { fromSketch: true });
        if (applied) { this.closeSketch(); this.app.select(id); this.viewport.fit(); }
        else $('#sketch-error').textContent = $('#message').textContent;
      },
    });
    this.app.syncControls();
    this.app.message(stage === 'volume' ? 'sketch.volumeStarted' : 'sketch.profileStarted');
  }

  closeSketch() {
    this.session = null; this.drawing = false;
    $('.workspace').classList.remove('is-sketch');
    $('#sketch-panel').hidden = true; $('#sketch-coordinates').hidden = true;
    this.viewport.endSketch(); this.setMode('orbit'); this.app.showOperation('properties'); this.app.syncControls();
  }

  escape() {
    if (this.viewport.cancelGesture()) { this.app.message('status.transformCancelled'); return true; }
    if (this.drawing) { this.closeSketch(); this.app.message('sketch.cancelled'); return true; }
    if (!$('#plane-picker').hidden) { $('#plane-picker').hidden = true; this.setMode('orbit'); return true; }
    this.setMode('orbit'); return false;
  }
}
