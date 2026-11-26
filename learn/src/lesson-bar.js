// Text, shortcut keycaps and the success clue under the 3D view.
export class LessonBar {
  constructor() {
    this.count = document.getElementById('step-count');
    this.text = document.getElementById('step-text');
    this.shortcut = document.getElementById('shortcut');
    this.clue = document.getElementById('clue');
  }

  show({ count, text, shortcut }) {
    this.count.textContent = count;
    this.text.textContent = text;
    this.shortcut.replaceChildren();
    this.shortcut.hidden = !shortcut;
    if (shortcut) {
      shortcut.keys.forEach((key, index) => {
        if (index) this.shortcut.append('+');
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        this.shortcut.append(kbd);
      });
      const context = document.createElement('span');
      context.className = 'context';
      context.textContent = shortcut.context;
      this.shortcut.append(context);
    }
  }

  showClue(message, helped = false) {
    this.clue.textContent = message;
    this.clue.classList.toggle('helped', helped);
    this.clue.hidden = !message;
  }
}
