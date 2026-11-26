import { gsap } from 'gsap';
import { wait } from './cursor.js';

/**
 * Plays one recorded step on the UI: the cursor flies to each control by its
 * semantic id, taps it, and the panel ends in Blender's recorded state `to`.
 * Used by Watch mode and by the "Show me" help of Your turn.
 */
export async function animateStep({ step, to, editor, menu, cursor, render, scale = 1 }) {
  const fly = 0.55 * scale;
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
