// Plain navigation owns app lifetime: no CAD imports or background prefetches.
const english = {
  header: 'YOUR DESIGN WORKSPACE', language: 'Language',
  headline: 'One idea.\nThree ways to create.',
  intro: 'Choose your tool and start designing. Only the one you open will load.',
  recommended: 'RECOMMENDED', desktop: 'DESKTOP', experimental: 'EXPERIMENTAL',
  solidType: 'PARAMETRIC CAD · IN YOUR BROWSER', solidDescription: 'From sketch to solid. Parametric modeling with a feature history and a geometry engine written in Rust.',
  solidFeature1: 'Sketches and features', openSolid: 'Open SolidCraft', selfHosted: 'Hosted here · no account',
  materialType: 'PARAMETRIC CAD · NATIVE APPLICATION', materialDescription: 'Constrained sketches and solid modeling with OpenCascade. The current version runs as an installed application.',
  materialFeature1: 'Sketch constraints', materialOptions: 'Materializr options', nativeStatus: 'Web version unavailable',
  draftType: 'ATLAS · CAD AND MESHES', draftDescription: 'Our Atlas editor. Create basic solids, work with sketches and convert parts into polygon meshes.',
  draftFeature1: 'Solids and meshes', openDraft: 'Open Draft3D',
  memory: 'One editor at a time. No background loading or required accounts. Save your work before switching tools.',
  about: 'Projects and licenses →', back: '← All tools',
  materialTitle: 'Materializr, on your computer.',
  materialIntro: 'Parametric solid modeling with OpenCascade and a sketch constraint solver. The upstream project currently distributes native applications for desktop and mobile.',
  materialNotice: 'Materializr does not provide a supported web build. Netlify serves static sites and cannot run its native interface. This page does not run Materializr in your browser.',
  materialDownload: 'Get the official application →', materialSource: 'Source code and build instructions →',
  remoteTitle: 'Use your own server',
  remoteDescription: 'Browser access requires a separate server running Materializr with a protected remote desktop. Once that service is deployed, its HTTPS address can be connected to this page.',
  remoteOpen: 'Open hosted Materializr →',
  aboutTitle: 'Three tools, independent projects.',
  aboutIntro: 'This gateway groups existing tools. SolidCraft and Draft3D are served from this site; Materializr currently links to its official native releases.',
  solidLicense: 'Official, unmodified web release 0.18.3. MIT or Apache-2.0. Licenses, font notices and third-party attributions are distributed with the application.',
  draftLicense: 'The Atlas editor from this repository uses Three.js (MIT) and OpenCascade.js / OCCT (LGPL and applicable exceptions). Library source archives and integration sources accompany the application.',
  materialLicense: 'Native project, GPL-3.0 with upstream exceptions. We link to its official releases and source; this site does not redistribute its binaries.',
  privacyTitle: 'Files and memory',
  privacy: 'The gateway does not load CAD engines. Switching tools uses full-page navigation. Keep one editor tab open to limit memory use. SolidCraft and Draft3D have separate document formats and storage; export your work before switching. SolidCraft may cache its own files for offline use after opening it.',
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
    const text = language === 'en' ? english[node.dataset.copy] ?? spanish.get(node) : spanish.get(node);
    if (node.dataset.copy === 'headline') {
      const parts = language === 'es' ? ['Una idea.', 'Tres caminos para crear.'] : text.split('\n');
      node.replaceChildren();
      parts.forEach((part, i) => { if (i) node.append(document.createElement('br')); node.append(part); });
    } else node.textContent = text;
  }
  if (select) { select.value = language; select.setAttribute('aria-label', language === 'en' ? 'Language' : 'Idioma'); }
}
apply(language);
select?.addEventListener('change', () => {
  apply(select.value);
  try { localStorage.setItem('drafty3d.language.v1', language); } catch {}
});
