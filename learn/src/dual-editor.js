/**
 * A sculpt lesson with modifier steps (Multires). Blender's Sculpting workspace shows the Properties
 * editor beside the 3D Viewport; a phone has room for one panel, so the lesson shows the editor the
 * step at hand uses: the Properties editor for modifier steps, the tool header and brushes otherwise.
 * Both editors render the same lesson state; this object speaks for them to Watch, Your turn and Show me.
 */
export class DualEditor {
  constructor(properties, sculpt, view) {
    this.properties = properties;
    this.sculpt = sculpt;
    this.view = view;
  }

  /** Shows the editor a step uses (data-module switches the layout, as for a lesson of that module). */
  focus(step) {
    this.view.dataset.module = step && (step.modifier || step.action === 'select_panel') ? 'modifiers' : 'sculpt';
  }

  get state() { return this.sculpt.state; }
  get options() { return this.sculpt.options; }
  get openList() { return this.sculpt.openList ?? this.properties.openList; }
  set openList(id) {
    this.sculpt.openList = id;
    this.properties.openList = id;
  }
  set objects(names) { this.properties.objects = names; }

  render(state, options) {
    this.properties.render(state, options);
    this.sculpt.render(state, options);
  }

  owner(id) { return id.startsWith('sculpt.') ? this.sculpt : this.properties; }
  element(id) { return this.sculpt.element(id) ?? this.properties.element(id); }
  currentValue(id) { return this.owner(id).currentValue(id); }
  showValue(id, value) { this.owner(id).showValue(id, value); }
  field(id) { return this.sculpt.field(id); }
  popoverOf(id) { return this.sculpt.popoverOf(id); }
  reveal(id) { return this.sculpt.reveal(id); }
}
