import { formatValue, roundToStep } from './format.js';
import { modifierIcon, tabIcon } from './icons.js';

const DRAG_PIXELS_PER_STEP = 14;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Skeleton of Blender's Properties editor: tab column plus the Object and Modifiers tabs. */
export class PropertiesEditor {
  constructor(tabs, panel, ui) {
    this.tabs = tabs;
    this.panel = panel;
    this.ui = ui;
  }

  element(id) {
    return this.tabs.querySelector(`[data-control="${id}"]`) || this.panel.querySelector(`[data-control="${id}"]`);
  }

  currentValue(id) {
    return this.state?.modifiers.find(modifier => id in modifier.values)?.values[id];
  }

  render(state, options) {
    this.state = state;
    this.options = options;
    this.renderTabs(state);
    const scroll = this.panel.scrollTop;
    this.panel.replaceChildren();
    if (state.panel === 'panel.properties.modifier') this.renderModifiers(state);
    else this.renderObject(state);
    this.panel.scrollTop = scroll;
  }

  renderTabs(state) {
    const { enabledTabs, onTab } = this.options;
    this.tabs.replaceChildren(...this.ui.propertiesTabs.map(tab => {
      if (tab.separator) return el('span', 'sep');
      const button = el('button', 'tab');
      button.type = 'button';
      button.dataset.control = tab.id;
      button.title = tab.label;
      button.setAttribute('aria-label', tab.label);
      button.innerHTML = tabIcon(tab.identifier);
      button.disabled = !enabledTabs.has(tab.id);
      button.classList.toggle('active', state.panel === tab.id);
      button.setAttribute('aria-pressed', String(state.panel === tab.id));
      if (onTab) button.addEventListener('click', () => onTab(tab.id));
      return button;
    }));
  }

  renderObject() {
    const head = el('div', 'object-head');
    head.innerHTML = tabIcon('OBJECT');
    head.firstChild.setAttribute('width', '16');
    head.append(this.options.objectName);
    this.panel.append(head);
    for (const label of this.ui.objectPanels || []) this.panel.append(el('div', 'subpanel', label));
  }

  renderModifiers(state) {
    const add = el('button', 'add-modifier');
    add.type = 'button';
    add.dataset.control = this.ui.addModifierMenu.id;
    add.innerHTML = '<span class="plus" aria-hidden="true">+</span>';
    add.append(this.ui.addModifierMenu.label);
    add.disabled = !this.options.onAddMenu;
    if (this.options.onAddMenu) add.addEventListener('click', () => this.options.onAddMenu(add));
    this.panel.append(add);
    for (const modifier of state.modifiers) this.panel.append(this.renderModifier(modifier));
  }

  renderModifier(modifier) {
    const definition = this.ui.modifiers[modifier.type];
    const card = el('section', 'modifier');
    card.dataset.control = `modifier.${definition.short}`;
    const head = el('header', 'modifier-head');
    head.append(el('span', 'chevron', '▾'));
    head.insertAdjacentHTML('beforeend', modifierIcon(modifier.type));
    head.append(el('span', 'name', modifier.name), el('span', 'toggles', '▣◉✕'));
    head.lastChild.setAttribute('aria-hidden', 'true');
    const body = el('div', 'modifier-body');
    for (const field of definition.fields) body.append(this.renderField(field, modifier.values[field.id]));
    for (const label of definition.subpanels) body.append(el('div', 'subpanel', label));
    card.append(head, body);
    return card;
  }

  renderField(field, value) {
    const interactive = this.options.interactive.has(field.id);
    const row = el('div', 'field');
    row.classList.toggle('disabled', !interactive && !this.options.showAllEnabled);
    const label = el('span', 'label', field.kind === 'bool' ? (field.heading || '') : field.label);
    if (field.kind === 'enum' && field.display === 'expand' && !['limit_method'].some(id => field.id.endsWith(id))) {
      label.textContent = '';
    }
    let control;
    if (field.kind === 'enum' && field.display === 'expand') {
      control = el('div', 'enum-row');
      for (const item of field.items) {
        const option = el('span', item.value === value ? 'on' : '', item.label);
        control.append(option);
      }
    } else if (field.kind === 'enum') {
      control = el('div', 'dropdown');
      control.append(field.items.find(item => item.value === value)?.label ?? value, el('span', '', '▾'));
    } else if (field.kind === 'bool') {
      control = el('div', 'check');
      control.append(el('span', `box${value ? ' on' : ''}`, value ? '✓' : ''), field.label);
    } else {
      control = this.renderNumber(field, value, interactive);
    }
    control.dataset.control = field.id;
    row.append(label, control);
    return row;
  }

  renderNumber(field, value, interactive) {
    const control = el('div', `number${interactive ? ' interactive' : ''}`);
    const step = this.options.steps[field.id] ?? (field.kind === 'int' ? 1 : 0.01);
    const minus = el('button', '', '◀');
    const plus = el('button', '', '▶');
    const text = el('span', 'value', formatValue(field, value));
    for (const button of [minus, plus]) {
      button.type = 'button';
      button.tabIndex = interactive ? 0 : -1;
      button.disabled = !interactive;
    }
    minus.setAttribute('aria-label', `Decrease ${field.label}`);
    plus.setAttribute('aria-label', `Increase ${field.label}`);
    control.append(minus, text, plus);
    control.setAttribute('aria-label', `${field.label} ${formatValue(field, value)}`);
    if (!interactive) return control;

    const clamp = candidate => Math.min(field.softMax, Math.max(field.softMin, roundToStep(candidate, step)));
    const commit = candidate => this.options.onValue(field.id, clamp(candidate));
    minus.addEventListener('click', () => commit(value - step));
    plus.addEventListener('click', () => commit(value + step));

    let drag = null;
    text.addEventListener('pointerdown', event => {
      drag = { x: event.clientX, preview: value, moved: false };
      text.setPointerCapture(event.pointerId);
    });
    text.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (Math.abs(dx) >= 6) drag.moved = true;
      drag.preview = clamp(value + Math.round(dx / DRAG_PIXELS_PER_STEP) * step);
      text.textContent = formatValue(field, drag.preview);
    });
    text.addEventListener('pointerup', () => {
      if (!drag) return;
      const { moved, preview } = drag;
      drag = null;
      if (moved) commit(preview);
      else this.editNumber(text, field, value, step, commit);
    });
    text.addEventListener('pointercancel', () => {
      drag = null;
      text.textContent = formatValue(field, value);
    });
    return control;
  }

  editNumber(text, field, value, step, commit) {
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = field.kind === 'int' ? 'numeric' : 'decimal';
    input.step = String(step);
    input.value = String(value);
    input.className = 'value';
    input.setAttribute('aria-label', field.label);
    input.style.cssText = 'width:100%;height:24px;border:0;background:#2a2a2a;text-align:center;border-radius:3px';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const parsed = Number.parseFloat(input.value.replace(',', '.'));
      if (Number.isFinite(parsed)) commit(parsed);
      else input.replaceWith(text);
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') finish();
      if (event.key === 'Escape') { done = true; input.replaceWith(text); }
    });
    input.addEventListener('blur', finish);
    text.replaceWith(input);
    input.focus();
    input.select();
  }

  /** Shows an intermediate value while the lesson cursor drags a field. */
  showValue(id, value) {
    const field = Object.values(this.ui.modifiers).flatMap(definition => definition.fields).find(candidate => candidate.id === id);
    const text = this.element(id)?.querySelector('.value');
    if (field && text) text.textContent = formatValue(field, value);
  }
}
