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
    const anchor = this.anchor.getBoundingClientRect();
    // Stay inside the visible area: Android system bars and the lesson bar must not cover the menu.
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

  element(id) {
    return this.layer.querySelector(`[data-control="${id}"]`);
  }

  close() {
    this.layer.replaceChildren();
    this.layer.classList.remove('open');
  }
}
