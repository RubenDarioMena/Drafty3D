import { gsap } from 'gsap';

const TIP = { x: 4, y: 2 };
const wait = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

/** Lesson cursor. Never recorded: it flies to whatever element carries the step's data-control id. */
export class Cursor {
  constructor(node) {
    this.node = node;
    this.ripple = node.querySelector('.ripple');
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.moves = 0;
  }

  /**
   * One flight of the cursor. A newer flight takes over (a fast learner taps on mid-animation):
   * the older one resolves at once instead of waiting forever for a tween gsap killed.
   */
  fly(x, y, duration) {
    return new Promise(resolve => {
      gsap.to(this.node, {
        x, y, opacity: 1, duration: this.reduced ? 0 : duration, ease: 'power2.inOut', overwrite: true,
        onComplete: resolve, onInterrupt: resolve,
      });
    });
  }

  async moveTo(target, duration = 0.55) {
    if (!target) return;
    const move = ++this.moves;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await wait(0.05);
    // Another move started while the page scrolled: that one owns the cursor now.
    if (move !== this.moves) return;
    const rect = target.getBoundingClientRect();
    const x = rect.left + Math.min(rect.width / 2, 60) - TIP.x;
    const y = rect.top + rect.height / 2 - TIP.y;
    if (gsap.getProperty(this.node, 'opacity') === 0) gsap.set(this.node, { x: x + 40, y: y + 50 });
    await this.fly(x, y, duration);
  }

  /** Flies the cursor tip to a screen point (strokes in the 3D view). */
  async moveToPoint(x, y, duration = 0.5) {
    this.moves += 1;
    if (gsap.getProperty(this.node, 'opacity') === 0) gsap.set(this.node, { x: x + 40, y: y + 50 });
    await this.fly(x - TIP.x, y - TIP.y, duration);
  }

  /** Puts the cursor tip on a screen point immediately (follows a stroke frame by frame). */
  place(x, y) {
    this.moves += 1;
    gsap.set(this.node, { x: x - TIP.x, y: y - TIP.y, opacity: 1 });
  }

  async tap() {
    if (this.reduced) return;
    gsap.fromTo(this.ripple, { scale: 0.3, opacity: 0.9 }, { scale: 1.5, opacity: 0, duration: 0.45, ease: 'power1.out' });
    await gsap.fromTo(this.node, { scale: 1 }, { scale: 0.85, duration: 0.12, yoyo: true, repeat: 1 });
  }

  hide(delay = 0.6) {
    gsap.to(this.node, { opacity: 0, duration: 0.3, delay, overwrite: 'auto' });
  }
}

export { wait };
