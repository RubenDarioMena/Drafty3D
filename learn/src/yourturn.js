import { animateStep } from './animate.js';
import { formatValue } from './format.js';
import { lessonProgress, saveLessonProgress } from './progress.js';
import { applyStep, fieldSteps, interactiveFields, isSolved, lessonModifierTypes, stateAt } from './state.js';

const TABS = new Set(['panel.properties.object', 'panel.properties.modifier']);

/**
 * "Your turn" works like a combination lock: no attempt is ever counted as an
 * error. When the current step's control reaches its target, a clue confirms
 * it and the next dial unlocks. "Show me" always offers a way forward.
 */
export class YourTurnMode {
  constructor(context) {
    Object.assign(this, context);
    this.steps = fieldSteps(this.timeline);
    this.total = this.timeline.steps.length;
    this.busy = false;
    this.listeners = new AbortController();
    this.dom = {
      controls: document.getElementById('turn-controls'),
      help: document.getElementById('help'),
      restart: document.getElementById('restart'),
      hint: document.getElementById('orbit-hint'),
    };
  }

  start() {
    const signal = this.listeners.signal;
    this.dom.controls.hidden = false;
    this.dom.help.addEventListener('click', () => this.help(), { signal });
    this.dom.restart.addEventListener('click', () => this.restart(), { signal });
    this.menu.interactive = true;
    this.menu.enabledTypes = lessonModifierTypes(this.timeline);
    this.menu.onPick = type => this.pick(type);
    const progress = lessonProgress(this.key);
    this.solved = Math.min(progress.solved ?? 0, this.total);
    this.helps = progress.helps ?? 0;
    this.live = stateAt(this.timeline, this.ui, this.solved - 1);
    this.viewer.setOrbit(true);
    this.dom.hint.hidden = false;
    this.viewer.showCamera(this.live.camera, 0);
    this.bar.showClue('');
    this.refresh();
    this.check();
  }

  stop() {
    this.listeners.abort();
    this.dom.controls.hidden = true;
    this.menu.close();
    this.menu.interactive = false;
    this.cursor.hide(0);
  }

  current() {
    return this.timeline.steps[this.solved];
  }

  refresh() {
    const ids = [...interactiveFields(this.timeline, this.solved)]
      .filter(id => this.live.modifiers.some(modifier => id in modifier.values));
    this.editor.render(this.live, {
      objectName: this.timeline.object,
      enabledTabs: TABS,
      interactive: this.busy ? new Set() : new Set(ids),
      steps: this.steps,
      onTab: id => this.tab(id),
      onValue: (id, value) => this.value(id, value),
      onAddMenu: button => { if (!this.busy) this.menu.open(button); },
    });
    this.viewer.setGeometry(this.geometries.get(this.live.mesh));
    const step = this.current();
    this.bar.show(step
      ? { count: `Step ${this.solved + 1} of ${this.total}`, text: step.text, shortcut: step.shortcut }
      : { count: `Finished${this.helps ? ` · ${this.helps} with help` : ''}`, text: this.timeline.outro });
    this.dom.help.hidden = !step;
    this.dom.help.disabled = this.busy;
  }

  tab(id) {
    if (this.busy) return;
    this.bar.showClue('');
    this.live = { ...this.live, panel: id };
    this.refresh();
    this.check();
  }

  value(id, value) {
    if (this.busy) return;
    this.bar.showClue('');
    this.live = {
      ...this.live,
      modifiers: this.live.modifiers.map(modifier => (id in modifier.values ? { ...modifier, values: { ...modifier.values, [id]: value } } : modifier)),
    };
    this.refresh();
    this.check();
  }

  pick(type) {
    const step = this.current();
    if (step?.action === 'add_modifier' && step.modifier === type) {
      this.succeed(false);
      return;
    }
    // three.js never invents a result Blender did not compute, so off-lesson picks add nothing.
    this.toast('Not this one yet');
  }

  check() {
    const step = this.current();
    if (step && !this.busy && isSolved(this.live, step)) this.succeed(false);
  }

  clueFor(step) {
    if (step.action === 'select_panel') return '✓ Modifier Properties open.';
    if (step.action === 'add_modifier') return `✓ ${step.value} added.`;
    const field = this.ui.modifiers[step.modifier].fields.find(candidate => candidate.id === step.id);
    return `✓ ${field.label}: ${formatValue(field, step.value)}.`;
  }

  // Synchronous on purpose: the celebration (clue, camera move) never blocks the next tap.
  succeed(helped) {
    const step = this.current();
    this.live = applyStep(this.live, step, this.ui);
    this.solved += 1;
    if (helped) this.helps += 1;
    saveLessonProgress(this.key, { solved: this.solved, helps: this.helps, completed: this.solved === this.total });
    this.refresh();
    const id = step.action === 'add_modifier' ? `modifier.${step.id.split('.')[1]}` : step.id;
    this.editor.element(id)?.classList.add('is-solved');
    this.bar.showClue(helped ? `Shown: ${step.help}` : this.clueFor(step), helped);
    try { navigator.vibrate?.(35); } catch {}
    this.viewer.showCamera(step.camera, 0.7);
    this.check();
  }

  async help() {
    const step = this.current();
    if (!step || this.busy) return;
    this.busy = true;
    this.refresh();
    this.menu.interactive = false;
    const to = applyStep(this.live, step, this.ui);
    await animateStep({
      step, to, editor: this.editor, menu: this.menu, cursor: this.cursor,
      render: state => this.editor.render(state, { ...this.editor.options, interactive: new Set() }),
    });
    this.menu.interactive = true;
    this.cursor.hide();
    this.busy = false;
    this.succeed(true);
  }

  restart() {
    if (this.busy) return;
    this.solved = 0;
    this.helps = 0;
    this.live = stateAt(this.timeline, this.ui, -1);
    saveLessonProgress(this.key, { solved: 0, helps: 0, completed: false });
    this.bar.showClue('');
    this.viewer.showCamera(this.live.camera, 0.5);
    this.refresh();
  }
}
