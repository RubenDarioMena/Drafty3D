import { formatValue } from './format.js';
import { PropertiesEditor } from './panel.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, id) {
  const node = el('button', className, text);
  node.type = 'button';
  if (id) node.dataset.control = id;
  return node;
}

// Group colors follow Blender's brush icons loosely: our own flat dots, not Blender's artwork.
const GROUP_COLORS = { 'Add & Subtract': '#e8a33c', Contrast: '#5ba3e0', Transform: '#9b7be0', Utilities: '#8a8a8a' };
const TAB_COLORS = { Paint: '#d9667a', Simulation: '#4fb3a1' };

/**
 * Sculpt Mode's controls as Blender 5.3 lays them out: the 3D Viewport tool header
 * (mode, brush, Size, Strength, direction, symmetry) and the brush asset shelf below it.
 * Shares the number fields (◀ ▶, drag, tap to type) with the Properties editor.
 */
export class SculptEditor extends PropertiesEditor {
  constructor(root, ui) {
    super(root, root, ui);
    this.root = root;
    this.sculpt = ui.sculpt;
    this.tab = 'All';
    this.modeLabel = document.getElementById('viewport-mode');
  }

  element(id) {
    return this.root.querySelector(`[data-control="${id}"]`);
  }

  currentValue(id) {
    const field = id.startsWith('sculpt.') ? id.slice('sculpt.'.length) : null;
    return field ? this.state?.tool?.[field] : undefined;
  }

  field(id) {
    const { size, strength } = this.sculpt.header;
    return [size, strength].find(field => field.id === id);
  }

  showValue(id, value) {
    const field = this.field(id);
    const text = this.element(id)?.querySelector('.value');
    if (field && text) text.textContent = formatValue(field, value);
  }

  render(state, options) {
    this.state = state;
    this.options = options;
    const shelfScroll = this.root.querySelector('.shelf-items')?.scrollTop ?? 0;
    const modeItem = this.sculpt.modeMenu.items.find(item => item.value === state.mode);
    if (this.modeLabel) this.modeLabel.textContent = modeItem?.label ?? state.mode;
    this.root.replaceChildren(this.renderHeader(state), this.renderShelf(state));
    const items = this.root.querySelector('.shelf-items');
    if (items) items.scrollTop = shelfScroll;
  }

  enabled(kind) {
    return Boolean(this.options.enabled?.has(kind));
  }

  renderHeader(state) {
    const header = el('div', 'tool-header');
    const mode = button('dropdown mode', '', this.sculpt.modeMenu.id);
    mode.append(el('span', '', this.sculpt.modeMenu.items.find(item => item.value === state.mode)?.label ?? state.mode), el('span', 'caret', '▾'));
    mode.disabled = !this.options.onModeMenu;
    if (this.options.onModeMenu) mode.addEventListener('click', () => this.options.onModeMenu(mode));
    header.append(mode);
    const tool = state.mode === 'SCULPT' ? state.tool : null;
    if (!tool) {
      header.append(el('span', 'header-note', 'View · Select · Add · Object'));
      return header;
    }

    const brush = el('div', 'brush-name');
    brush.dataset.control = this.sculpt.header.brush.id;
    brush.append(el('span', 'dot'), tool.brush);
    brush.firstChild.style.background = this.colorOf(tool.brush);

    const { size, strength } = this.sculpt.header;
    const numbers = el('div', 'tool-numbers');
    for (const field of [size, strength]) {
      const key = field.id.slice('sculpt.'.length);
      const row = el('div', 'tool-field');
      row.append(el('span', 'label', field.label));
      const control = this.renderNumber(field, tool[key], this.options.interactive.has(field.id));
      control.dataset.control = field.id;
      row.append(control);
      numbers.append(row);
    }

    const toggles = el('div', 'tool-toggles');
    if (tool.direction === 'ADD' || tool.direction === 'SUBTRACT') {
      const group = el('div', 'segmented');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Direction');
      for (const item of this.sculpt.header.direction.items) {
        const option = button(tool.direction === item.value ? 'on' : '', item.value === 'ADD' ? '+' : '−', item.id);
        option.setAttribute('aria-label', item.label);
        option.setAttribute('aria-pressed', String(tool.direction === item.value));
        option.disabled = !this.enabled('direction');
        option.addEventListener('click', () => this.options.onDirection?.(item.value));
        group.append(option);
      }
      toggles.append(group);
    }
    const symmetry = el('div', 'segmented symmetry');
    symmetry.setAttribute('role', 'group');
    symmetry.setAttribute('aria-label', 'Mirror');
    symmetry.append(el('span', 'mirror-icon', '⋈'));
    symmetry.lastChild.setAttribute('aria-hidden', 'true');
    for (const item of this.sculpt.header.symmetry.items) {
      const on = tool.symmetry.includes(item.axis);
      const option = button(on ? 'on' : '', item.label, item.id);
      option.setAttribute('aria-label', `Mirror ${item.axis}`);
      option.setAttribute('aria-pressed', String(on));
      option.disabled = !this.enabled('symmetry');
      option.addEventListener('click', () => this.options.onSymmetry?.(item.axis));
      symmetry.append(option);
    }
    toggles.append(symmetry);
    header.append(brush, numbers, toggles);
    return header;
  }

  colorOf(name) {
    const brush = this.sculpt.shelf.brushes.find(candidate => candidate.name === name);
    return GROUP_COLORS[brush?.group] ?? TAB_COLORS[brush?.tab] ?? '#999';
  }

  renderShelf(state) {
    const shelf = el('section', 'shelf');
    shelf.dataset.control = this.sculpt.shelf.id;
    shelf.setAttribute('aria-label', 'Brushes');
    if (state.mode !== 'SCULPT') {
      shelf.classList.add('empty');
      shelf.append(el('p', 'shelf-note', 'The brush asset shelf appears in Sculpt Mode.'));
      return shelf;
    }
    const tabs = el('nav', 'shelf-tabs');
    for (const tab of this.sculpt.shelf.tabs) {
      const node = button(tab === this.tab ? 'on' : '', tab, `sculpt.shelf.${tab.toLowerCase()}`);
      node.setAttribute('aria-pressed', String(tab === this.tab));
      node.addEventListener('click', () => {
        this.tab = tab;
        this.render(this.state, this.options);
      });
      tabs.append(node);
    }
    const items = el('div', 'shelf-items');
    const shown = this.sculpt.shelf.brushes.filter(brush => this.tab === 'All' || brush.tab === this.tab);
    const pickable = this.enabled('brush');
    for (const brush of shown) {
      const item = button(`brush${brush.name === state.tool?.brush ? ' active' : ''}`, '', brush.id);
      const dot = el('span', 'dot');
      dot.style.background = GROUP_COLORS[brush.group] ?? TAB_COLORS[brush.tab] ?? '#999';
      item.append(dot, el('span', 'name', brush.name));
      item.title = brush.shortcut ? `${brush.name} (${brush.shortcut.keys.join(' ')})` : brush.name;
      item.setAttribute('aria-pressed', String(brush.name === state.tool?.brush));
      item.disabled = !pickable;
      item.addEventListener('click', () => this.options.onBrush?.(brush.name));
      items.append(item);
    }
    shelf.append(tabs, items);
    return shelf;
  }

  /** Shows the shelf tab holding a brush (the lesson cursor may need to find it). */
  reveal(id) {
    const brush = this.sculpt.shelf.brushes.find(candidate => candidate.id === id);
    if (brush && this.tab !== 'All' && brush.tab !== this.tab) {
      this.tab = 'All';
      this.render(this.state, this.options);
    }
    return this.element(id);
  }
}
