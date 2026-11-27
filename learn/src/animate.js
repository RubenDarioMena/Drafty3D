import { gsap } from 'gsap';
import { wait } from './cursor.js';
import { NAVIGATION, showState } from './scene-view.js';

/**
 * Plays one recorded step on the UI: the cursor flies to each control by its
 * semantic id, taps it, and the panel ends in Blender's recorded state `to`.
 * Used by Watch mode and by the "Show me" help of Your turn.
 */
export async function animateStep(context) {
  const { step, to, editor, menu, modeMenu, cursor, render, viewer, geometries, from, scale = 1 } = context;
  const fly = 0.55 * scale;
  if (step.after && step.action !== 'set_mode' && step.action !== 'redo_value') {
    const target = await animateSceneStep({ ...context, fly });
    render(to);
    // Views change after the click (View ▸ Viewpoint, Frame All); navigation moved the camera already.
    await viewer.showCamera(step.camera, NAVIGATION.has(step.action) ? 0 : 0.6 * scale);
    return target;
  }
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
    if (step.after) await viewer.showCamera(step.camera, 0.4 * scale);
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

  if (step.action === 'set_value' || step.action === 'redo_value') {
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

/** Screen point (for the cursor) of a point recorded in Blender's coordinates. */
function screenOf(viewer, point) {
  const rect = viewer.canvas.getBoundingClientRect();
  const pixel = viewer.project(point);
  return { x: rect.left + pixel.x, y: rect.top + pixel.y };
}

/** Clicks the ⇧ Shift key over the 3D Viewport (a toggle click adds to the selection). */
async function pressShift(keys, cursor, fly, on) {
  if (keys.shift === on) return;
  await cursor.moveTo(keys.shiftButton, fly);
  await cursor.tap();
  keys.setShift(on);
}

/**
 * The Level 1 and 2 actions: header menus (drilling into submenus), clicks in the 3D Viewport,
 * the Knife and Loop Cut, the select mode and Proportional Editing buttons, the Outliner and
 * the view moves. Returns the control to highlight afterwards.
 */
async function animateSceneStep({ step, to, from, editor, headerMenu, keys, cursor, viewer, geometries, fly, scale = 1 }) {
  if (step.action === 'menu') {
    const [first, ...rest] = step.path;
    const button = editor.element(first);
    await cursor.moveTo(button, fly);
    await cursor.tap();
    headerMenu.open(button, first);
    for (const id of rest) {
      await wait(0.25 * scale);
      const item = headerMenu.element(id);
      item?.classList.add('active');
      await cursor.moveTo(item, fly * 0.8);
      await cursor.tap();
      if (id !== step.id) headerMenu.openSubmenu(id);
    }
    headerMenu.close();
    return button;
  }
  if (step.action === 'tap') {
    await pressShift(keys, cursor, fly, step.toggle);
    const point = screenOf(viewer, step.value);
    await cursor.moveToPoint(point.x, point.y, fly);
    await cursor.tap();
    keys.setShift(false);
    return null;
  }
  if (step.action === 'knife') {
    const points = step.knife.points;
    for (let i = 0; i < points.length; i += 1) {
      const point = screenOf(viewer, points[i]);
      viewer.showKnife(points, i);
      await cursor.moveToPoint(point.x, point.y, fly * 0.8);
      await cursor.tap();
      viewer.showKnife(points, i + 1);
    }
    await wait(0.3 * scale);
    keys.show(!keys.shiftButton.hidden, true);
    await cursor.moveTo(keys.enterButton, fly);
    await cursor.tap();
    viewer.clearOverlay();
    return null;
  }
  if (step.action === 'loop_cut') {
    const point = screenOf(viewer, step.value);
    await cursor.moveToPoint(point.x, point.y, fly);
    // Hovering an edge previews the loop in yellow; the click makes it.
    showState(viewer, geometries, from, step.ring);
    await wait(0.6 * scale);
    await cursor.tap();
    return null;
  }
  if (NAVIGATION.has(step.action)) {
    const rect = viewer.canvas.getBoundingClientRect();
    const start = { x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.55 };
    await cursor.moveToPoint(start.x, start.y, fly);
    const drag = step.action === 'zoom' ? { x: 0, y: 0 } : { x: rect.width * 0.22, y: step.action === 'pan' ? rect.height * 0.12 : rect.height * 0.08 };
    const move = viewer.showCamera(step.camera, 1.4 * scale);
    if (step.action === 'zoom') await move;
    else await Promise.all([move, cursor.moveToPoint(start.x + drag.x, start.y + drag.y, 1.4 * scale)]);
    return null;
  }
  if (step.action === 'rename') {
    const row = editor.element(`outliner.row.${step.target}`);
    await cursor.moveTo(row, fly);
    await cursor.tap();
    await cursor.tap();
    editor.renaming = step.target;
    for (let length = 0; length <= step.value.length; length += 1) {
      editor.renameText = step.value.slice(0, length);
      editor.render(from, editor.options);
      await wait(0.07 * scale);
    }
    editor.renaming = null;
    editor.renameText = null;
    return null;
  }
  const id = step.action === 'outliner_select' ? `outliner.row.${step.value}`
    : step.action === 'outliner_hide' ? `outliner.hide.${step.value}` : step.id;
  await cursor.moveTo(editor.element(id), fly);
  await cursor.tap();
  return editor.element(id);
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
