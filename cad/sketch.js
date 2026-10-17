import { formatNumber, t } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Croquis local U/V sobre un plano 3D. El sólido exacto se construye al aplicar. */
export class SketchSession {
  constructor(viewport, { plane, name, object, support, targets, target, focus, onApply, onCancel }) {
    this.viewport = viewport; this.support = support; this.plane = plane; this.object = object;
    this.points = structuredClone(object?.params.points || []);
    this.circle = structuredClone(object?.params.profile || null);
    this.closed = Boolean(object);
    this.tool = this.circle ? 'circle' : object ? 'lines' : 'rectangle';
    this.anchor = null; this.hover = null;
    this.name = name;
    $('#sketch-height').value = object?.params.height || 15;
    $('#sketch-reverse').checked = object ? object.params.reverse === true : Boolean(support);
    const select = $('#sketch-target'); select.replaceChildren();
    targets.forEach((item) => select.add(new Option(item.name, item.id)));
    select.value = target || targets[0]?.id || '';
    $('#sketch-effect').value = support && !object ? 'cut' : 'new';
    $('#sketch-effect').disabled = Boolean(object);
    document.querySelectorAll('[data-profile]').forEach((button) => { button.onclick = () => { this.clear(); this.tool = button.dataset.profile; this.draw(); }; });
    $('#sketch-close').onclick = () => { if (this.points.length >= 3) { this.closed = true; this.draw(); } };
    $('#sketch-undo').onclick = () => { this.closed = false; this.anchor = null; if (this.circle) this.clear(); else this.points.pop(); this.draw(); };
    $('#sketch-clear').onclick = () => this.clear();
    $('#sketch-preset').onclick = () => { this.tool = 'rectangle'; this.points = [[0, 0], [40, 0], [40, 30], [0, 30]]; this.circle = null; this.closed = true; this.anchor = null; this.draw(); };
    $('#sketch-height').oninput = $('#sketch-reverse').onchange = $('#sketch-snap').onchange = () => this.draw();
    $('#sketch-effect').onchange = () => { if (support) $('#sketch-reverse').checked = $('#sketch-effect').value === 'cut'; this.draw(); };
    $('#sketch-cancel').onclick = onCancel;
    $('#sketch-create').onclick = async () => {
      if (!$('#sketch-height').reportValidity() || !this.closed) return;
      $('#sketch-error').textContent = '';
      await onApply({ points: structuredClone(this.points), profile: structuredClone(this.circle), height: Number($('#sketch-height').value), reverse: $('#sketch-reverse').checked, effect: $('#sketch-effect').value, target: select.value });
    };
    viewport.beginSketch(plane, (...args) => this.pointer(...args), focus);
    this.draw();
  }

  clear() {
    this.points = []; this.circle = null; this.closed = false; this.anchor = null; this.hover = null; this.handle = null;
    $('#sketch-error').textContent = ''; this.draw();
  }

  rectangle(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; }

  pointer(type, raw, event) {
    const step = Number($('#sketch-snap').value);
    const point = raw.map((value) => step ? Math.round(value / step) * step : Math.round(value * 1000) / 1000);
    if (event.shiftKey && this.anchor && this.tool === 'rectangle') {
      const side = Math.max(Math.abs(point[0] - this.anchor[0]), Math.abs(point[1] - this.anchor[1]));
      point.forEach((value, i) => { point[i] = this.anchor[i] + (value >= this.anchor[i] ? side : -side); });
    }
    this.hover = point;
    if (type === 'down') {
      this.down = [event.clientX, event.clientY]; this.startedNow = false;
      if (this.closed) {
        const handles = this.circle ? [this.circle.center, [this.circle.center[0] + this.circle.radius, this.circle.center[1]]] : this.points;
        const closest = handles.reduce((best, handle, i) => distance(point, handle) < distance(point, handles[best]) ? i : best, 0);
        const near = distance(point, handles[closest]) <= Math.max(1.5, step) ? closest : -1;
        if (near !== -1) { this.handle = near; if (this.tool === 'rectangle') this.opposite = this.points[(near + 2) % 4]; return; }
        this.clear(); this.hover = point;
      }
      if (this.tool !== 'lines' && !this.anchor) { this.anchor = point; this.startedNow = true; }
    }
    if (this.handle != null && (type === 'move' || type === 'up')) {
      if (this.circle) {
        if (this.handle === 0) this.circle.center = point;
        else this.circle.radius = Math.max(0.00001, distance(point, this.circle.center));
      } else if (this.tool === 'rectangle') this.points = this.rectangle(this.opposite, point);
      else this.points[this.handle] = point;
      if (type === 'up') this.handle = null;
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
    this.draw();
  }

  draw() {
    let points = this.points, circle = this.circle;
    if (this.anchor && this.hover) {
      if (this.tool === 'circle') circle = { type: 'circle', center: this.anchor, radius: distance(this.anchor, this.hover) };
      else points = this.rectangle(this.anchor, this.hover);
    } else if (!this.closed && this.tool === 'lines' && this.hover && points.length) points = [...points, this.hover];
    this.displayPoints = points;
    this.displayCircle = circle;
    this.viewport.drawProfile({ points, circle, closed: this.closed || Boolean(this.anchor) }, Number($('#sketch-height').value), $('#sketch-reverse').checked);
    this.refreshLabels();
  }

  refreshLabels() {
    document.querySelectorAll('[data-profile]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.profile === this.tool)));
    $('#sketch-plane-name').textContent = t(this.name);
    $('#sketch-instructions').textContent = t(this.closed ? 'sketch.instructionsClosed' : `sketch.instructions${this.tool[0].toUpperCase()}${this.tool.slice(1)}`);
    $('#sketch-status').textContent = this.closed ? t('sketch.closed') : this.points.length ? t('sketch.open', { count: formatNumber(this.points.length) }) : t('sketch.drawOnPlane');
    const points = this.displayPoints || this.points;
    const circle = this.displayCircle || this.circle;
    $('#sketch-measures').textContent = circle
      ? t('sketch.radiusMeasure', { radius: formatNumber(circle.radius, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), diameter: formatNumber(circle.radius * 2, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
      : points.length ? t('sketch.boundsMeasure', { width: formatNumber(Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), height: formatNumber(Math.max(...points.map(point => point[1])) - Math.min(...points.map(point => point[1])), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : '';
    const coordinates = this.hover || [0, 0];
    $('#sketch-coordinates').textContent = t('canvas.axisU', { u: formatNumber(coordinates[0], { minimumFractionDigits: 1, maximumFractionDigits: 1 }), v: formatNumber(coordinates[1], { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
    $('#sketch-close').disabled = this.closed || this.tool !== 'lines' || this.points.length < 3;
    $('#sketch-create').disabled = !this.closed;
    const effect = $('#sketch-effect').value;
    $('#sketch-target-field').hidden = effect === 'new';
    $('#sketch-create').textContent = t(this.object ? 'sketch.updateProfile' : { new: 'sketch.extrude', cut: 'sketch.cutSolid', fuse: 'sketch.addSolid' }[effect]);
  }
}
