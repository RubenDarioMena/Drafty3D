import { animateStep } from './animate.js';
import { wait } from './cursor.js';
import { lessonProgress, saveLessonProgress } from './progress.js';
import { fieldSteps, stateAt } from './state.js';

const TABS = new Set(['panel.properties.object', 'panel.properties.modifier']);

/** "Watch": click-to-advance by default, optional autoplay; pausing frees the 3D camera. */
export class WatchMode {
  constructor(context) {
    Object.assign(this, context);
    this.index = -1;
    this.busy = false;
    this.autoplay = false;
    this.token = 0;
    this.steps = fieldSteps(this.timeline);
    this.last = this.timeline.steps.length - 1;
    this.sculpt = this.timeline.module === 'sculpt';
    this.listeners = new AbortController();
    this.dom = {
      controls: document.getElementById('watch-controls'),
      scrubber: document.getElementById('scrubber'),
      prev: document.getElementById('prev'),
      next: document.getElementById('next'),
      autoplay: document.getElementById('autoplay'),
      hint: document.getElementById('orbit-hint'),
      fineNext: document.getElementById('fine-next'),
      finePrev: document.getElementById('fine-prev'),
    };
    // Position inside the next step's actions (null = resting on a completed step).
    this.stage = null;
  }

  start() {
    const { controls, scrubber, prev, next, autoplay } = this.dom;
    const signal = this.listeners.signal;
    controls.hidden = false;
    scrubber.max = String(this.last);
    autoplay.checked = false;
    this.menu.interactive = false;
    next.addEventListener('click', () => this.next(), { signal });
    prev.addEventListener('click', () => this.seek(this.stage === null ? this.index - 1 : this.index), { signal });
    this.dom.fineNext.addEventListener('click', () => this.fine(1), { signal });
    this.dom.finePrev.addEventListener('click', () => this.fine(-1), { signal });
    scrubber.addEventListener('input', () => this.seek(Number(scrubber.value)), { signal });
    autoplay.addEventListener('change', () => {
      this.autoplay = autoplay.checked;
      if (this.autoplay && !this.busy) this.next();
    }, { signal });
    const saved = lessonProgress(this.key).lastStep ?? -1;
    this.jump(Math.min(saved, this.last), 0);
  }

  stop() {
    this.token += 1;
    this.listeners.abort();
    this.dom.controls.hidden = true;
    this.menu.close();
    this.modeMenu.close();
    this.viewer.clearOverlay();
    this.cursor.hide(0);
  }

  render(state) {
    this.editor.render(state, {
      objectName: this.timeline.object, enabledTabs: TABS, interactive: new Set(), steps: this.steps, showAllEnabled: true,
      enabled: new Set(),
    });
    this.viewer.setGeometry(this.geometries.get(state.mesh));
  }

  /** Semantic id a step points at: the modifier card, the mode dropdown, or the control itself. Strokes point at the 3D Viewport. */
  targetOf(step) {
    if (step.action === 'add_modifier') return `modifier.${step.id.split('.')[1]}`;
    if (step.action === 'set_mode') return this.ui.sculpt.modeMenu.id;
    if (step.action === 'stroke') return null;
    return step.id;
  }

  jump(index, cameraDuration = 0.35) {
    this.index = index;
    this.stage = null;
    this.menu.close();
    this.modeMenu.close();
    this.viewer.clearOverlay();
    const state = stateAt(this.timeline, this.ui, index);
    this.render(state);
    this.viewer.showCamera(state.camera, cameraDuration);
    const step = this.timeline.steps[index];
    const total = this.timeline.steps.length;
    this.bar.show(index < 0
      ? { count: `${total} steps`, text: this.timeline.initial.text }
      : { count: `Step ${index + 1} of ${total}${index === this.last ? ' · Done' : ''}`,
          text: index === this.last ? `${step.text} ${this.timeline.outro}` : step.text, shortcut: step.shortcut });
    this.bar.showClue('');
    if (step) this.highlight(step);
    this.updateControls();
    const progress = lessonProgress(this.key);
    saveLessonProgress(this.key, { lastStep: index, completed: Boolean(progress.completed) || index === this.last });
  }

  highlight(step) {
    const id = this.targetOf(step);
    if (id) this.editor.element(id)?.classList.add('is-target');
  }

  updateControls() {
    const { scrubber, prev, next, hint } = this.dom;
    scrubber.value = String(this.index);
    prev.disabled = this.busy || (this.index < 0 && this.stage === null);
    next.disabled = this.busy || this.index >= this.last;
    this.dom.finePrev.disabled = this.busy || (this.index < 0 && this.stage === null);
    this.dom.fineNext.disabled = this.busy || this.index >= this.last;
    next.textContent = this.index < 0 ? 'Start ▶' : this.index >= this.last ? 'Done ✓' : 'Next ▶';
    this.viewer.setOrbit(!this.busy);
    hint.hidden = this.busy;
  }

  async next() {
    if (this.busy || this.index >= this.last) return;
    this.stage = null;
    this.menu.close();
    this.modeMenu.close();
    this.viewer.clearOverlay();
    const token = ++this.token;
    const index = this.index + 1;
    const step = this.timeline.steps[index];
    const from = stateAt(this.timeline, this.ui, this.index);
    const to = stateAt(this.timeline, this.ui, index);
    this.busy = true;
    this.updateControls();
    this.bar.show({ count: `Step ${index + 1} of ${this.timeline.steps.length}`, text: step.text, shortcut: step.shortcut });
    this.bar.showClue('');
    // A stroke moves the camera itself before the brush starts.
    const camera = step.action === 'stroke' ? null : this.viewer.showCamera(step.camera, 0.8);
    await animateStep({
      step, to, from, editor: this.editor, menu: this.menu, modeMenu: this.modeMenu, cursor: this.cursor,
      viewer: this.viewer, geometries: this.geometries, render: state => this.render(state),
    });
    await camera;
    if (token !== this.token) return;
    this.busy = false;
    this.jump(index, 0);
    this.cursor.hide();
    if (index === this.last) {
      this.autoplay = this.dom.autoplay.checked = false;
      return;
    }
    if (step.autoAdvance || this.autoplay) {
      await wait(step.autoAdvance ? 0.6 : step.duration);
      if (token === this.token && (step.autoAdvance || this.autoplay)) this.next();
    }
  }

  /** Actions inside a step, so the learner can stop on each one (e.g. the open menu). */
  stagesOf(step) {
    if (step.action === 'add_modifier') return ['menu', 'submenu'];
    if (step.action === 'set_mode') return ['menu', 'item'];
    return ['target'];
  }

  /** Moves one action forward (+1) or back (-1), paused on that frame. */
  fine(direction) {
    if (this.busy) return;
    this.token += 1;
    this.autoplay = this.dom.autoplay.checked = false;
    if (direction > 0) {
      if (this.index >= this.last) return;
      const count = this.stagesOf(this.timeline.steps[this.index + 1]).length;
      if (this.stage === null) this.stage = 0;
      else if (this.stage < count - 1) this.stage += 1;
      else return this.finishStage();
    } else {
      if (this.stage === null) {
        if (this.index < 0) return;
        const index = this.index - 1;
        this.jump(index, 0);
        this.stage = this.stagesOf(this.timeline.steps[index + 1]).length - 1;
      } else if (this.stage > 0) this.stage -= 1;
      else return this.jump(this.index);
    }
    this.showStage();
  }

  finishStage() {
    this.jump(this.index + 1);
    this.cursor.hide();
  }

  showStage() {
    const index = this.index + 1;
    const step = this.timeline.steps[index];
    const stage = this.stagesOf(step)[this.stage];
    this.render(stateAt(this.timeline, this.ui, this.index));
    this.menu.close();
    this.modeMenu.close();
    this.viewer.clearOverlay();
    const camera = this.viewer.showCamera(step.camera, 0.35);
    const token = this.token;
    const total = this.timeline.steps.length;
    const count = this.stagesOf(step).length;
    this.bar.show({ count: `Step ${index + 1} of ${total} · action ${this.stage + 1} of ${count + 1}`, text: step.text, shortcut: step.shortcut });
    this.bar.showClue('');
    let target;
    if (step.action === 'stroke') {
      // Paused before a stroke: the dotted path it will follow, with the cursor on its start.
      this.viewer.showGuide(step.stroke.points, step.stroke.radius);
      this.cursor.hide(0);
      this.updateControls();
      camera.then(() => {
        if (token !== this.token || this.stage === null) return;
        const rect = this.viewer.canvas.getBoundingClientRect();
        const start = this.viewer.project(step.stroke.points[0]);
        this.cursor.moveToPoint(rect.left + start.x, rect.top + start.y, 0.3);
      });
      return;
    }
    if (step.action === 'set_mode') {
      const button = this.editor.element(this.modeMenu.ui.id);
      target = button;
      if (stage === 'item') {
        this.modeMenu.open(button, stateAt(this.timeline, this.ui, this.index).mode);
        target = this.modeMenu.element(step.id);
      }
    } else if (stage === 'target') {
      target = step.action === 'select_brush' ? this.editor.reveal(step.id) : this.editor.element(step.id);
    } else {
      const button = this.editor.element(this.menu.ui.id);
      this.menu.open(button);
      target = button;
      if (stage === 'submenu') {
        this.menu.openCategory(this.menu.categoryOf(step.id).id);
        target = this.menu.element(step.id);
      }
    }
    target?.classList.add(stage === 'submenu' || stage === 'item' ? 'active' : 'is-target');
    this.cursor.moveTo(target, 0.3);
    this.updateControls();
  }

  seek(index) {
    this.token += 1;
    this.busy = false;
    this.autoplay = this.dom.autoplay.checked = false;
    this.menu.close();
    this.modeMenu.close();
    this.cursor.hide(0);
    this.jump(Math.max(-1, Math.min(this.last, index)));
  }
}
