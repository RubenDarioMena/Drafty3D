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
    const { fields } = definition;
    this.renderFields(body, fields.filter(field => field.subpanel === undefined), modifier);
    definition.subpanels.forEach((subpanel, index) => body.append(this.renderSubpanel(subpanel, index, fields, modifier)));
    card.append(head, body);
    return card;
  }

  /** Fields in panel order; consecutive fields sharing a `row` heading sit on one line, as Blender draws them. */
  renderFields(parent, fields, modifier) {
    for (let i = 0; i < fields.length;) {
      const field = fields[i];
      if (!field.row) {
        parent.append(this.renderField(field, modifier.values[field.id]));
        i += 1;
        continue;
      }
      const group = [];
      while (i < fields.length && fields[i].row === field.row) group.push(fields[i++]);
      parent.append(this.renderRow(field.row, group, modifier));
    }
  }

  renderRow(heading, group, modifier) {
    const interactive = group.some(field => this.options.interactive.has(field.id));
    const row = el('div', 'field');
    row.classList.toggle('disabled', !interactive && !this.options.showAllEnabled);
    let control;
    if (group.every(field => field.display === 'toggle')) {
      // Mirror's Axis X Y Z: joined toggle buttons, several may be on at once.
      control = el('div', `enum-row${interactive ? ' interactive' : ''}`);
      for (const field of group) control.append(this.renderToggle(field, modifier.values[field.id]));
    } else {
      control = el('div', 'row-controls');
      for (const field of group) control.append(this.renderControl(field, modifier.values[field.id], this.options.interactive.has(field.id)));
    }
    row.append(el('span', 'label', heading), control);
    return row;
  }

  renderToggle(field, value) {
    const interactive = this.options.interactive.has(field.id);
    const toggle = el(interactive ? 'button' : 'span', value ? 'on' : '', field.label);
    toggle.dataset.control = field.id;
    if (interactive) {
      toggle.type = 'button';
      toggle.setAttribute('aria-pressed', String(Boolean(value)));
      toggle.setAttribute('aria-label', `${field.row} ${field.label}`);
      toggle.addEventListener('click', () => this.options.onValue(field.id, !value));
    }
    return toggle;
  }

  /** A subpanel header (with its checkbox, if Blender draws one); its body only when Blender opens it by default. */
  renderSubpanel(subpanel, index, fields, modifier) {
    const box = el('div', `subpanel${subpanel.open ? ' open' : ''}`);
    const head = el('div', 'subpanel-head');
    const header = subpanel.header && fields.find(field => field.id === subpanel.header);
    head.append(header ? this.renderCheck(header, modifier.values[header.id], this.options.interactive.has(header.id)) : subpanel.label);
    box.append(head);
    if (subpanel.open) {
      const body = el('div', 'subpanel-body');
      this.renderFields(body, fields.filter(field => field.subpanel === index && field.id !== subpanel.header), modifier);
      box.append(body);
    }
    return box;
  }

  renderField(field, value) {
    const interactive = this.options.interactive.has(field.id);
    const row = el('div', 'field');
    row.classList.toggle('disabled', !interactive && !this.options.showAllEnabled);
    const label = el('span', 'label', field.kind === 'bool' ? (field.heading || '') : field.label);
    if (field.kind === 'enum' && field.display === 'expand' && !field.labelled && !field.id.endsWith('limit_method')) {
      label.textContent = '';
    }
    row.append(label, this.renderControl(field, value, interactive));
    return row;
  }

  renderControl(field, value, interactive) {
    let control;
    if (field.kind === 'enum' && field.display === 'expand') {
      control = el('div', `enum-row${interactive ? ' interactive' : ''}`);
      for (const item of field.items) {
        // Buttons only where the lesson lets the learner choose; elsewhere the row is just shown.
        const option = el(interactive ? 'button' : 'span', item.value === value ? 'on' : '', item.label);
        option.dataset.control = `${field.id}.${item.value.toLowerCase()}`;
        if (interactive) {
          option.type = 'button';
          option.setAttribute('aria-pressed', String(item.value === value));
          option.addEventListener('click', () => this.options.onValue(field.id, item.value));
        }
        control.append(option);
      }
    } else if (field.kind === 'enum') {
      control = el('div', 'dropdown');
      control.append(field.items.find(item => item.value === value)?.label ?? value, el('span', '', '▾'));
    } else if (field.kind === 'pointer') {
      control = el('div', 'dropdown pointer');
      control.append(el('span', 'object-icon', '▣'), el('span', '', ''));
    } else if (field.kind === 'bool') {
      return this.renderCheck(field, value, interactive);
    } else {
      control = this.renderNumber(field, value, interactive);
    }
    control.dataset.control = field.id;
    return control;
  }

  renderCheck(field, value, interactive) {
    const control = el(interactive ? 'button' : 'div', `check${interactive ? ' interactive' : ''}`);
    control.append(el('span', `box${value ? ' on' : ''}`, value ? '✓' : ''), field.label);
    control.dataset.control = field.id;
    if (interactive) {
      control.type = 'button';
      control.setAttribute('aria-pressed', String(Boolean(value)));
      control.setAttribute('aria-label', field.title ?? (field.label || field.row || field.heading));
      control.addEventListener('click', () => this.options.onValue(field.id, !value));
    }
    return control;
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
    const name = field.title ?? field.label;
    minus.setAttribute('aria-label', `Decrease ${name}`);
    plus.setAttribute('aria-label', `Increase ${name}`);
    control.append(minus, text, plus);
    control.setAttribute('aria-label', `${name} ${formatValue(field, value)}`);
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
    input.setAttribute('aria-label', field.title ?? field.label);
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
