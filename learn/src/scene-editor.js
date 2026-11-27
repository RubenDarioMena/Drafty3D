import { formatValue } from './format.js';
import { PropertiesEditor } from './panel.js';
import { objectVisible, outlinerTree } from './state.js';

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

const EYE = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8 12.1 12.2 8 12.2 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>';
const EYE_CLOSED = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 7.5s2.3 3 6 3 6-3 6-3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 9.6l-1.2 1.6M8 10.6v1.9M12 9.6l1.2 1.6" stroke="currentColor" stroke-width="1.2"/></svg>';
const PROPORTIONAL = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/></svg>';
const SELECT_ICONS = {
  VERT: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-opacity=".5"/><rect x="10.5" y="10.5" width="4" height="4" fill="currentColor"/></svg>',
  EDGE: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" stroke-opacity=".5"/><path d="M2.5 13.5h11" stroke="currentColor" stroke-width="2.4"/></svg>',
  FACE: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" fill="currentColor" fill-opacity=".85" stroke="currentColor"/></svg>',
};

/**
 * The 3D Viewport's header (mode, select mode, menus, Proportional Editing), Blender's Adjust Last
 * Operation panel and the Outliner, for the Level 1 and 2 lessons. Shares number fields with the
 * Properties editor. Every label, field and menu comes from Blender 5.3; the state from the timeline.
 */
export class SceneEditor extends PropertiesEditor {
  constructor(root, ui) {
    super(root, root, ui);
    this.root = root;
    this.view3d = ui.view3d;
    this.modeMenuUi = ui.sculpt.modeMenu;
    this.modeLabel = document.getElementById('viewport-mode');
    this.objectLabel = document.getElementById('object-name');
  }

  element(id) {
    return this.root.querySelector(`[data-control="${CSS.escape(id)}"]`);
  }

  /** Outliner rows and eyes have ids of their own: outliner.row.<name>, outliner.hide.<name>. */
  rowOf(name) {
    return this.element(`outliner.row.${name}`);
  }

  currentValue(id) {
    return this.state?.redo?.values?.[id];
  }

  field(id) {
    const operator = this.view3d.operators[this.state?.redo?.operator];
    return operator?.sections.flatMap(section => section.fields).find(field => field.id === id);
  }

  showValue(id, value) {
    const field = this.field(id);
    const text = this.element(id)?.querySelector('.value');
    if (field && text) text.textContent = formatValue(field, value);
  }

  render(state, options) {
    this.state = state;
    this.options = options;
    const scroll = this.root.querySelector('.scene-body')?.scrollTop ?? 0;
    const modeItem = this.modeMenuUi.items.find(item => item.value === state.mode);
    if (this.modeLabel) this.modeLabel.textContent = modeItem?.label ?? state.mode;
    if (this.objectLabel) this.objectLabel.textContent = state.scene.active ?? '';
    const body = el('div', 'scene-body');
    if (state.redo) body.append(this.renderHud(state.redo));
    body.append(this.renderOutliner(state.scene));
    this.root.replaceChildren(this.renderHeader(state), body);
    body.scrollTop = scroll;
  }

  enabled(kind) {
    return Boolean(this.options.enabled?.has(kind));
  }

  renderHeader(state) {
    const header = el('div', 'tool-header scene-header');
    const mode = button('dropdown mode', '', this.modeMenuUi.id);
    mode.append(el('span', '', this.modeMenuUi.items.find(item => item.value === state.mode)?.label ?? state.mode), el('span', 'caret', '▾'));
    mode.disabled = !this.options.onModeMenu;
    if (this.options.onModeMenu) mode.addEventListener('click', () => this.options.onModeMenu(mode));
    header.append(mode);

    if (state.mode === 'EDIT') {
      const group = el('div', 'segmented select-modes');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Select mode');
      for (const item of this.view3d.selectModes) {
        const on = state.selectMode?.includes(item.value);
        const option = button(on ? 'on' : '', '', item.id);
        option.innerHTML = SELECT_ICONS[item.value];
        option.title = `${item.label} (${item.shortcut.keys.join(' ')})`;
        option.setAttribute('aria-label', item.label);
        option.setAttribute('aria-pressed', String(Boolean(on)));
        option.disabled = !this.enabled('selectMode');
        option.addEventListener('click', () => this.options.onSelectMode?.(item.value));
        group.append(option);
      }
      header.append(group);
    }

    const menus = el('div', 'header-menus');
    for (const entry of this.view3d.header[state.mode] ?? []) {
      const menu = button('header-menu-button', entry.label, entry.id);
      menu.disabled = !this.options.onHeaderMenu;
      menu.addEventListener('click', () => this.options.onHeaderMenu?.(menu, entry.id));
      menus.append(menu);
    }
    header.append(menus);

    const proportional = this.view3d.proportional;
    const toggle = button(`icon-toggle${state.proportional ? ' on' : ''}`, '', proportional.id);
    toggle.innerHTML = PROPORTIONAL;
    toggle.title = `${proportional.label} (${proportional.shortcut.keys.join(' ')})`;
    toggle.setAttribute('aria-label', proportional.label);
    toggle.setAttribute('aria-pressed', String(Boolean(state.proportional)));
    toggle.disabled = !this.enabled('proportional');
    toggle.addEventListener('click', () => this.options.onProportional?.(!state.proportional));
    header.append(toggle);
    return header;
  }

  /** Blender's floating Adjust Last Operation panel: the last operator's fields, as its redo panel draws them. */
  renderHud(redo) {
    const operator = this.view3d.operators[redo.operator];
    const panel = el('section', 'hud');
    panel.dataset.control = 'hud';
    panel.setAttribute('aria-label', this.view3d.hud.label);
    const head = el('header', 'hud-head');
    head.append(el('span', 'chevron', '▾'), el('span', 'hud-title', operator?.label ?? redo.operator));
    panel.append(head);
    const body = el('div', 'hud-body');
    for (const section of operator?.sections ?? []) {
      const fields = section.fields.filter(field => field.id in redo.values && this.shown(field, redo.values));
      if (!fields.length) continue;
      this.renderFields(body, fields, { values: redo.values });
    }
    panel.append(body);
    return panel;
  }

  /** Fields Blender draws only with another option on (Proportional Size) or for one enum value (Bevel's Width). */
  shown(field, values) {
    if (field.shownWith) return Boolean(values[field.id.replace(/[^.]+$/, field.shownWith)]);
    if (field.shownWhen) return field.shownWhen.values.includes(values[field.shownWhen.field]);
    return true;
  }

  renderOutliner(scene) {
    const panel = el('section', 'outliner');
    panel.setAttribute('aria-label', 'Outliner');
    panel.append(el('h3', 'outliner-title', 'Outliner'));
    const list = el('ul', 'outliner-tree');
    list.setAttribute('role', 'tree');
    const tree = outlinerTree(scene);
    list.append(this.renderRow({ name: this.view3d.outliner.root, kind: 'scene', depth: 0 }));
    const walk = (node, depth) => {
      for (const collection of node.collections) {
        list.append(this.renderRow({ name: collection.name, kind: 'collection', depth, hidden: collection.hidden }));
        walk(collection, depth + 1);
      }
      for (const name of node.objects) {
        const object = scene.objects.find(candidate => candidate.name === name);
        list.append(this.renderRow({
          name, kind: 'object', depth, hidden: object.hidden, dimmed: !objectVisible(scene, name),
          selected: scene.selected.includes(name), active: scene.active === name,
        }));
      }
    };
    walk(tree, 1);
    panel.append(list);
    return panel;
  }

  renderRow({ name, kind, depth, hidden, dimmed, selected, active }) {
    const row = el('li', `outliner-row ${kind}${selected ? ' selected' : ''}${active ? ' active' : ''}${dimmed ? ' dimmed' : ''}`);
    row.setAttribute('role', 'treeitem');
    row.style.setProperty('--depth', depth);
    const icon = el('span', `outliner-icon ${kind}`);
    icon.setAttribute('aria-hidden', 'true');
    if (kind === 'scene') {
      row.append(icon, el('span', 'outliner-name', name));
      return row;
    }
    const pick = this.options.onOutlinerSelect && kind === 'object';
    const label = el(pick ? 'button' : 'span', 'outliner-name', name);
    label.dataset.control = `outliner.row.${name}`;
    if (pick) {
      label.type = 'button';
      label.addEventListener('click', () => this.options.onOutlinerSelect(name));
      label.addEventListener('dblclick', () => this.options.onRename?.(name, label));
    }
    if (this.renaming === name) {
      const input = document.createElement('input');
      input.className = 'outliner-rename';
      input.value = this.renameText ?? name;
      input.dataset.control = `outliner.row.${name}`;
      input.setAttribute('aria-label', `Rename ${name}`);
      row.append(icon, input);
      if (this.options.onRenameDone) {
        input.addEventListener('keydown', event => {
          if (event.key === 'Enter') this.options.onRenameDone(name, input.value.trim());
          if (event.key === 'Escape') this.options.onRenameDone(name, null);
        });
        input.addEventListener('blur', () => this.options.onRenameDone?.(name, input.value.trim()));
        queueMicrotask(() => { input.focus(); input.select(); });
      }
    } else {
      row.append(icon, label);
    }
    const eye = button(`outliner-eye${hidden ? ' off' : ''}`, '', `outliner.hide.${name}`);
    eye.innerHTML = hidden ? EYE_CLOSED : EYE;
    eye.title = `${this.view3d.outliner.hide.label}: ${this.view3d.outliner.hide.description}`;
    eye.setAttribute('aria-label', `${this.view3d.outliner.hide.label}: ${name}`);
    eye.setAttribute('aria-pressed', String(Boolean(hidden)));
    eye.disabled = !this.options.onOutlinerHide;
    eye.addEventListener('click', () => this.options.onOutlinerHide?.(name, !hidden));
    row.append(eye);
    return row;
  }
}
