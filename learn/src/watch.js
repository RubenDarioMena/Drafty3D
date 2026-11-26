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
    this.listeners = new AbortController();
    this.dom = {
      controls: document.getElementById('watch-controls'),
      scrubber: document.getElementById('scrubber'),
      prev: document.getElementById('prev'),
      next: document.getElementById('next'),
      autoplay: document.getElementById('autoplay'),
      hint: document.getElementById('orbit-hint'),
    };
  }

  start() {
    const { controls, scrubber, prev, next, autoplay } = this.dom;
    const signal = this.listeners.signal;
    controls.hidden = false;
    scrubber.max = String(this.last);
    autoplay.checked = false;
    this.menu.interactive = false;
    next.addEventListener('click', () => this.next(), { signal });
    prev.addEventListener('click', () => this.seek(this.index - 1), { signal });
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
    this.cursor.hide(0);
  }

  render(state) {
    this.editor.render(state, {
      objectName: this.timeline.object, enabledTabs: TABS, interactive: new Set(), steps: this.steps, showAllEnabled: true,
    });
    this.viewer.setGeometry(this.geometries.get(state.mesh));
  }

  jump(index, cameraDuration = 0.35) {
    this.index = index;
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
    const id = step.action === 'add_modifier' ? `modifier.${step.id.split('.')[1]}` : step.id;
    this.editor.element(id)?.classList.add('is-target');
  }

  updateControls() {
    const { scrubber, prev, next, hint } = this.dom;
    scrubber.value = String(this.index);
    prev.disabled = this.busy || this.index < 0;
    next.disabled = this.busy || this.index >= this.last;
    next.textContent = this.index < 0 ? 'Start ▶' : this.index >= this.last ? 'Done ✓' : 'Next ▶';
    this.viewer.setOrbit(!this.busy);
    hint.hidden = this.busy;
  }

  async next() {
    if (this.busy || this.index >= this.last) return;
    const token = ++this.token;
    const index = this.index + 1;
    const step = this.timeline.steps[index];
    const to = stateAt(this.timeline, this.ui, index);
    this.busy = true;
    this.updateControls();
    this.bar.show({ count: `Step ${index + 1} of ${this.timeline.steps.length}`, text: step.text, shortcut: step.shortcut });
    this.bar.showClue('');
    const camera = this.viewer.showCamera(step.camera, 0.8);
    await animateStep({ step, to, editor: this.editor, menu: this.menu, cursor: this.cursor, render: state => this.render(state) });
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

  seek(index) {
    this.token += 1;
    this.busy = false;
    this.autoplay = this.dom.autoplay.checked = false;
    this.menu.close();
    this.cursor.hide(0);
    this.jump(Math.max(-1, Math.min(this.last, index)));
  }
}
