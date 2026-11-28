import { gsap } from 'gsap';
import { animateStep } from './animate.js';
import { formatValue } from './format.js';
import { lessonProgress, saveLessonProgress } from './progress.js';
import {
  NAVIGATION, controlOf, editTarget, hitsElement, hitsPoint, hitsRing, menuLabels, navigationDone, redoField, showState, usesProportional, usesShift,
} from './scene-view.js';
import {
  STACK_ACTIONS, applyStep, fieldSteps, interactiveFields, isSceneLesson, isSolved, lessonMenuItems, lessonModifierTypes,
  stateAt, toolField,
} from './state.js';
import { traceMatches } from './trace.js';

const TABS = new Set(['panel.properties.object', 'panel.properties.modifier']);
const ORBIT_HINT = 'Drag to orbit · two fingers to pan · pinch to zoom';
const TRACE_HINT = 'Trace the dotted line with one finger, starting at the dot';
const KNIFE_HINT = 'Tap the numbered dots in order, then press ⏎ Enter';
// A tap is a short press that barely moves; anything longer is orbiting.
const TAP = { pixels: 8, ms: 500 };
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
    this.scene = isSceneLesson(this.timeline);
    this.knifeDone = 0;
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
    if (this.scene) {
      this.headerMenu.interactive = true;
      this.headerMenu.enabledItems = lessonMenuItems(this.timeline);
      this.headerMenu.onPick = id => this.pickMenuItem(id);
      this.listenForViewport(signal);
    }
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
    this.headerMenu.close();
    this.menu.interactive = false;
    this.modeMenu.interactive = false;
    this.headerMenu.interactive = false;
    for (const [type, handler] of this.controlHandlers ?? []) this.viewer.controls.removeEventListener(type, handler);
    this.controlHandlers = null;
    this.editor.renaming = null;
    this.keys.show(false, false);
    this.keys.setShift(false);
    this.viewer.clearOverlay();
    this.cursor.hide(0);
  }

  current() {
    return this.timeline.steps[this.solved];
  }

  renderOptions() {
    const step = this.current();
    const idle = !this.busy && step;
    if (this.scene) return this.sceneOptions(step, idle);
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

  /**
   * Levels 1 and 2: the header (mode, select mode, menus, Proportional Editing), the Adjust Last
   * Operation panel and the Outliner. Every button opens; only the current step's choice moves on.
   */
  sceneOptions(step, idle) {
    const is = action => Boolean(idle && step.action === action);
    return {
      // The same field can come back with a finer step (Location Z 0.75 m, later 0.225 m): use this step's.
      steps: is('redo_value') ? { ...this.steps, [step.id]: step.step } : this.steps,
      interactive: new Set(is('redo_value') ? [step.id] : []),
      showProportional: usesProportional(this.timeline),
      enabled: new Set([is('select_mode') && 'selectMode', is('proportional') && 'proportional'].filter(Boolean)),
      onModeMenu: idle ? button => this.modeMenu.open(button, this.live.mode) : null,
      onHeaderMenu: idle ? (button, id) => this.headerMenu.open(button, id) : null,
      onSelectMode: value => this.pickSelectMode(value),
      onProportional: on => this.changeLive({ proportional: on }),
      onValue: (id, value) => this.redoValue(id, value),
      onOutlinerSelect: idle ? name => this.outlinerSelect(name) : null,
      onRename: name => this.outlinerSelect(name, true),
      onRenameDone: (name, text) => this.renameDone(name, text),
      onOutlinerHide: idle ? (name, hidden) => this.outlinerHide(name, hidden) : null,
    };
  }

  refresh() {
    this.editor.focus?.(this.current() ?? this.timeline.steps.at(-1));
    this.editor.render(this.live, this.renderOptions());
    showState(this.viewer, this.geometries, this.live);
    const step = this.current();
    this.bar.show(step
      ? { count: `Step ${this.solved + 1} of ${this.total}`, text: step.text, shortcut: step.shortcut }
      : { count: `Finished${this.helps ? ` · ${this.helps} with help` : ''}`, text: this.timeline.outro });
    this.dom.help.hidden = !step;
    this.dom.help.disabled = this.busy;
    this.prepareStroke();
    this.prepareScene();
  }

  /** Knife steps show Blender's cut points to tap; the Shift and Enter keys sit over the 3D Viewport. */
  prepareScene() {
    if (!this.scene) return;
    const step = this.current();
    this.keys.show(usesShift(this.timeline), this.live.modal === 'mesh.knife_tool');
    if (step?.action === 'knife' && !this.busy) {
      this.viewer.showKnife(step.knife.points, this.knifeDone);
      this.dom.hint.textContent = KNIFE_HINT;
    }
  }

  /** Taps in the 3D Viewport (select, knife, Loop Cut) and finished orbit, pan or zoom gestures. */
  listenForViewport(signal) {
    const canvas = this.viewer.canvas;
    let press = null;
    canvas.addEventListener('pointerdown', event => {
      press = event.isPrimary ? { x: event.clientX, y: event.clientY, time: performance.now(), pointers: 1 } : null;
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      // A mouse hovering the right edge ring previews the loop, as Blender's Loop Cut tool does.
      if (event.pointerType !== 'mouse' || event.buttons || this.busy || this.current()?.action !== 'loop_cut') return;
      const rect = canvas.getBoundingClientRect();
      const hover = hitsRing(this.viewer, this.live.edit, this.current().ring, { x: event.clientX - rect.left, y: event.clientY - rect.top });
      if (hover !== this.hoverRing) {
        this.hoverRing = hover;
        showState(this.viewer, this.geometries, this.live, hover ? this.current().ring : null);
      }
    }, { signal });
    canvas.addEventListener('pointerup', event => {
      if (!press || !event.isPrimary) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      const quick = performance.now() - press.time < TAP.ms;
      press = null;
      if (moved > TAP.pixels || !quick) return;
      const rect = canvas.getBoundingClientRect();
      this.viewportTap({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.shiftKey);
    }, { signal });
    this.keys.shiftButton.addEventListener('click', () => this.keys.setShift(!this.keys.shift), { signal });
    this.keys.enterButton.addEventListener('click', () => this.enter(), { signal });
    document.addEventListener('keydown', event => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === 'Enter' && this.current()?.action === 'knife') this.enter();
    }, { signal });

    // One gesture may arrive as several (each wheel tick starts and ends one): judge them together,
    // once the view has come to rest. OrbitControls' damping keeps it sliding after the finger lifts,
    // so every move after the gesture ends restarts the wait.
    let start = null;
    let timer = null;
    let touching = false;
    const judge = () => {
      timer = null;
      const step = this.current();
      const before = start;
      start = null;
      if (!before || this.busy || !step || !NAVIGATION.has(step.action)) return;
      const [x, y, z] = step.camera.position;
      const [tx, ty, tz] = step.camera.target;
      const recorded = { distance: Math.hypot(x - tx, y - ty, z - tz) };
      if (navigationDone(step.action, before, this.viewer.view(), recorded)) this.succeed(false);
      else this.toast({ orbit: 'Drag further to turn the view', zoom: 'Pinch or scroll a bit more', pan: 'Two fingers (or right-drag) slide the view without turning it' }[step.action]);
    };
    const wait = () => {
      clearTimeout(timer);
      timer = setTimeout(judge, 300);
    };
    const onStart = () => {
      start ??= this.viewer.view();
      touching = true;
      clearTimeout(timer);
    };
    const onEnd = () => {
      touching = false;
      wait();
    };
    const onChange = () => {
      if (start && !touching) wait();
    };
    this.controlHandlers = [['start', onStart], ['end', onEnd], ['change', onChange]];
    for (const [type, handler] of this.controlHandlers) this.viewer.controls.addEventListener(type, handler);
  }

  viewportTap(at, shiftKey) {
    const step = this.current();
    if (!step || this.busy) return;
    if (step.action === 'knife') {
      const points = step.knife.points;
      if (this.knifeDone < points.length && hitsPoint(this.viewer, points[this.knifeDone], at)) {
        this.knifeDone += 1;
        this.viewer.showKnife(points, this.knifeDone);
        try { navigator.vibrate?.(15); } catch {}
      } else if (this.knifeDone < points.length) this.toast(`Tap dot ${this.knifeDone + 1}`);
      return;
    }
    if (step.action === 'loop_cut') {
      if (hitsRing(this.viewer, this.live.edit, step.ring, at)) this.succeed(false);
      else this.toast('Not this edge: the loop runs across the edge you tap');
      return;
    }
    if (step.action !== 'tap') return;
    const shift = this.keys.shift || shiftKey;
    let hit;
    if (this.live.mode === 'EDIT') {
      hit = hitsElement(this.viewer, this.live.edit, editTarget(this.live.edit, this.live.selectMode, step.value), at);
    } else {
      hit = this.viewer.objectAt(at.x, at.y) === step.after.scene.active;
    }
    if (!hit) {
      this.toast('Not this one yet');
      return;
    }
    if (shift !== Boolean(step.toggle)) {
      this.toast(step.toggle ? 'Turn on ⇧ Shift to add to the selection' : 'Turn off ⇧ Shift: this click starts a new selection');
      return;
    }
    this.keys.setShift(false);
    this.succeed(false);
  }

  /** ⏎ Enter confirms the Knife once every point is in. */
  enter() {
    const step = this.current();
    if (!step || this.busy || step.action !== 'knife') return;
    if (this.knifeDone < step.knife.points.length) {
      this.toast(`Tap all ${step.knife.points.length} dots first`);
      return;
    }
    this.viewer.clearOverlay();
    this.succeed(false);
  }

  pickMenuItem(id) {
    const step = this.current();
    if (!this.busy && step?.action === 'menu' && step.id === id) this.succeed(false);
    else this.toast('Not this one yet');
  }

  pickSelectMode(value) {
    if (this.busy) return;
    this.changeLive({ selectMode: [value] });
  }

  changeLive(changes) {
    if (this.busy) return;
    this.bar.showClue('');
    this.live = { ...this.live, ...changes };
    this.refresh();
    this.check();
  }

  redoValue(id, value) {
    if (this.busy || !this.live.redo) return;
    this.changeLive({ redo: { ...this.live.redo, values: { ...this.live.redo.values, [id]: value } } });
  }

  /** A tap on an Outliner row selects it; on a rename step's object it opens the name field. */
  outlinerSelect(name, rename = false) {
    const step = this.current();
    if (this.busy || !step) return;
    if (step.action === 'rename' && step.target === name) {
      this.editor.renaming = name;
      this.editor.renameText = name;
      this.refresh();
      return;
    }
    if (rename) return;
    if (step.action === 'outliner_select' && step.value === name) this.succeed(false);
    else this.toast('Not this one yet');
  }

  renameDone(name, text) {
    if (this.editor.renaming !== name) return;
    const step = this.current();
    this.editor.renaming = null;
    if (text === null || this.busy) {
      this.refresh();
      return;
    }
    if (step?.action === 'rename' && text === step.value) {
      this.succeed(false);
      return;
    }
    if (text !== name) this.toast(`Type the name exactly: ${step.value}`);
    this.refresh();
  }

  outlinerHide(name, hidden) {
    const step = this.current();
    if (!this.busy && step?.action === 'outliner_hide' && step.value === name && step.hidden === hidden) this.succeed(false);
    else this.toast('Not this one yet');
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
      case 'menu': return `✓ ${menuLabels(this.ui, step.path).join(' ▸ ')}.`;
      case 'redo_value': {
        const field = redoField(this.ui, step.operator, step.id);
        return `✓ ${field?.title ?? field?.label ?? step.id}: ${field ? formatValue(field, step.value) : step.value}.`;
      }
      case 'select_mode': return `✓ ${this.ui.view3d.selectModes.find(item => item.value === step.value).label} select.`;
      case 'proportional': return `✓ ${this.ui.view3d.proportional.label} ${step.value ? 'on' : 'off'}.`;
      case 'tap': return step.after.mode === 'EDIT' ? '✓ Selected.' : `✓ ${step.after.scene.active} selected.`;
      case 'knife': return '✓ Cut. This is the cut Blender made.';
      case 'loop_cut': return '✓ Loop cut. This is the loop Blender added.';
      case 'orbit': return '✓ You turned the view.';
      case 'zoom': return '✓ You zoomed the view.';
      case 'pan': return '✓ You slid the view.';
      case 'outliner_select': return `✓ ${step.value} selected.`;
      case 'outliner_hide': return `✓ ${step.value} ${step.hidden ? 'hidden' : 'shown'}.`;
      case 'rename': return `✓ Renamed to ${step.value}.`;
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
    this.knifeDone = 0;
    this.hoverRing = false;
    this.editor.renaming = null;
    if (helped) this.helps += 1;
    saveLessonProgress(this.key, { solved: this.solved, helps: this.helps, completed: this.solved === this.total });
    const next = this.current();
    // The next stroke is shown from its own camera; anything else keeps Blender's camera for this step.
    if (next?.action !== 'stroke') this.viewer.showCamera(step.camera, 0.7);
    this.refresh();
    const id = step.action === 'add_modifier' ? `modifier.${step.id.split('.')[1]}`
      : step.action === 'set_mode' ? this.ui.sculpt.modeMenu.id
        : step.after ? controlOf(step, this.ui) : step.id;
    if (step.action !== 'stroke' && id) this.editor.element(id)?.classList.add('is-solved');
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
    this.headerMenu.interactive = false;
    this.editor.renaming = null;
    this.viewer.clearOverlay();
    const to = applyStep(this.live, step, this.ui);
    await animateStep({
      step, to, from: this.live, editor: this.editor, menu: this.menu, modeMenu: this.modeMenu, headerMenu: this.headerMenu,
      keys: this.keys, cursor: this.cursor, viewer: this.viewer, geometries: this.geometries,
      render: state => {
        this.editor.render(state, { ...this.editor.options, interactive: new Set(), enabled: new Set() });
        if (this.scene) showState(this.viewer, this.geometries, state);
      },
    });
    this.menu.interactive = true;
    this.modeMenu.interactive = true;
    this.headerMenu.interactive = this.scene;
    this.cursor.hide();
    this.busy = false;
    this.succeed(true);
  }

  restart() {
    if (this.busy) return;
    this.solved = 0;
    this.helps = 0;
    this.prepared = null;
    this.knifeDone = 0;
    this.editor.renaming = null;
    this.live = stateAt(this.timeline, this.ui, -1);
    saveLessonProgress(this.key, { solved: 0, helps: 0, completed: false });
    this.bar.showClue('');
    this.viewer.showCamera(this.live.camera, 0.5);
    this.refresh();
  }
}
