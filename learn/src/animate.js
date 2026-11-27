import { gsap } from 'gsap';
import { wait } from './cursor.js';

/**
 * Plays one recorded step on the UI: the cursor flies to each control by its
 * semantic id, taps it, and the panel ends in Blender's recorded state `to`.
 * Used by Watch mode and by the "Show me" help of Your turn.
 */
export async function animateStep({ step, to, editor, menu, modeMenu, cursor, render, viewer, geometries, from, scale = 1 }) {
  const fly = 0.55 * scale;
  if (step.action === 'set_mode') {
    const button = editor.element(modeMenu.ui.id);
    await cursor.moveTo(button, fly);
    await cursor.tap();
    modeMenu.open(button, from?.mode);
    await wait(0.25 * scale);
    const item = modeMenu.element(step.id);
    item?.classList.add('active');
    await cursor.moveTo(item, fly * 0.8);
    await cursor.tap();
    modeMenu.close();
    render(to);
    return editor.element(modeMenu.ui.id);
  }

  if (step.action === 'select_brush') {
    const item = editor.reveal(step.id);
    await cursor.moveTo(item, fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'set_direction' || step.action === 'set_symmetry') {
    await cursor.moveTo(editor.element(step.id), fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'stroke') {
    await playStroke({ step, viewer, cursor, geometries, from, scale });
    render(to);
    return null;
  }

  if (step.action === 'toggle_modifier' || step.action === 'multires_subdivide') {
    await cursor.moveTo(editor.element(step.id), fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  // Move to First / Apply live in the header's arrow menu: open it, then pick the item.
  if (step.action === 'move_modifier' || step.action === 'apply_modifier') {
    const menuId = `modifier.${step.id.split('.')[1]}.menu`;
    await cursor.moveTo(editor.element(menuId), fly);
    await cursor.tap();
    editor.openList = menuId;
    editor.render(editor.state, editor.options);
    await wait(0.25 * scale);
    const item = editor.element(step.id);
    item?.classList.add('on');
    await cursor.moveTo(item, fly * 0.8);
    await cursor.tap();
    editor.openList = null;
    render(to);
    const card = editor.element(`modifier.${step.id.split('.')[1]}`);
    card?.scrollIntoView({ block: 'nearest' });
    return card ?? editor.element(menuId);
  }

  if (step.action === 'select_panel') {
    await cursor.moveTo(editor.element(step.id), fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'add_modifier') {
    const button = editor.element(menu.ui.id);
    await cursor.moveTo(button, fly);
    await cursor.tap();
    menu.open(button);
    const category = menu.categoryOf(step.id);
    await wait(0.25 * scale);
    await cursor.moveTo(menu.element(category.id), fly * 0.8);
    await cursor.tap();
    menu.openCategory(category.id);
    menu.element(step.id)?.classList.add('active');
    await wait(0.2 * scale);
    await cursor.moveTo(menu.element(step.id), fly * 0.8);
    await cursor.tap();
    menu.close();
    render(to);
    const card = editor.element(`modifier.${step.id.split('.')[1]}`);
    card?.scrollIntoView({ block: 'nearest' });
    return card;
  }

  // Voxel Size and the Remesh button live in the header's Remesh popover: open it first.
  const popover = editor.popoverOf?.(step.id);
  if (popover && editor.openList !== popover) {
    await cursor.moveTo(editor.element(popover), fly);
    await cursor.tap();
    editor.openList = popover;
    editor.render(editor.state, editor.options);
    await wait(0.25 * scale);
  }

  if (step.action === 'remesh') {
    const apply = editor.element(step.id);
    await cursor.moveTo(apply, fly * 0.8);
    await cursor.tap();
    editor.openList = null;
    render(to);
    return editor.element(popover);
  }

  // An Object field or an enum dropdown (Deform Axis): open its list, then pick the item.
  if (step.action === 'set_value' && editor.element(step.id)?.classList.contains('dropdown')) {
    await cursor.moveTo(editor.element(step.id), fly);
    await cursor.tap();
    editor.openList = step.id;
    editor.render(editor.state, editor.options);
    await wait(0.25 * scale);
    const item = editor.element(`${step.id}.${step.value.toLowerCase()}`);
    item?.classList.add('on');
    await cursor.moveTo(item, fly * 0.8);
    await cursor.tap();
    editor.openList = null;
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'set_value' && typeof step.value === 'boolean') {
    await cursor.moveTo(editor.element(step.id), fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'set_value' && typeof step.value === 'string') {
    const option = editor.element(`${step.id}.${step.value.toLowerCase()}`) ?? editor.element(step.id);
    await cursor.moveTo(option, fly);
    await cursor.tap();
    render(to);
    return editor.element(step.id);
  }

  if (step.action === 'set_value') {
    const field = editor.element(step.id);
    await cursor.moveTo(field, fly);
    await cursor.tap();
    const from = editor.currentValue?.(step.id);
    if (typeof from === 'number' && from !== step.value) {
      const counter = { value: from };
      await gsap.to(counter, {
        value: step.value, duration: 0.9 * scale, ease: 'power1.inOut',
        onUpdate: () => editor.showValue(step.id, counter.value),
      });
    }
    render(to);
    return editor.element(step.id);
  }

  render(to);
  return null;
}

/** Cursor and brush ring travel along the recorded stroke while the mesh turns into Blender's result. */
export async function playStroke({ step, viewer, cursor, geometries, from, scale = 1 }) {
  const { stroke } = step;
  await viewer.showCamera(step.camera, 0.5 * scale);
  const canvas = viewer.canvas.getBoundingClientRect();
  const screen = point => {
    const pixel = viewer.project(point);
    return { x: canvas.left + pixel.x, y: canvas.top + pixel.y };
  };
  const first = screen(stroke.points[0]);
  await cursor.moveToPoint(first.x, first.y, 0.5 * scale);
  viewer.showBrush(stroke.points[0], stroke.radius);
  const morph = viewer.strokeMorph(geometries.get(from.mesh), geometries.get(step.mesh), stroke);
  const along = { t: 0 };
  const last = stroke.points.length - 1;
  const pointAt = t => {
    const position = t * last;
    const index = Math.min(last - 1, Math.floor(position));
    const local = position - index;
    const a = stroke.points[index];
    const b = stroke.points[Math.min(last, index + 1)];
    return a.map((value, axis) => value + (b[axis] - value) * local);
  };
  await gsap.to(along, {
    t: 1, duration: Math.max(0.6, (step.duration - 0.8)) * scale, ease: 'none',
    onUpdate: () => {
      const point = pointAt(along.t);
      viewer.showBrush(point, stroke.radius);
      const pixel = screen(point);
      cursor.place(pixel.x, pixel.y);
      morph(along.t);
    },
  });
  morph(1);
  viewer.hideBrush();
}
