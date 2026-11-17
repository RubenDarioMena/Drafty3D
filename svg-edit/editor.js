import Editor from './vendor/Editor.js';

// SVG-Edit reads localStorage during startup. The sandbox uses a document-scoped substitute.
const preferences = new Map();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: key => preferences.get(key) ?? null,
    setItem: (key, value) => preferences.set(key, String(value)),
    removeItem: key => preferences.delete(key),
  },
});
const editor = new Editor(document.querySelector('#container'));
const parentOrigin = location.origin;
const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'es';
editor.setConfig({
  lang: language,
  allowInitialUserOverride: false,
  noDefaultExtensions: true,
  lockExtensions: true,
  noStorageOnLoad: true,
  preventAllURLConfig: true,
  preventURLContentLoading: true,
  imgPath: './vendor/images',
  extPath: './vendor/extensions/',
  extensions: ['ext-opensave', 'ext-eyedropper', 'ext-grid', 'ext-markers', 'ext-panning', 'ext-shapes', 'ext-polystar', 'ext-layer_view'],
});
const ready = editor.init();

window.addEventListener('message', async event => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  const { id, action, svg } = event.data ?? {};
  if (typeof id !== 'string' || !['ready', 'open', 'export'].includes(action)) return;
  try {
    await ready;
    await editor.ready(() => {});
    let result;
    if (action === 'open') await editor.loadFromString(svg, { noAlert: true });
    if (action === 'export') result = editor.svgCanvas.getSvgString();
    window.parent.postMessage({ id, result }, parentOrigin);
  } catch (error) {
    window.parent.postMessage({ id, error: error.message }, parentOrigin);
  }
});

for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => {
    window.parent.postMessage({ type: 'edit' }, parentOrigin);
  }, { capture: true });
}
