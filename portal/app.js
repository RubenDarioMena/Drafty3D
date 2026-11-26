// Plain navigation owns app lifetime: no CAD imports or background prefetches.
const english = {
  language: 'Language',
  about: 'Projects and licenses →', back: '← All tools',
  solidSlow: 'SolidCraft is still loading. The first visit downloads an engine of about 50 MB.', solidDirect: 'Open editor directly ↗', solidRetry: 'Retry',
  aboutTitle: 'Design workspace tools.',
  aboutIntro: "Drafty3D's design workspace integrates existing tools. Each keeps its own license and provenance.",
  solidLicense: 'Official, unmodified web release 0.18.3. MIT or Apache-2.0. Licenses, font notices and third-party attributions are distributed with the application.',
  workspaceLicenses: 'Design workspace editors',
  learnLicense: 'Unofficial, not affiliated with the Blender Foundation. Uses three.js (MIT), GSAP (standard no-charge license) and the Draco decoder (Apache-2.0).',
  bundledNotices: 'Dependency notices', pinnedSource: 'Pinned source', licenseInfo: 'License information',
  privacyTitle: 'Files and memory',
  privacy: 'The design workspace loads one editor at a time. Save to the project or download a copy before leaving. SolidCraft can also keep its own files in the browser for offline work.',
};
const nodes = [...document.querySelectorAll('[data-copy]')];
const spanish = new Map(nodes.map(node => [node, node.textContent]));
const select = document.querySelector('#language');
let language = 'es';
try { language = localStorage.getItem('drafty3d.language.v1') === 'en' ? 'en' : 'es'; } catch {}
function apply(value) {
  language = value === 'en' ? 'en' : 'es';
  document.documentElement.lang = language;
  for (const node of nodes) {
    node.textContent = language === 'en' ? english[node.dataset.copy] ?? spanish.get(node) : spanish.get(node);
  }
  if (select) { select.value = language; select.setAttribute('aria-label', language === 'en' ? 'Language' : 'Idioma'); }
}
apply(language);
select?.addEventListener('change', () => {
  apply(select.value);
  try { localStorage.setItem('drafty3d.language.v1', language); } catch {}
});

const solidFrame = document.querySelector('.editor-frame');
const solidHelp = document.querySelector('#solidcraft-help');
if (solidFrame && solidHelp) {
  let slowTimer;
  const ready = () => {
    try {
      const win = solidFrame.contentWindow;
      return Boolean(win?.wasmBindings && !win.document.querySelector('#solidcraft_loading'));
    } catch { return false; }
  };
  const check = () => {
    if (!ready()) return;
    solidHelp.hidden = true;
    clearTimeout(slowTimer);
    clearInterval(poll);
  };
  const poll = setInterval(check, 500);
  const watch = () => {
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => { if (!ready()) solidHelp.hidden = false; }, 20000);
  };
  solidFrame.addEventListener('load', check);
  document.querySelector('#solidcraft-retry')?.addEventListener('click', () => {
    solidHelp.hidden = true;
    watch();
    solidFrame.src = '/solidcraft/app/';
  });
  watch();
  check();
}
