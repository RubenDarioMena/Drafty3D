// Blender's real "Add Modifier" menu (read from Blender 5.3), shown as a drill-down for touch screens.
export class AddModifierMenu {
  constructor(layer, ui) {
    this.layer = layer;
    this.ui = ui.addModifierMenu;
    this.enabledTypes = new Set();
    this.interactive = false;
    this.onPick = () => {};
    layer.addEventListener('pointerdown', event => {
      if (this.interactive && event.target === layer) this.close();
    });
  }

  categoryOf(itemId) {
    return this.ui.categories.find(category => category.items.some(item => item.id === itemId));
  }

  open(anchor) {
    this.anchor = anchor;
    this.show(null);
  }

  openCategory(categoryId) {
    this.show(this.ui.categories.find(category => category.id === categoryId));
  }

  show(category) {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    const title = document.createElement('h4');
    title.textContent = category ? `${this.ui.label} › ${category.label}` : this.ui.label;
    menu.append(title);
    const entries = category ? category.items : this.ui.categories;
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.control = entry.id;
      button.setAttribute('role', 'menuitem');
      if (category) {
        button.textContent = entry.label;
        button.disabled = !(this.interactive && entry.type && this.enabledTypes.has(entry.type));
        button.addEventListener('click', () => {
          this.close();
          this.onPick(entry.type);
        });
      } else {
        button.innerHTML = `<span></span><span aria-hidden="true">▸</span>`;
        button.firstChild.textContent = entry.label;
        button.disabled = !this.interactive;
        button.addEventListener('click', () => this.openCategory(entry.id));
      }
      menu.append(button);
    }
    this.layer.replaceChildren(menu);
    this.layer.classList.toggle('open', this.interactive);
    this.place(menu);
  }

  place(menu) {
    placeMenu(menu, this.anchor);
  }

  element(id) {
    return this.layer.querySelector(`[data-control="${id}"]`);
  }

  close() {
    this.layer.replaceChildren();
    this.layer.classList.remove('open');
  }
}

/** Opens a menu next to its button without letting Android's system bars or the lesson bar cover it. */
export function placeMenu(menu, anchorNode) {
  const anchor = anchorNode.getBoundingClientRect();
  const bounds = document.getElementById('app').getBoundingClientRect();
  const style = getComputedStyle(document.getElementById('app'));
  const bottom = Math.min(window.visualViewport?.height ?? window.innerHeight, bounds.bottom - parseFloat(style.paddingBottom || 0)) - 8;
  const top = bounds.top + parseFloat(style.paddingTop || 0) + 8;
  const width = Math.min(260, window.innerWidth - 16);
  menu.style.width = `${width}px`;
  menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  const below = bottom - anchor.bottom - 4;
  const above = anchor.top - top - 4;
  const height = menu.offsetHeight;
  if (height <= below || below >= above) {
    menu.style.top = `${anchor.bottom + 4}px`;
    menu.style.maxHeight = `${below}px`;
  } else {
    const shown = Math.min(height, above);
    menu.style.top = `${anchor.top - 4 - shown}px`;
    menu.style.maxHeight = `${above}px`;
  }
}

/** The 3D Viewport's mode menu (Object Mode, Sculpt Mode…), as Blender 5.3 lists it for a mesh. */
export class ModeMenu {
  constructor(layer, ui) {
    this.layer = layer;
    this.ui = ui.sculpt?.modeMenu;
    this.interactive = false;
    this.onPick = () => {};
    layer.addEventListener('pointerdown', event => {
      if (this.interactive && this.isOpen && event.target === layer) this.close();
    });
  }

  open(anchor, current) {
    this.anchor = anchor;
    this.isOpen = true;
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    const title = document.createElement('h4');
    title.textContent = 'Mode';
    menu.append(title);
    for (const item of this.ui.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.control = item.id;
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(item.value === current));
      button.textContent = item.label;
      button.disabled = !this.interactive;
      button.addEventListener('click', () => {
        this.close();
        this.onPick(item.value);
      });
      menu.append(button);
    }
    this.layer.replaceChildren(menu);
    this.layer.classList.toggle('open', this.interactive);
    placeMenu(menu, anchor);
  }

  element(id) {
    return this.layer.querySelector(`[data-control="${id}"]`);
  }

  close() {
    this.isOpen = false;
    this.layer.replaceChildren();
    this.layer.classList.remove('open');
  }
}
