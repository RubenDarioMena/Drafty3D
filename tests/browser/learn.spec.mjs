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
  await page.getByRole('button', { name: 'Watch' }).click();
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
  await page.goto('/learn/#/lesson/modifiers/cup');
  await expect(page.locator('#step-count')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
