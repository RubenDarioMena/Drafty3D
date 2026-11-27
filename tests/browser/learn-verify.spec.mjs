import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// A step passes when three.js, with the app's own loader and camera code, draws the same
// world normals Blender rendered. Thresholds were measured over every lesson: matching steps use
// at most 70% of a limit (thin pieces, mostly edge, are the closest), while the previous step's
// mesh goes over at least one limit (the closest is the boulder's crack, 1% over). verify.js
// forgives a pixel of edge antialiasing, which is all a half-pixel camera shift changes.
const PASS = { iou: 0.99, meanDiff: 0.006, badFraction: 0.01 };
const passes = r => r.iou >= PASS.iou && r.meanDiff <= PASS.meanDiff && r.badFraction <= PASS.badFraction;
const fixture = async (lesson, file) => 'data:image/png;base64,' +
  (await readFile(new URL(`../fixtures/learn/${lesson}/${file.replace('.glb', '.png')}`, import.meta.url))).toString('base64');

const index = JSON.parse(await readFile(new URL('../../learn/public/examples/index.json', import.meta.url), 'utf8'));

for (const lesson of index.lessons.map(entry => `${entry.module}/${entry.example}`)) {
  test(`${lesson}: three.js shows exactly what Blender computed at every step, and every step changes the result`, async ({ page }) => {
    const timeline = JSON.parse(await readFile(new URL(`../../learn/public/examples/${lesson}/timeline.json`, import.meta.url), 'utf8'));
    // Steps that change the scene ship a mesh; steps that only move the view (orbit, View ▸ Viewpoint)
    // ship a render of the unchanged scene from the new camera instead, which checks the app's camera.
    const shots = [timeline.initial, ...timeline.steps.filter(step => step.mesh)];
    let current = timeline.initial.mesh;
    const views = [];
    for (const step of timeline.steps) {
      if (step.mesh) current = step.mesh;
      if (step.verify) views.push({ mesh: current, camera: step.camera, render: step.verify });
    }
    // A Mask stroke only paints Blender's mask: the shape must still match, but it cannot look different.
    // tests/learn.test.mjs proves instead that its mesh carries more mask than the step before.
    const masksOnly = shot => shot.stroke?.brushType === 'MASK';
    // Multires Subdivide on a smooth surface adds faces, not shape: tests/learn.test.mjs proves the
    // shipped mesh gains Blender's new level instead.
    const addsLevelsOnly = shot => shot.action === 'multires_subdivide';
    await page.goto('/learn/verify.html');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const run = async (mesh, camera, reference) => page.evaluate(args => window.verifyStep(args), {
      timeline: `${lesson}/timeline.json`, mesh, camera, reference,
    });
    for (const [index, shot] of shots.entries()) {
      const reference = await fixture(lesson, shot.mesh);
      const result = await run(shot.mesh, shot.camera, reference);
      expect(passes(result), `${shot.mesh} ${JSON.stringify(result)}`).toBe(true);
      if (index === 0 || masksOnly(shot) || addsLevelsOnly(shot)) continue;
      const previous = await run(shots[index - 1].mesh, shot.camera, reference);
      if (passes(previous) && timeline.initial.scene) {
        // Scene steps can change what the picture cannot show: a name, a duplicate on top of the
        // original, edges from a Loop Cut or the Knife. Then the objects or their vertex counts differ.
        const structure = mesh => page.evaluate(args => window.sceneStructure(args), { timeline: `${lesson}/timeline.json`, mesh });
        expect(await structure(shot.mesh), `${shot.mesh} must change the scene`).not.toEqual(await structure(shots[index - 1].mesh));
        continue;
      }
      expect(passes(previous), `${shot.mesh} must look different from the step before ${JSON.stringify(previous)}`).toBe(false);
    }
    for (const view of views) {
      const result = await run(view.mesh, view.camera, await fixture(lesson, view.render));
      expect(passes(result), `${view.render} ${JSON.stringify(result)}`).toBe(true);
    }
  });
}
