import { readFile } from 'node:fs/promises';
import { test as base, expect, devices } from '@playwright/test';
import * as THREE from 'three';
import { applyCamera, toThree } from '../../learn/src/camera.js';

const test = base.extend({
  // Offline-first: the app may only ever fetch its own /learn/ files.
  requests: [async ({ page }, use) => {
    const outside = [];
    const errors = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/learn/') && url.protocol !== 'data:' && url.protocol !== 'blob:') outside.push(request.url());
    });
    page.on('pageerror', error => errors.push(error.message));
    await use(outside);
    expect(outside, 'requests outside /learn/').toEqual([]);
    expect(errors, 'page errors').toEqual([]);
  }, { auto: true }],
});

test.use({ ...devices['Pixel 7'] });

test('Watch plays the cup step by step: cursor, highlighted control, shortcut, and progress saved on the device', async ({ page }) => {
  await page.goto('/learn/');
  await page.locator('.module[data-module="modifiers"]').getByRole('button', { name: 'Watch' }).first().click();
  await expect(page.locator('#step-text')).toContainText('open cylinder becomes a cup');
  await expect(page.locator('#orbit-hint')).toBeVisible();

  await page.locator('#next').click();
  // The Modifier tab step is pure navigation: it plays and moves on by itself to "add Solidify".
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8', { timeout: 15000 });
  await expect(page.locator('#shortcut kbd')).toHaveText(['Shift', 'A']);
  await expect(page.locator('[data-control="modifier.solidify"]')).toHaveClass(/is-target/, { timeout: 15000 });
  await expect(page.locator('#cursor')).toHaveCSS('opacity', '0', { timeout: 5000 });

  await page.locator('#next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 8');
  await expect(page.locator('[data-control="modifier.solidify.thickness"]')).toContainText('0.08 m', { timeout: 15000 });
  await expect(page.locator('[data-control="modifier.solidify.thickness"]')).toHaveClass(/is-target/);

  await page.locator('#scrubber').fill('7');
  await expect(page.locator('#step-count')).toHaveText('Step 8 of 8 · Done');
  await expect(page.locator('#shortcut kbd')).toHaveText(['Ctrl', '2']);
  await expect(page.locator('#next')).toBeDisabled();

  await page.locator('#scrubber').fill('-1');
  await expect(page.locator('[data-control="panel.properties.object"]')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/learn/#/');
  await expect(page.locator('.module[data-module="modifiers"] .lesson-card').first()).toContainText('Watched ✓');
});

test('Your turn works like a combination lock, with "Show me" always available, and remembers progress', async ({ page }) => {
  await page.goto('/learn/#/lesson/modifiers/bowl');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 8');
  await expect(page.locator('#help')).toBeVisible();

  await page.locator('[data-control="panel.properties.modifier"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Modifier Properties open.');
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8');

  // A modifier that is not next adds nothing (three.js never invents a result) and counts no error.
  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.generate"]').click();
  await expect(page.locator('[data-control="modifier.boolean.add"]')).toBeDisabled();
  await page.locator('[data-control="modifier.bevel.add"]').click();
  await expect(page.locator('#toast')).toHaveText('Not this one yet');
  await expect(page.locator('.modifier')).toHaveCount(0);

  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.generate"]').click();
  await page.locator('[data-control="modifier.solidify.add"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Solidify added.');
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 8');

  // A wrong value simply leaves the lock closed; typing the right one opens it.
  await page.locator('[data-control="modifier.solidify.thickness"] button[aria-label^="Increase"]').click();
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 8');
  await page.locator('[data-control="modifier.solidify.thickness"] .value').click();
  await page.getByLabel('Thickness', { exact: true }).fill('0.06');
  await page.keyboard.press('Enter');
  await expect(page.locator('#clue')).toHaveText('✓ Thickness: 0.06 m.');
  await expect(page.locator('[data-control="modifier.solidify.thickness"] button').first()).toBeDisabled();

  await page.locator('#help').click();
  await expect(page.locator('#clue')).toContainText('Shown: Add Modifier → Generate → Bevel', { timeout: 15000 });
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 8');

  await page.reload();
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 8');

  const step = async (id, presses, direction = 'Decrease') => {
    for (let i = 0; i < presses; i += 1) {
      await page.locator(`[data-control="${id}"] button[aria-label^="${direction}"]`).click();
    }
  };
  await step('modifier.bevel.amount', 8);
  await expect(page.locator('#clue')).toHaveText('✓ Amount: 0.02 m.');
  await step('modifier.bevel.segments', 2, 'Increase');
  await expect(page.locator('#clue')).toHaveText('✓ Segments: 3.');
  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.generate"]').click();
  await page.locator('[data-control="modifier.subsurf.add"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Subdivision Surface added.');
  await step('modifier.subsurf.levels', 1, 'Increase');
  await expect(page.locator('#step-count')).toHaveText('Finished · 1 with help');
  await expect(page.locator('#help')).toBeHidden();

  await page.goto('/learn/#/');
  await expect(page.locator('.module[data-module="modifiers"] .lesson-card').nth(1)).toContainText('Done ✓ · 1 with help');
});

test('Your turn with Blender\'s option buttons: Simple Deform\'s Axis row and an angle stepped in degrees', async ({ page }) => {
  await page.goto('/learn/#/lesson/modifiers/twisted-candle');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 7');
  const press = async (id, times, direction) => {
    for (let i = 0; i < times; i += 1) await page.locator(`[data-control="${id}"] button[aria-label^="${direction}"]`).click();
  };
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.generate"]').click();
  await page.locator('[data-control="modifier.bevel.add"]').click();
  await press('modifier.bevel.amount', 8, 'Decrease');
  await press('modifier.bevel.segments', 1, 'Increase');
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 7');
  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.deform"]').click();
  await page.locator('[data-control="modifier.simple_deform.add"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Simple Deform added.');

  // Blender's default bends around X; the learner switches the row to Z.
  await expect(page.locator('[data-control="modifier.simple_deform.axis.x"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-control="modifier.simple_deform.axis.y"]').click();
  await expect(page.locator('#step-count')).toHaveText('Step 6 of 7');
  await page.locator('[data-control="modifier.simple_deform.axis.z"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Axis: Z.');
  // Once solved, the row is shown, not offered: plain labels with Z lit.
  await expect(page.locator('[data-control="modifier.simple_deform.axis.z"]')).toHaveClass('on');

  // 45° → 180° in 5° steps: the limits are in degrees too.
  await press('modifier.simple_deform.angle', 27, 'Increase');
  await expect(page.locator('#step-count')).toHaveText('Finished');
});

test('Your turn with toggles and subpanels: Mirror\'s Axis Y and Array\'s Relative Offset Factor Z', async ({ page }) => {
  const press = async (id, times, direction) => {
    for (let i = 0; i < times; i += 1) await page.locator(`[data-control="${id}"] button[aria-label^="${direction}"]`).click();
  };
  const add = async (category, id) => {
    await page.locator('[data-control="modifier.add_menu"]').click();
    await page.locator(`[data-control="modifier.add_menu.${category}"]`).click();
    await page.locator(`[data-control="${id}"]`).click();
  };
  await page.goto('/learn/#/lesson/modifiers/mirror-bench');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await add('generate', 'modifier.mirror.add');
  // Blender's Axis row: X starts on, Y and Z off; tapping Y turns it on without touching X.
  await expect(page.locator('[data-control="modifier.mirror.axis_x"]')).toHaveClass(/\bon\b/);
  await page.locator('[data-control="modifier.mirror.axis_y"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Axis Y on.');
  await expect(page.locator('[data-control="modifier.mirror.axis_x"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-control="modifier.mirror.axis_y"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('.subpanel-head').filter({ hasText: 'Data' })).toBeVisible();

  await page.goto('/learn/#/lesson/modifiers/array-floating-steps');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await add('generate', 'modifier.array.add');
  // Relative Offset is the subpanel Blender opens by default, its checkbox on; Merge stays closed.
  await expect(page.locator('.subpanel.open .subpanel-head')).toHaveText([/Relative Offset$/]);
  await expect(page.locator('[data-control="modifier.array.relative"] .box')).toHaveClass(/on/);
  await expect(page.locator('[data-control="modifier.array.merge"] .box')).not.toHaveClass(/on/);
  await press('modifier.array.factor_z', 25, 'Increase');
  await expect(page.locator('#clue')).toHaveText('✓ Factor Z: 2.500.');
  await press('modifier.array.count', 3, 'Increase');
  await expect(page.locator('#step-count')).toHaveText('Finished');
});

test('Your turn with Blender\'s dropdowns: Boolean\'s Object picks a helper, Curve\'s Deform Axis opens its list', async ({ page }) => {
  const add = async (category, id) => {
    await page.locator('[data-control="modifier.add_menu"]').click();
    await page.locator(`[data-control="modifier.add_menu.${category}"]`).click();
    await page.locator(`[data-control="${id}"]`).click();
  };
  await page.goto('/learn/#/lesson/modifiers/boolean-lantern');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await add('generate', 'modifier.boolean.add');
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 5');
  // The empty Object field lists the lesson's objects; picking Window cuts it.
  await page.locator('[data-control="modifier.boolean.object"]').click();
  await expect(page.locator('.dropdown-list [role="option"]')).toHaveText([/Window$/]);
  await page.locator('[data-control="modifier.boolean.object.window"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Object: Window.');
  await expect(page.locator('[data-control="modifier.boolean.object"]')).toHaveText(/Window/);
  await page.locator('[data-control="modifier.boolean.operation.union"]').click();
  await page.locator('[data-control="modifier.boolean.operation.difference"]').click();
  await expect(page.locator('#step-count')).toHaveText('Finished');

  await page.goto('/learn/#/lesson/modifiers/curve-ring-track');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await add('deform', 'modifier.curve.add');
  await page.locator('[data-control="modifier.curve.object"]').click();
  await page.locator('[data-control="modifier.curve.object.ring"]').click();
  await page.locator('[data-control="modifier.curve.deform_axis"]').click();
  await page.locator('[data-control="modifier.curve.deform_axis.neg_y"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Deform Axis: -Y.');
  await expect(page.locator('#step-count')).toHaveText('Finished');
});

test('Your turn with the modifier header: Move to First, the Realtime toggle and Apply', async ({ page }) => {
  const add = async (category, id) => {
    await page.locator('[data-control="modifier.add_menu"]').click();
    await page.locator(`[data-control="modifier.add_menu.${category}"]`).click();
    await page.locator(`[data-control="${id}"]`).click();
  };
  const press = async (id, times, direction) => {
    for (let i = 0; i < times; i += 1) await page.locator(`[data-control="${id}"] button[aria-label^="${direction}"]`).click();
  };
  await page.goto('/learn/#/lesson/modifiers/stack-cushion');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await add('generate', 'modifier.subsurf.add');
  await press('modifier.subsurf.levels', 1, 'Increase');
  await add('generate', 'modifier.bevel.add');
  await expect(page.locator('.modifier .modifier-head .name')).toHaveText(['Subdivision', 'Bevel']);

  // The arrow opens Blender's menu; Move to First is offered, Move to Last is not (Bevel is already last).
  await page.locator('[data-control="modifier.bevel.menu"]').click();
  await expect(page.locator('.modifier-menu .item-label')).toHaveText(
    ['Apply', 'Duplicate', 'Copy to Selected', 'Move to First', 'Move to Last', 'Pin to Last']);
  await expect(page.locator('[data-control="modifier.bevel.apply"] .item-shortcut')).toHaveText('Ctrl A');
  await page.locator('[data-control="modifier.bevel.move_to_first"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Bevel moved to the top of the stack.');
  await expect(page.locator('.modifier .modifier-head .name')).toHaveText(['Bevel', 'Subdivision']);

  await press('modifier.bevel.amount', 2, 'Decrease');
  await page.locator('[data-control="modifier.subsurf.show_viewport"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Subdivision hidden in the viewport.');
  await page.locator('[data-control="modifier.subsurf.show_viewport"]').click();
  await page.locator('[data-control="modifier.bevel.menu"]').click();
  await page.locator('[data-control="modifier.bevel.apply"]').click();
  await expect(page.locator('.modifier .modifier-head .name')).toHaveText(['Subdivision']);
  await expect(page.locator('#step-count')).toHaveText('Finished');
});

test('fine stepping stops on every action, including the open Add Modifier menu, and the menu stays on screen', async ({ page }) => {
  await page.goto('/learn/#/lesson/modifiers/cup');
  await expect(page.locator('#watch-controls')).toBeVisible();
  for (let i = 0; i < 4; i += 1) await page.locator('#fine-next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8 · action 2 of 3');
  const item = page.locator('.menu [data-control="modifier.solidify.add"]');
  await expect(item).toHaveClass(/active/);
  await expect(item).toHaveCSS('color', 'rgb(255, 255, 255)');
  const box = await page.locator('.menu').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.locator('#fine-prev').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8 · action 1 of 3');
  await page.locator('#fine-next').click();
  await page.locator('#fine-next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8');
  await expect(page.locator('.modifier')).toHaveCount(1);
});

test('the layout fits a phone screen without horizontal scrolling', async ({ page }) => {
  for (const lesson of ['modifiers/cup', 'sculpt/sleepy-buddy', 'basics/project-table', 'modeling/cut-and-join']) {
    await page.goto(`/learn/#/lesson/${lesson}`);
    await expect(page.locator('#step-count')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('home groups the lessons by module', async ({ page }) => {
  await page.goto('/learn/');
  await expect(page.locator('.module h2')).toHaveText(['Getting around & adding things', 'Modeling in Edit Mode', 'Modifiers', 'Sculpting']);
  await expect(page.locator('.module[data-module="basics"] .lesson-card h3')).toHaveText(
    ['Look around', 'Your turn: tower tour', 'Add objects', 'Your turn: add shapes', 'Move, rotate and scale', 'Your turn: arrange blocks',
      'Duplicate and organize', 'Your turn: pillars', 'Object, Edit and Sculpt Mode', 'Your turn: modes', 'Project: table and stool',
      'Your turn: desk and stool']);
  await expect(page.locator('.module[data-module="modeling"] .lesson-card h3')).toHaveText(
    ['Points, lines and faces', 'Your turn: select parts', 'Extrude', 'Your turn: extrude a crane', 'Inset and extrude inward',
      'Your turn: a niche', 'Loop cut', 'Your turn: a vase', 'Bevel edges', 'Your turn: round a corner', 'Cut and join',
      'Your turn: cut and patch', 'Proportional editing', 'Your turn: a dent', 'Project: a mug', 'Your turn: a jug']);
  await expect(page.locator('.module[data-module="modifiers"] .lesson-card h3')).toHaveText(
    ['Low-poly cup', 'Your turn: bowl', 'Twisted column', 'Your turn: twisted candle',
      'Table from one corner', 'Your turn: bench', 'Staircase from one step', 'Your turn: floating steps',
      'Birdhouse door', 'Your turn: lantern window', 'Garden path', 'Your turn: ring track',
      'Order in the stack', 'Your turn: cushion', 'Project: wooden ladder', 'Your turn: bookshelf']);
  await expect(page.locator('.module[data-module="sculpt"] .lesson-card h3')).toHaveText(
    ['Pebble buddy', 'Your turn: sleepy buddy', 'Horned buddy', 'Your turn: antenna bug', 'Craggy rock', 'Your turn: split boulder',
      'Belted pebble', 'Your turn: seamed pebble', 'Leaning buddy', 'Your turn: peeking buddy', 'Remesh an antenna', 'Your turn: side antenna',
      'Fine wrinkles', 'Your turn: scarred pebble', 'Project: troll head', 'Your turn: imp head']);
});

test('Sculpting Your turn with Multires: the Properties editor for the modifier, then the sculpt header', async ({ page }) => {
  await page.goto('/learn/#/lesson/sculpt/scarred-pebble');
  const lesson = page.locator('#lesson');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 13');
  // Modifier steps show the Properties editor, as a modifier lesson does.
  await expect(lesson).toHaveAttribute('data-module', 'modifiers');
  await page.locator('[data-control="panel.properties.modifier"]').click();
  await page.locator('[data-control="modifier.add_menu"]').click();
  await page.locator('[data-control="modifier.add_menu.generate"]').click();
  await page.locator('[data-control="modifier.multires.add"]').click();
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 13');
  await expect(page.locator('[data-control="modifier.multires.levels"]')).toContainText('0');

  // Subdivide is a button in the open Subdivision subpanel; the other operators are shown but not live.
  const subdivide = page.locator('[data-control="modifier.multires.subdivide"]');
  await expect(page.locator('[data-control="modifier.multires.unsubdivide"]')).toBeDisabled();
  await subdivide.click();
  await expect(page.locator('#clue')).toHaveText('✓ Subdivided: Multires is at level 1.');
  await expect(page.locator('#step-count')).toHaveText('Step 4 of 13');
  await subdivide.click();
  await expect(page.locator('#clue')).toHaveText('✓ Subdivided: Multires is at level 2.');
  await expect(page.locator('[data-control="modifier.multires.levels"]')).toContainText('2');
  await expect(page.locator('[data-control="modifier.multires.sculpt"]')).toContainText('2');

  // The next step is a mode switch: the lesson shows the 3D Viewport header and brushes.
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 13');
  await expect(lesson).toHaveAttribute('data-module', 'sculpt');
  await page.locator('#help').click();
  await expect(page.locator('#step-count')).toHaveText('Step 6 of 13', { timeout: 15000 });
  await expect(page.locator('#viewport-mode')).toHaveText('Sculpt Mode');
  await expect(page.locator('[data-control="sculpt.brush.crease_sharp"]')).toBeVisible();
});

test('Sculpting Your turn with Remesh: Voxel Size in the header popover, then the Remesh button rebuilds the mesh', async ({ page }) => {
  await page.goto('/learn/#/lesson/sculpt/side-antenna');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 10');
  for (let i = 0; i < 4; i += 1) {
    await page.locator('#help').click();
    await expect(page.locator('#step-count')).toHaveText(`Step ${i + 2} of 10`, { timeout: 15000 });
  }
  // Remesh is a popover in the tool header: only the current step's controls are live in it.
  const toggle = page.locator('[data-control="sculpt.remesh"]');
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(page.locator('.remesh-popover')).toBeVisible();
  await expect(page.locator('.remesh-popover [data-control="sculpt.voxel_size"]')).toContainText('0.1 m');
  await expect(page.locator('[data-control="sculpt.remesh.apply"]')).toBeDisabled();
  await page.locator('[data-control="sculpt.voxel_size"] .value').click();
  await page.getByLabel('Voxel Size', { exact: true }).fill('0.02');
  await page.keyboard.press('Enter');
  await expect(page.locator('#clue')).toHaveText('✓ Voxel Size: 0.02 m.');
  await expect(page.locator('#step-count')).toHaveText('Step 6 of 10');

  await page.locator('[data-control="sculpt.remesh.apply"]').click();
  await expect(page.locator('#clue')).toHaveText(/^✓ Remeshed: 642 → [\d,]+ vertices, all about 0.02 m apart\.$/);
  await expect(page.locator('.remesh-popover')).toHaveCount(0);
  await expect(page.locator('#step-count')).toHaveText('Step 7 of 10');
  await expect(toggle).toBeDisabled();
});

/** Canvas pixels of the dotted guide, as page coordinates. */
async function guidePoints(page) {
  return page.evaluate(() => {
    const rect = document.getElementById('viewport-canvas').getBoundingClientRect();
    return document.querySelector('.stroke-overlay .guide').getAttribute('points').trim().split(' ')
      .map(pair => pair.split(',').map(Number)).map(([x, y]) => ({ x: x + rect.left, y: y + rect.top }));
  });
}

async function drag(page, points, offset = { x: 0, y: 0 }) {
  await page.mouse.move(points[0].x + offset.x, points[0].y + offset.y);
  await page.mouse.down();
  for (const point of points) await page.mouse.move(point.x + offset.x, point.y + offset.y, { steps: 3 });
  await page.mouse.up();
}

test('Sculpting Watch: the mode menu, the brush shelf and a real Blender stroke played on the mesh', async ({ page }) => {
  await page.goto('/learn/#/lesson/sculpt/pebble-buddy');
  await expect(page.locator('#viewport-mode')).toHaveText('Object Mode');
  await expect(page.locator('.shelf-note')).toBeVisible();

  // Fine stepping stops on the open mode menu with Sculpt Mode highlighted.
  await page.locator('#fine-next').click();
  await page.locator('#fine-next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 14 · action 2 of 3');
  await expect(page.locator('.menu [data-control="object.mode.sculpt"]')).toHaveClass(/active/);

  // Switching mode is navigation: it plays and moves on to picking Grab.
  await page.locator('#scrubber').fill('-1');
  await page.locator('#next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 14', { timeout: 15000 });
  await expect(page.locator('#viewport-mode')).toHaveText('Sculpt Mode');
  await expect(page.locator('[data-control="sculpt.brush.grab"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  await expect(page.locator('[data-control="sculpt.brush"]')).toHaveText('Grab');

  // Paused before the stroke: the dotted path it will follow.
  await page.locator('#scrubber').fill('2');
  await page.locator('#fine-next').click();
  await expect(page.locator('.stroke-overlay .guide')).toBeVisible();
  await page.locator('#fine-prev').click();
  await expect(page.locator('.stroke-overlay .guide')).toBeHidden();

  await page.locator('#next').click();
  await expect(page.locator('.stroke-overlay .brush-ring').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#step-count')).toHaveText('Step 4 of 14');
  await expect(page.locator('#next')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('.stroke-overlay .brush-ring').first()).toBeHidden();

  await page.locator('#scrubber').fill('13');
  await expect(page.locator('#step-count')).toHaveText('Step 14 of 14 · Done');
  await expect(page.locator('[data-control="sculpt.symmetry.x"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-control="sculpt.size"]')).toContainText('200 px');
});

test('Sculpting Your turn: pick mode, brush and settings, then trace each stroke over its dotted guide', async ({ page }) => {
  await page.goto('/learn/#/lesson/sculpt/sleepy-buddy');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 14');

  await page.locator('[data-control="object.mode"]').click();
  await page.locator('[data-control="object.mode.edit"]').click();
  await expect(page.locator('#toast')).toHaveText('Not this one yet');
  await expect(page.locator('#viewport-mode')).toHaveText('Object Mode');
  await page.locator('[data-control="object.mode"]').click();
  await page.locator('[data-control="object.mode.sculpt"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Sculpt Mode.');

  await page.locator('[data-control="sculpt.brush.draw"]').click();
  await expect(page.locator('#toast')).toHaveText('Not this one yet');
  await page.locator('[data-control="sculpt.brush.grab"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Grab brush.');

  await page.locator('[data-control="sculpt.size"] .value').click();
  await page.getByLabel('Size', { exact: true }).fill('300');
  await page.keyboard.press('Enter');
  await expect(page.locator('#clue')).toHaveText('✓ Size: 300 px.');
  await expect(page.locator('#orbit-hint')).toContainText('Trace the dotted line');

  await expect(page.locator('.stroke-overlay .guide')).toBeVisible();
  await page.waitForTimeout(800); // the camera settles on Blender's view of the stroke
  const guide = await guidePoints(page);
  await drag(page, guide, { x: 0, y: 160 });
  await expect(page.locator('#toast')).toHaveText('Follow the dotted line');
  await drag(page, guide.slice().reverse());
  await expect(page.locator('#toast')).toHaveText('Start at the dot');
  await expect(page.locator('#step-count')).toHaveText('Step 4 of 14');
  await drag(page, guide);
  await expect(page.locator('#clue')).toHaveText('✓ Stroke done. This is the surface Blender sculpted.');
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 14');

  // The rest: "Show me" for settings, tracing for strokes.
  for (let i = 0; i < 12; i += 1) {
    const count = await page.locator('#step-count').textContent();
    if (count.startsWith('Finished')) break;
    if (await page.locator('.stroke-overlay .guide').isVisible()) {
      await page.waitForTimeout(800);
      await drag(page, await guidePoints(page));
      await expect(page.locator('#clue')).toHaveText(/Stroke done/);
    } else {
      await page.locator('#help').click();
      await expect(page.locator('#clue')).toContainText('Shown:', { timeout: 15000 });
    }
    await expect(page.locator('#step-count')).not.toHaveText(count, { timeout: 15000 });
  }
  await expect(page.locator('#step-count')).toHaveText('Finished · 7 with help');

  await page.goto('/learn/#/');
  await expect(page.locator('.module[data-module="sculpt"] .lesson-card').nth(1)).toContainText('Done ✓ · 7 with help');
});

// ---------------------------------------------------------------- Levels 1 and 2: whole scenes

const timelineOf = async lesson => JSON.parse(await readFile(new URL(`../../learn/public/examples/${lesson}/timeline.json`, import.meta.url), 'utf8'));

/** Where a point Blender recorded shows on screen, through the app's own camera code. */
async function screenPoint(page, camera, point) {
  const box = await page.locator('#viewport-canvas').boundingBox();
  const aspect = box.width / box.height;
  const view = camera.ortho ? new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100) : new THREE.PerspectiveCamera(30, aspect, 0.01, 100);
  applyCamera(view, camera, aspect);
  view.updateMatrixWorld();
  const projected = new THREE.Vector3(...toThree(point)).project(view);
  return { x: box.x + (projected.x + 1) / 2 * box.width, y: box.y + (1 - projected.y) / 2 * box.height };
}

async function tapAt(page, camera, point) {
  // Let the camera settle on Blender's view of the previous step first.
  await page.waitForTimeout(900);
  const { x, y } = await screenPoint(page, camera, point);
  await page.mouse.click(x, y);
}

async function pickMenu(page, path) {
  for (const id of path) await page.locator(`[data-control="${id}"]`).click();
}

async function typeValue(page, id, value) {
  await page.locator(`[data-control="${id}"] .value`).click();
  await page.locator(`[data-control="${id}"] input`).fill(String(value));
  await page.keyboard.press('Enter');
}

test('Level 1 Your turn: click an object, Duplicate from the Object menu, set Move X in Adjust Last Operation, then rename and hide in the Outliner', async ({ page }) => {
  const timeline = await timelineOf('basics/pillars');
  const steps = timeline.steps;
  await page.goto('/learn/#/lesson/basics/pillars');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 10');
  await expect(page.locator('#viewport-mode')).toHaveText('Object Mode');

  // A click on empty floor selects nothing and counts no error.
  const canvas = await page.locator('#viewport-canvas').boundingBox();
  await page.waitForTimeout(900);
  await page.mouse.click(canvas.x + 40, canvas.y + 60);
  await expect(page.locator('#toast')).toHaveText('Not this one yet');
  await tapAt(page, steps[0].camera, steps[0].value);
  await expect(page.locator('#clue')).toHaveText('✓ Pillar selected.');
  await expect(page.locator('[data-control="outliner.row.Pillar"]').locator('..')).toHaveClass(/active/);

  // Menu items the lesson uses later open no lock yet; the others stay greyed out.
  await page.locator('[data-control="menu.select_object"]').click();
  await page.locator('[data-control="menu.select_object.all"]').click();
  await expect(page.locator('#toast')).toHaveText('Not this one yet');
  await page.locator('[data-control="menu.object"]').click();
  await expect(page.locator('.menu.header-menu button[disabled]').first()).toBeVisible();
  await page.locator('[data-control="menu.object.duplicate_objects"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Object ▸ Duplicate Objects.');
  await expect(page.locator('[data-control="hud"]')).toContainText('Duplicate Objects');

  await typeValue(page, steps[2].id, 0.5);
  await expect(page.locator('#step-count')).toHaveText('Step 3 of 10');
  await typeValue(page, steps[2].id, steps[2].value);
  await expect(page.locator('#clue')).toHaveText('✓ Move X: 0.9 m.');
  await pickMenu(page, steps[3].path);
  await typeValue(page, steps[4].id, steps[4].value);
  await expect(page.locator('.outliner-row.object')).toHaveCount(3);

  await page.locator('[data-control="outliner.row.Pillar.001"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Pillar.001 selected.');
  await page.locator('[data-control="outliner.row.Pillar.001"]').click();
  await page.locator('input.outliner-rename').fill('Middle');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Type the name exactly: Middle Pillar');
  await page.locator('[data-control="outliner.row.Pillar.001"]').click();
  await page.locator('input.outliner-rename').fill('Middle Pillar');
  await page.keyboard.press('Enter');
  await expect(page.locator('#clue')).toHaveText('✓ Renamed to Middle Pillar.');
  await expect(page.locator('[data-control="outliner.row.Middle Pillar"]')).toBeVisible();

  await page.locator('[data-control="outliner.hide.Colonnade"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Colonnade hidden.');
  await page.locator('[data-control="outliner.hide.Colonnade"]').click();
  await pickMenu(page, steps[9].path);
  await expect(page.locator('#step-count')).toHaveText('Finished');
});

test('Level 1 Your turn: orbit, zoom and pan with the mouse, then Blender\'s View ▸ Viewpoint menu', async ({ page }) => {
  await page.goto('/learn/#/lesson/basics/tower-tour');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 8');
  const canvas = await page.locator('#viewport-canvas').boundingBox();
  const middle = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + canvas.width * 0.35, middle.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#clue')).toHaveText('✓ You turned the view.');
  await page.waitForTimeout(800);
  // A phone's wheel ticks are small (Pixel 7 scales them by its pixel ratio): scroll on until the view is clearly closer.
  for (let i = 0; i < 16; i += 1) await page.mouse.wheel(0, -120);
  await expect(page.locator('#clue')).toHaveText('✓ You zoomed the view.');
  await page.waitForTimeout(800);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(middle.x + canvas.width * 0.4, middle.y + 20, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#clue')).toHaveText('✓ You slid the view.');
  await page.locator('[data-control="menu.view"]').click();
  await page.locator('[data-control="menu.view.viewpoint"]').click();
  await expect(page.locator('.menu.header-menu h4')).toHaveText('View › Viewpoint');
  await page.locator('[data-control="menu.view_viewpoint.front"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ View ▸ Viewpoint ▸ Front.');
});

test('Level 2 Your turn: Edit Mode, Face select, a face click, Merge, then the Knife: tap its points and press Enter', async ({ page }) => {
  const steps = (await timelineOf('modeling/cut-and-patch')).steps;
  await page.goto('/learn/#/lesson/modeling/cut-and-patch');
  await page.locator('[data-control="object.mode"]').click();
  await page.locator('[data-control="object.mode.edit"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Edit Mode.');
  await page.locator('[data-control="mesh.select_mode.face"]').click();
  await expect(page.locator('#clue')).toHaveText('✓ Face select.');
  await tapAt(page, steps[2].camera, steps[2].value);
  await expect(page.locator('#clue')).toHaveText('✓ Selected.');
  await pickMenu(page, steps[3].path);
  await expect(page.locator('#clue')).toHaveText('✓ Mesh ▸ Merge ▸ At Center.');
  await pickMenu(page, steps[4].path);
  await expect(page.locator('#key-enter')).toBeVisible();
  await expect(page.locator('.knife-mark')).toHaveCount(2);
  await page.locator('#key-enter').click();
  await expect(page.locator('#toast')).toHaveText('Tap all 2 dots first');
  for (const point of steps[5].knife.points) await tapAt(page, steps[5].camera, point);
  await expect(page.locator('.knife-mark.done')).toHaveCount(2);
  await page.locator('#key-enter').click();
  await expect(page.locator('#clue')).toHaveText('✓ Cut. This is the cut Blender made.');
  await expect(page.locator('#key-enter')).toBeHidden();
  await tapAt(page, steps[6].camera, steps[6].value);
  await expect(page.locator('#step-count')).toHaveText('Step 8 of 11');
});

test('Level 2 Your turn: Loop Cut and Slide clicks any edge of the ring, then Number of Cuts and Scale in Adjust Last Operation', async ({ page }) => {
  const steps = (await timelineOf('modeling/loop-cut-vase')).steps;
  await page.goto('/learn/#/lesson/modeling/loop-cut-vase');
  await page.locator('#help').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 8', { timeout: 15000 });
  await page.locator('[data-control="mesh.select_mode.edge"]').click();
  await pickMenu(page, steps[2].path);
  // A click away from the vase cuts nothing.
  const canvas = await page.locator('#viewport-canvas').boundingBox();
  await page.waitForTimeout(900);
  await page.mouse.click(canvas.x + 24, canvas.y + 48);
  await expect(page.locator('#toast')).toContainText('Not this edge');
  await tapAt(page, steps[3].camera, steps[3].value);
  await expect(page.locator('#clue')).toHaveText('✓ Loop cut. This is the loop Blender added.');
  await page.locator(`[data-control="${steps[4].id}"] button[aria-label^="Increase"]`).click();
  await page.locator(`[data-control="${steps[4].id}"] button[aria-label^="Increase"]`).click();
  await expect(page.locator('#clue')).toHaveText(`✓ Number of Cuts: ${steps[4].value}.`);
  await pickMenu(page, steps[5].path);
  await typeValue(page, steps[6].id, steps[6].value);
  await typeValue(page, steps[7].id, steps[7].value);
  await expect(page.locator('#step-count')).toHaveText('Finished · 1 with help');
});

test('Level 2 Watch: the Knife\'s numbered points, the cut, and Enter, as Blender recorded them', async ({ page }) => {
  await page.goto('/learn/#/lesson/modeling/cut-and-join');
  await page.locator('#scrubber').fill('4');
  await expect(page.locator('#step-count')).toHaveText('Step 5 of 11');
  await page.locator('#fine-next').click();
  await expect(page.locator('.knife-mark.next')).toHaveCount(1);
  await page.locator('#fine-next').click();
  await expect(page.locator('.knife-mark.done')).toHaveCount(1);
  await page.locator('#fine-next').click();
  await expect(page.locator('#key-enter')).toBeVisible();
  await page.locator('#next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 6 of 11', { timeout: 15000 });
  await expect(page.locator('.knife-mark')).toHaveCount(0);
  await expect(page.locator('#key-enter')).toBeHidden();
});

test('Watch keeps the view the learner turned to through Next, until Reset view or a step that teaches the camera', async ({ page }) => {
  await page.goto('/learn/#/lesson/modeling/proportional-hill');
  await page.locator('#next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 10', { timeout: 15000 });
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#view-reset')).toBeHidden();
  const canvas = page.locator('#viewport-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#view-reset')).toBeVisible();
  await page.locator('#next').click();
  await expect(page.locator('#step-count')).toHaveText('Step 2 of 10', { timeout: 15000 });
  await expect(page.locator('#next')).toBeEnabled();
  // Still the learner's angle: Reset view is offered, and pressing it changes the picture back to Blender's.
  await expect(page.locator('#view-reset')).toBeVisible();
  await page.waitForTimeout(600);
  const theirs = await canvas.screenshot();
  await page.locator('#view-reset').click();
  await expect(page.locator('#view-reset')).toBeHidden();
  await page.waitForTimeout(800);
  expect((await canvas.screenshot()).equals(theirs)).toBe(false);

  // In Look around the camera is the lesson: Orbit takes the view back even after the learner turned it.
  await page.goto('/learn/#/lesson/basics/look-around');
  await page.locator('#scrubber').fill('-1');
  const look = await canvas.boundingBox();
  await page.mouse.move(look.x + look.width * 0.3, look.y + look.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(look.x + look.width * 0.6, look.y + look.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#view-reset')).toBeVisible();
  await page.locator('#next').click();
  await expect(page.locator('#view-reset')).toBeHidden();
});

test('Proportional Editing is a labelled On/Off button, shown only in the lessons that teach it', async ({ page }) => {
  await page.goto('/learn/#/lesson/basics/modes');
  await expect(page.locator('.scene-header')).toBeVisible();
  await expect(page.locator('.icon-toggle')).toHaveCount(0);
  await page.goto('/learn/#/lesson/modeling/proportional-hill');
  const toggle = page.locator('.icon-toggle');
  await expect(toggle).toContainText('Proportional');
  await expect(toggle).toContainText('Off');
  await page.locator('#scrubber').fill('9');
  await expect(toggle).toContainText('On');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('header menus stay inside Android\'s safe area, sideways too (notch and gesture bar)', async ({ page }) => {
  await page.goto('/learn/#/lesson/basics/pillars');
  await expect(page.locator('#step-count')).toHaveText('Step 1 of 10');
  // What env(safe-area-inset-*) gives #app on a phone with a notch on the left and a gesture bar.
  const inset = { top: 32, right: 24, bottom: 28, left: 48 };
  await page.evaluate(({ top, right, bottom, left }) => {
    document.getElementById('app').style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }, inset);
  const size = page.viewportSize();
  for (const id of ['menu.view', 'menu.object']) {
    await page.locator(`.scene-header [data-control="${id}"]`).click();
    const box = await page.locator('.header-menu').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(inset.left);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width - inset.right);
    expect(box.y).toBeGreaterThanOrEqual(inset.top);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height - inset.bottom);
    await page.mouse.click(size.width / 2, inset.top + 4);
    await expect(page.locator('.header-menu')).toHaveCount(0);
  }
});
