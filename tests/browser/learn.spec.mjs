import { test as base, expect, devices } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Watch' }).first().click();
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
  await expect(page.locator('.lesson-card').first()).toContainText('Watched ✓');
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
  await expect(page.locator('.lesson-card').nth(1)).toContainText('Done ✓ · 1 with help');
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
  for (const lesson of ['modifiers/cup', 'sculpt/sleepy-buddy']) {
    await page.goto(`/learn/#/lesson/${lesson}`);
    await expect(page.locator('#step-count')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('home groups the lessons by module', async ({ page }) => {
  await page.goto('/learn/');
  await expect(page.locator('.module h2')).toHaveText(['Modifiers', 'Sculpting']);
  await expect(page.locator('.module[data-module="sculpt"] .lesson-card h3')).toHaveText(['Pebble buddy', 'Your turn: sleepy buddy']);
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
