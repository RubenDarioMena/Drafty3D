import { gsap } from 'gsap';
import { animateStep } from './animate.js';
import { formatValue } from './format.js';
import { lessonProgress, saveLessonProgress } from './progress.js';
import { STACK_ACTIONS, applyStep, fieldSteps, interactiveFields, isSolved, lessonModifierTypes, stateAt, toolField } from './state.js';
import { traceMatches } from './trace.js';

const TABS = new Set(['panel.properties.object', 'panel.properties.modifier']);
const ORBIT_HINT = 'Drag to orbit · two fingers to pan · pinch to zoom';
const TRACE_HINT = 'Trace the dotted line with one finger, starting at the dot';
// Header controls a sculpt step may use. Every brush or axis can be tried, only the right one opens the lock.
const SCULPT_CONTROLS = { set_mode: 'mode', select_brush: 'brush', set_direction: 'direction', set_symmetry: 'symmetry' };

/**
 * "Your turn" works like a combination lock: no attempt is ever counted as an
 * error. When the current step's control reaches its target, a clue confirms
 * it and the next dial unlocks. "Show me" always offers a way forward.
 * Strokes are traced over a dotted guide; the mesh then becomes Blender's result.
 */
export class YourTurnMode {
  constructor(context) {
    Object.assign(this, context);
    this.steps = fieldSteps(this.timeline);
    this.total = this.timeline.steps.length;
    this.sculpt = this.timeline.module === 'sculpt';
    // Sculpt lessons with modifier steps (Multires) also use the Properties editor.
    this.dual = this.sculpt && this.timeline.steps.some(step => step.modifier);
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
    this.modeMenu.interactive = true;
    this.modeMenu.onPick = mode => this.pickMode(mode);
    this.listenForStrokes(signal);
    const progress = lessonProgress(this.key);
    this.solved = Math.min(progress.solved ?? 0, this.total);
    this.helps = progress.helps ?? 0;
    this.live = stateAt(this.timeline, this.ui, this.solved - 1);
    this.dom.hint.hidden = false;
    this.viewer.showCamera(this.current()?.camera ?? this.live.camera, 0);
    this.bar.showClue('');
    this.refresh();
    this.check();
  }

  stop() {
    this.listeners.abort();
    this.dom.controls.hidden = true;
    this.dom.hint.textContent = ORBIT_HINT;
    this.menu.close();
    this.modeMenu.close();
    this.menu.interactive = false;
    this.modeMenu.interactive = false;
    this.viewer.clearOverlay();
    this.cursor.hide(0);
  }

  current() {
    return this.timeline.steps[this.solved];
  }

  renderOptions() {
    const step = this.current();
    const idle = !this.busy && step;
    if (this.sculpt) {
      const sculptValue = idle && step.action === 'set_value' && !step.modifier;
      const { size, strength } = this.ui.sculpt.header;
      const enabled = [idle && SCULPT_CONTROLS[step.action], idle && this.editor.popoverOf(step.id) && 'remesh'].filter(Boolean);
      const sculptOptions = {
        objectName: this.timeline.object,
        interactive: new Set(sculptValue ? [size.id, strength.id, step.id] : []),
        enabled: new Set(enabled),
        onRemesh: idle && step.action === 'remesh' ? () => this.remesh() : null,
        steps: this.steps,
        onModeMenu: idle && step.action === 'set_mode' ? button => this.modeMenu.open(button, this.live.mode) : null,
        onBrush: name => this.pickBrush(name),
        onDirection: value => this.setTool({ direction: value }),
        onSymmetry: axis => this.toggleAxis(axis),
        onValue: (id, value) => this.setTool({ [id.slice('sculpt.'.length)]: value }),
      };
      if (!this.dual) return sculptOptions;
      const modifierOptions = this.modifierOptions();
      return {
        ...modifierOptions, ...sculptOptions,
        interactive: new Set([...modifierOptions.interactive, ...sculptOptions.interactive]),
        onValue: (id, value) => (id.startsWith('sculpt.') ? sculptOptions : modifierOptions).onValue(id, value),
      };
    }
    return this.modifierOptions();
  }

  modifierOptions() {
    const shorts = new Set(this.live.modifiers.map(modifier => this.ui.modifiers[modifier.type].short));
    const ids = [...interactiveFields(this.timeline, this.solved)].filter(id => shorts.has(id.split('.')[1]));
    return {
      objectName: this.timeline.object,
      enabledTabs: TABS,
      interactive: this.busy ? new Set() : new Set(ids),
      steps: this.steps,
      onTab: id => this.tab(id),
      onValue: (id, value) => this.value(id, value),
      onStackOp: id => this.stackOp(id),
      onAddMenu: button => { if (!this.busy) this.menu.open(button); },
    };
  }

  refresh() {
    this.editor.focus?.(this.current() ?? this.timeline.steps.at(-1));
    this.editor.render(this.live, this.renderOptions());
    this.viewer.setGeometry(this.geometries.get(this.live.mesh));
    const step = this.current();
    this.bar.show(step
      ? { count: `Step ${this.solved + 1} of ${this.total}`, text: step.text, shortcut: step.shortcut }
      : { count: `Finished${this.helps ? ` · ${this.helps} with help` : ''}`, text: this.timeline.outro });
    this.dom.help.hidden = !step;
    this.dom.help.disabled = this.busy;
    this.prepareStroke();
  }

  /** A stroke step shows its dotted guide from Blender's camera; one finger draws instead of orbiting. */
  prepareStroke() {
    const step = this.current();
    const tracing = Boolean(step && step.action === 'stroke' && !this.busy);
    this.viewer.setOrbit(!tracing && !this.busy);
    this.dom.hint.textContent = tracing ? TRACE_HINT : ORBIT_HINT;
    if (!tracing) {
      this.viewer.clearOverlay();
      return;
    }
    if (this.prepared !== this.solved) {
      this.prepared = this.solved;
      this.viewer.showCamera(step.camera, 0.6);
    }
    this.viewer.showGuide(step.stroke.points, step.stroke.radius);
  }

  listenForStrokes(signal) {
    const canvas = this.viewer.canvas;
    let trace = null;
    const local = event => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const tracing = () => this.current()?.action === 'stroke' && !this.busy;
    canvas.addEventListener('pointerdown', event => {
      if (!tracing() || !event.isPrimary) return;
      trace = [local(event)];
      canvas.setPointerCapture(event.pointerId);
      this.viewer.overlay.showTrace(trace);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!trace) return;
      trace.push(local(event));
      this.viewer.overlay.showTrace(trace);
    }, { signal });
    const finish = () => {
      if (!trace) return;
      const points = trace;
      trace = null;
      this.viewer.overlay.showTrace([]);
      this.judgeTrace(points);
    };
    canvas.addEventListener('pointerup', finish, { signal });
    canvas.addEventListener('pointercancel', () => {
      trace = null;
      this.viewer.overlay.showTrace([]);
    }, { signal });
  }

  judgeTrace(points) {
    const step = this.current();
    if (step?.action !== 'stroke' || this.busy) return;
    const guide = this.viewer.overlay.guidePixels(this.viewer);
    const radius = this.viewer.projectRadius(step.stroke.points[0], step.stroke.radius);
    const result = traceMatches(points, guide, Math.max(28, radius * 1.2));
    if (!result.ok) {
      this.toast({ direction: 'Start at the dot', short: 'Drag along the whole line' }[result.reason] ?? 'Follow the dotted line');
      return;
    }
    this.busy = true;
    this.viewer.clearOverlay();
    const morph = this.viewer.strokeMorph(this.geometries.get(this.live.mesh), this.geometries.get(step.mesh), step.stroke);
    const progress = { t: 0 };
    gsap.to(progress, {
      t: 1, duration: 0.7, ease: 'power1.inOut', onUpdate: () => morph(progress.t),
      onComplete: () => {
        morph(1);
        this.busy = false;
        this.succeed(false);
      },
    });
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

  setTool(changes) {
    if (this.busy || !this.live.tool) return;
    this.bar.showClue('');
    this.live = { ...this.live, tool: { ...this.live.tool, ...changes } };
    this.refresh();
    this.check();
  }

  toggleAxis(axis) {
    if (this.busy || !this.live.tool) return;
    const symmetry = this.live.tool.symmetry.includes(axis)
      ? this.live.tool.symmetry.filter(other => other !== axis)
      : [...this.live.tool.symmetry, axis].sort();
    this.setTool({ symmetry });
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

  /** A header toggle or a menu item (Move to First, Apply): only the current step's control does anything. */
  stackOp(id) {
    if (this.busy) return;
    const step = this.current();
    if (step && STACK_ACTIONS.has(step.action) && step.id === id) this.succeed(false);
    else {
      this.toast('Not this one yet');
      this.refresh();
    }
  }

  /** The Remesh button: Blender's remeshed surface replaces the mesh. */
  remesh() {
    if (this.busy || this.current()?.action !== 'remesh') return;
    this.editor.openList = null;
    this.succeed(false);
  }

  pickMode(mode) {
    const step = this.current();
    if (step?.action === 'set_mode' && step.value === mode) this.succeed(false);
    else if (mode !== this.live.mode) this.toast('Not this one yet');
  }

  pickBrush(name) {
    if (this.busy) return;
    const step = this.current();
    if (step?.action === 'select_brush' && step.value === name) this.succeed(false);
    else if (name !== this.live.tool?.brush) this.toast('Not this one yet');
  }

  check() {
    const step = this.current();
    if (step && !this.busy && isSolved(this.live, step)) this.succeed(false);
  }

  clueFor(step) {
    switch (step.action) {
      case 'select_panel': return '✓ Modifier Properties open.';
      case 'add_modifier': return `✓ ${step.value} added.`;
      case 'set_mode': return `✓ ${this.ui.sculpt.modeMenu.items.find(item => item.value === step.value).label}.`;
      case 'select_brush': return `✓ ${step.value} brush.`;
      case 'set_direction': return `✓ Direction: ${this.ui.sculpt.header.direction.items.find(item => item.value === step.value).label}.`;
      case 'set_symmetry': return `✓ Mirror ${step.id.split('.').pop().toUpperCase()} ${step.value ? 'on' : 'off'}.`;
      case 'stroke': return '✓ Stroke done. This is the surface Blender sculpted.';
      case 'toggle_modifier': return `✓ ${this.ui.modifiers[step.modifier].defaultName} ${step.value ? 'shown' : 'hidden'} in the viewport.`;
      case 'move_modifier': return `✓ ${this.ui.modifiers[step.modifier].defaultName} moved to the ${step.value === 'FIRST' ? 'top' : 'bottom'} of the stack.`;
      case 'remesh': return `✓ Remeshed: ${step.remesh.before.toLocaleString('en')} → ${step.remesh.vertices.toLocaleString('en')} vertices, all about ${formatValue(this.editor.field('sculpt.voxel_size'), step.tool.voxel_size)} apart.`;
      case 'multires_subdivide': return `✓ Subdivided: Multires is at level ${step.values[`modifier.multires.levels`]}.`;
      case 'apply_modifier': return `✓ ${this.ui.modifiers[step.modifier].defaultName} applied: it is part of the mesh now.`;
      default: break;
    }
    if (!step.modifier) {
      const field = this.ui.sculpt.header[toolField(step)] ?? this.editor.field(step.id);
      return `✓ ${field.label}: ${formatValue(field, step.value)}.`;
    }
    const field = this.ui.modifiers[step.modifier].fields.find(candidate => candidate.id === step.id);
    if (field.kind === 'pointer') return `✓ ${field.label}: ${step.value}.`;
    if (field.kind === 'bool') return `✓ ${field.row ? `${field.row} ${field.label}` : (field.title ?? field.label)} ${step.value ? 'on' : 'off'}.`;
    if (field.kind === 'enum') return `✓ ${field.label}: ${field.items.find(item => item.value === step.value).label}.`;
    return `✓ ${field.title ?? field.label}: ${formatValue(field, step.value)}.`;
  }

  // Synchronous on purpose: the celebration (clue, camera move) never blocks the next tap.
  succeed(helped) {
    const step = this.current();
    this.live = applyStep(this.live, step, this.ui);
    this.solved += 1;
    if (helped) this.helps += 1;
    saveLessonProgress(this.key, { solved: this.solved, helps: this.helps, completed: this.solved === this.total });
    const next = this.current();
    // The next stroke is shown from its own camera; anything else keeps Blender's camera for this step.
    if (next?.action !== 'stroke') this.viewer.showCamera(step.camera, 0.7);
    this.refresh();
    const id = step.action === 'add_modifier' ? `modifier.${step.id.split('.')[1]}`
      : step.action === 'set_mode' ? this.ui.sculpt.modeMenu.id : step.id;
    if (step.action !== 'stroke') this.editor.element(id)?.classList.add('is-solved');
    this.bar.showClue(helped ? `Shown: ${step.help}` : this.clueFor(step), helped);
    try { navigator.vibrate?.(35); } catch {}
    this.check();
  }

  async help() {
    const step = this.current();
    if (!step || this.busy) return;
    this.busy = true;
    this.refresh();
    this.menu.interactive = false;
    this.modeMenu.interactive = false;
    const to = applyStep(this.live, step, this.ui);
    await animateStep({
      step, to, from: this.live, editor: this.editor, menu: this.menu, modeMenu: this.modeMenu, cursor: this.cursor,
      viewer: this.viewer, geometries: this.geometries,
      render: state => this.editor.render(state, { ...this.editor.options, interactive: new Set(), enabled: new Set() }),
    });
    this.menu.interactive = true;
    this.modeMenu.interactive = true;
    this.cursor.hide();
    this.busy = false;
    this.succeed(true);
  }

  restart() {
    if (this.busy) return;
    this.solved = 0;
    this.helps = 0;
    this.prepared = null;
    this.live = stateAt(this.timeline, this.ui, -1);
    saveLessonProgress(this.key, { solved: 0, helps: 0, completed: false });
    this.bar.showClue('');
    this.viewer.showCamera(this.live.camera, 0.5);
    this.refresh();
  }
}
