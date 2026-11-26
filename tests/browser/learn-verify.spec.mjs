import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// A step passes when three.js, with the app's own loader and camera code, draws the same
// world normals Blender rendered. Thresholds were measured: matching steps stay below a
// third of each limit, while the previous step's mesh misses by at least 1.5x.
const PASS = { iou: 0.99, meanDiff: 0.006, badFraction: 0.01 };
const passes = r => r.iou >= PASS.iou && r.meanDiff <= PASS.meanDiff && r.badFraction <= PASS.badFraction;
const fixture = async (lesson, mesh) => 'data:image/png;base64,' +
  (await readFile(new URL(`../fixtures/learn/${lesson}/${mesh.replace('.glb', '.png')}`, import.meta.url))).toString('base64');

for (const lesson of ['modifiers/cup', 'modifiers/bowl', 'sculpt/pebble-buddy', 'sculpt/sleepy-buddy']) {
  test(`${lesson}: three.js shows exactly what Blender computed at every step, and every step changes the result`, async ({ page }) => {
    const timeline = JSON.parse(await readFile(new URL(`../../learn/public/examples/${lesson}/timeline.json`, import.meta.url), 'utf8'));
    const shots = [timeline.initial, ...timeline.steps.filter(step => step.mesh)];
    await page.goto('/learn/verify.html');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const run = async (mesh, camera, reference) => page.evaluate(args => window.verifyStep(args), {
      timeline: `${lesson}/timeline.json`, mesh, camera, reference,
    });
    for (const [index, shot] of shots.entries()) {
      const reference = await fixture(lesson, shot.mesh);
      const result = await run(shot.mesh, shot.camera, reference);
      expect(passes(result), `${shot.mesh} ${JSON.stringify(result)}`).toBe(true);
      if (index === 0) continue;
      const previous = await run(shots[index - 1].mesh, shot.camera, reference);
      expect(passes(previous), `${shot.mesh} must look different from the step before ${JSON.stringify(previous)}`).toBe(false);
    }
  });
}
