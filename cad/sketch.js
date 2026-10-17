import { measureRectangle, measureCircle, createRectangleProfile, createCircleProfile } from './profile-dimensions.js';

const $ = (selector) => document.querySelector(selector);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const snapshotKeys = ['points', 'circle', 'closed', 'anchor', 'hover'];

/** Perfil local U/V. Dibujar y dar volumen conservan un mismo borrador cancelable. */
export class SketchSession {
  constructor(viewport, { plane, name, object, support, targets, target, focus, stage = 'profile', onCancel, onFinish, onApply }) {
    this.viewport = viewport; this.support = support; this.plane = plane; this.object = object;
    this.points = structuredClone(object?.params.points || []);
    this.circle = structuredClone(object?.params.profile || null);
    this.closed = Boolean(object);
    this.tool = this.circle ? 'circle' : measureRectangle(this.points) || !object ? 'rectangle' : 'lines';
    this.anchor = null; this.hover = null;
    $('#sketch-plane-name').textContent = name;
    $('#sketch-height').value = object?.params.height || 15;
    $('#sketch-reverse').checked = object?.type === 'extrusion' ? object.params.reverse === true : Boolean(support);
    const select = $('#sketch-target'); select.replaceChildren();
    targets.forEach((item) => select.add(new Option(item.name, item.id)));
    select.value = target || targets[0]?.id || '';
    $('#sketch-effect').value = support && object?.type !== 'extrusion' ? 'cut' : 'new';
    $('#sketch-effect').disabled = object?.type === 'extrusion';
    document.querySelectorAll('[data-profile]').forEach((button) => { button.onclick = () => { this.tool = button.dataset.profile; this.clear(); }; });
    $('#sketch-close').onclick = () => { if (this.points.length >= 3) { this.closed = true; this.draw(); } };
    $('#sketch-undo').onclick = () => { this.closed = false; this.anchor = null; if (this.circle) this.clear(); else this.points.pop(); this.numericDirty = false; this.draw(); };
    $('#sketch-clear').onclick = () => this.clear();
    $('#sketch-preset').onclick = () => { this.tool = 'rectangle'; this.clear(); this.points = [[0, 0], [40, 0], [40, 30], [0, 30]]; this.closed = true; this.draw(); };
    $('#sketch-dimensions').oninput = () => { this.numericDirty = true; $('#sketch-error').textContent = ''; this.updateSubmit(); };
    $('#sketch-dimensions').onsubmit = event => { event.preventDefault(); this.applyDimensions(); };
    $('#sketch-height').oninput = $('#sketch-reverse').onchange = $('#sketch-snap').onchange = () => this.draw();
    $('#sketch-effect').onchange = () => { if (support) $('#sketch-reverse').checked = $('#sketch-effect').value === 'cut'; this.draw(); };
    $('#sketch-target').onchange = () => this.draw();
    $('#sketch-cancel').onclick = onCancel;
    $('#sketch-normal-view').onclick = () => viewport.viewSketchNormal();
    $('#sketch-next').onclick = () => { if (this.prepareProfile()) this.setStage('volume'); };
    $('#sketch-back').onclick = () => this.setStage('profile');
    $('#sketch-finish').onclick = async () => {
      if (!this.prepareProfile()) return;
      $('#sketch-error').textContent = '';
      await onFinish(this.draft());
    };
    $('#sketch-create').onclick = async () => {
      if (!$('#sketch-height').reportValidity() || !this.closed) return;
      $('#sketch-error').textContent = '';
      await onApply(this.draft());
    };
    viewport.beginSketch(plane, (...args) => this.pointer(...args), focus);
    this.resetDimensionInputs();
    this.setStage(stage);
  }

  draft() {
    return { points: structuredClone(this.points), profile: structuredClone(this.circle), height: Number($('#sketch-height').value), reverse: $('#sketch-reverse').checked, effect: $('#sketch-effect').value, target: $('#sketch-target').value };
  }

  prepareProfile() { return (!this.numericDirty || this.applyDimensions()) && this.closed; }

  setStage(stage) {
    this.stage = stage;
    $('#sketch-profile-fields').hidden = stage !== 'profile';
    $('#sketch-volume-fields').hidden = stage !== 'volume';
    $('#sketch-finish').hidden = $('#sketch-next').hidden = stage !== 'profile';
    $('#sketch-create').hidden = stage !== 'volume';
    $('#sketch-step').textContent = stage === 'profile' ? '1 · DIBUJAR EL CROQUIS' : '2 · CREAR VOLUMEN';
    $('#sketch-finish').textContent = this.object ? 'Guardar cambios del perfil' : 'Terminar croquis';
    $('#operation-content').scrollTop = 0;
    this.draw();
  }

  resetDimensionInputs() {
    for (const [id, value] of Object.entries({u: 0, v: 0, width: 40, depth: 30, radius: 10})) {
      $(`#sketch-${id}`).value = value; $(`#sketch-${id}`).setCustomValidity('');
    }
    this.numericDirty = false;
  }

  applyDimensions() {
    const inputs = ['u', 'v', ...(this.tool === 'circle' ? ['radius'] : ['width', 'depth'])];
    if (!inputs.every(id => $(`#sketch-${id}`).reportValidity())) return false;
    try {
      const values = Object.fromEntries(inputs.map(id => [id, Number($(`#sketch-${id}`).value)]));
      const result = this.tool === 'circle' ? createCircleProfile(values, this.circle) : createRectangleProfile({ ...values, height: values.depth }, this.points);
      this.points = result.points; this.circle = result.profile;
      this.closed = true; this.anchor = null; this.hover = null; this.handle = null; this.down = null;
      this.numericDirty = false;
      $('#sketch-error').textContent = '';
      this.draw();
      return true;
    } catch (error) { $('#sketch-error').textContent = error.message; return false; }
  }

  clear() {
    this.points = []; this.circle = null; this.closed = false; this.anchor = null; this.hover = null; this.handle = null; this.down = null;
    this.resetDimensionInputs();
    $('#sketch-error').textContent = ''; this.draw();
  }

  rectangle(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; }

  pointer(type, raw, event) {
    if (type === 'cancel') {
      if (this.pressSnapshot) Object.assign(this, this.pressSnapshot);
      this.down = null; this.handle = null; this.startedNow = false; this.pressSnapshot = null;
      this.draw(); return;
    }
    if (this.stage !== 'profile') return;
    const step = Number($('#sketch-snap').value);
    const point = raw.map((value) => step ? Math.round(value / step) * step : Math.round(value * 1000) / 1000);
    if (event.shiftKey && this.anchor && this.tool === 'rectangle') {
      const side = Math.max(Math.abs(point[0] - this.anchor[0]), Math.abs(point[1] - this.anchor[1]));
      point.forEach((value, i) => { point[i] = this.anchor[i] + (value >= this.anchor[i] ? side : -side); });
    }
    if (type === 'down') this.pressSnapshot = structuredClone(Object.fromEntries(snapshotKeys.map(key => [key, this[key]])));
    this.hover = point;
    $('#sketch-coordinates').textContent = `U: ${point[0].toFixed(1)} · V: ${point[1].toFixed(1)} mm`;
    if (type === 'down') {
      this.down = [event.clientX, event.clientY]; this.startedNow = false;
      if (this.closed) {
        const handles = this.circle ? [this.circle.center, [this.circle.center[0] + this.circle.radius, this.circle.center[1]]] : this.points;
        const closest = handles.reduce((best, handle, i) => distance(point, handle) < distance(point, handles[best]) ? i : best, 0);
        const near = distance(point, handles[closest]) <= Math.max(1.5, step) ? closest : -1;
        if (near !== -1) { this.handle = near; if (this.tool === 'rectangle') this.opposite = this.points[(near + 2) % 4]; }
        else this.down = null;
        return;
      }
      this.numericDirty = false;
      if (this.tool !== 'lines' && !this.anchor) { this.anchor = point; this.startedNow = true; }
    }
    if (this.handle != null && (type === 'move' || type === 'up')) {
      this.numericDirty = false;
      if (this.circle) {
        if (this.handle === 0) this.circle.center = point;
        else this.circle.radius = Math.max(0.00001, distance(point, this.circle.center));
      } else if (this.tool === 'rectangle') this.points = this.rectangle(this.opposite, point);
      else this.points[this.handle] = point;
      if (type === 'up') { this.handle = null; this.down = null; this.pressSnapshot = null; }
      this.draw(); return;
    }
    if (type === 'up' && this.down) {
      const dragged = Math.hypot(event.clientX - this.down[0], event.clientY - this.down[1]) > 4;
      if (this.tool === 'lines') {
        if (this.points.length >= 3 && distance(point, this.points[0]) <= Math.max(1, step / 2)) this.closed = true;
        else if (!this.points.some((p) => distance(p, point) < 1e-8)) this.points.push(point);
      } else if (this.anchor && (!this.startedNow || dragged)) {
        if (this.tool === 'circle') { this.circle = { type: 'circle', center: this.anchor, radius: distance(this.anchor, point) }; this.points = []; this.closed = this.circle.radius >= 0.00001; }
        else { this.points = this.rectangle(this.anchor, point); this.closed = Math.abs(this.anchor[0] - point[0]) >= 0.00001 && Math.abs(this.anchor[1] - point[1]) >= 0.00001; }
        if (this.closed) this.anchor = null;
      }
      this.down = null;
    }
    if (type === 'up') this.pressSnapshot = null;
    this.draw();
  }

  updateSubmit() {
    $('#sketch-finish').disabled = $('#sketch-next').disabled = !this.closed && !this.numericDirty;
    $('#sketch-create').disabled = !this.closed || ($('#sketch-effect').value !== 'new' && !$('#sketch-target').value);
  }

  draw() {
    let points = this.points, circle = this.circle;
    if (this.anchor && this.hover) {
      if (this.tool === 'circle') circle = { type: 'circle', center: this.anchor, radius: distance(this.anchor, this.hover) };
      else points = this.rectangle(this.anchor, this.hover);
    } else if (!this.closed && this.tool === 'lines' && this.hover && points.length) points = [...points, this.hover];
    this.viewport.drawProfile({ points, circle, closed: this.closed || Boolean(this.anchor) }, this.stage === 'volume' ? Number($('#sketch-height').value) : 0, $('#sketch-reverse').checked);
    document.querySelectorAll('[data-profile]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.profile === this.tool)));
    $('#sketch-instructions').textContent = this.stage === 'volume' ? 'Elige el resultado y la profundidad. Gira la cámara para revisar la vista previa antes de aplicar.' : this.closed ? 'Ajusta las medidas o arrastra los puntos. Termina el croquis para guardarlo sin volumen.' : { rectangle: 'Dibuja dos esquinas o introduce medidas y pulsa Aplicar medidas. Mayús dibuja un cuadrado.', circle: 'Dibuja el centro y radio o introduce sus medidas exactas.', lines: 'Une segmentos. Termina sobre el primer punto o pulsa Cerrar contorno.' }[this.tool];
    $('#sketch-status').textContent = this.closed ? 'Contorno cerrado' : this.points.length ? `${this.points.length} vértices · contorno abierto` : 'Dibuja en el plano de la vista 3D';
    $('#sketch-measures').textContent = circle ? `Radio: ${circle.radius.toFixed(2)} mm · Ø ${(circle.radius * 2).toFixed(2)} mm` : points.length ? `U: ${(Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]))).toFixed(2)} mm · V: ${(Math.max(...points.map((p) => p[1])) - Math.min(...points.map((p) => p[1]))).toFixed(2)} mm` : '';
    $('#sketch-close').disabled = this.closed || this.tool !== 'lines' || this.points.length < 3;
    $('#sketch-undo').disabled = this.tool !== 'lines' || !this.points.length;
    $('#sketch-dimensions').hidden = this.tool === 'lines';
    for (const id of ['width', 'depth']) { $(`#sketch-${id}-field`).hidden = this.tool === 'circle'; $(`#sketch-${id}`).disabled = this.tool !== 'rectangle'; }
    $('#sketch-radius-field').hidden = this.tool !== 'circle'; $('#sketch-radius').disabled = this.tool !== 'circle';
    $('#sketch-u-label').textContent = this.tool === 'circle' ? 'Centro U' : 'Esquina U';
    $('#sketch-v-label').textContent = this.tool === 'circle' ? 'Centro V' : 'Esquina V';
    const measures = this.circle ? measureCircle(this.circle) : measureRectangle(this.points);
    if (measures && !this.numericDirty) {
      for (const [id, key] of Object.entries({ u: 'u', v: 'v', width: 'width', depth: 'height', radius: 'radius' })) {
        if (measures[key] !== undefined) $(`#sketch-${id}`).value = measures[key];
      }
    }
    const effect = $('#sketch-effect').value;
    $('#sketch-effect').disabled = this.object?.type === 'extrusion';
    $('#sketch-target-field').hidden = effect === 'new';
    $('#sketch-create').textContent = this.object?.type === 'extrusion' ? 'Actualizar extrusión' : { new: 'Extruir perfil', cut: 'Cortar pieza', fuse: 'Añadir a la pieza' }[effect];
    this.updateSubmit();
  }
}
