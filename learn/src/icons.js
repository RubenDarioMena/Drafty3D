// Our own simplified icons (Blender's icons are not copied). Colors only hint at Blender's tab families.
const svg = (body, view = '0 0 20 20') => `<svg viewBox="${view}" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const TABS = {
  TOOL: svg('<path d="M4 16l7-7m1-5a3 3 0 0 0 4 4l-2 2-4-4z" stroke="#bdbdbd" stroke-width="1.8"/>'),
  RENDER: svg('<rect x="3" y="6" width="11" height="9" rx="1.5" stroke="#bdbdbd" stroke-width="1.6"/><path d="M14 9l3-2v7l-3-2" stroke="#bdbdbd" stroke-width="1.6"/>'),
  OUTPUT: svg('<rect x="4" y="8" width="12" height="7" rx="1" stroke="#bdbdbd" stroke-width="1.6"/><path d="M6 8V4h8v4M7 12h6" stroke="#bdbdbd" stroke-width="1.6"/>'),
  VIEW_LAYER: svg('<path d="M10 4l7 3.5-7 3.5-7-3.5zM3 11l7 3.5 7-3.5" stroke="#bdbdbd" stroke-width="1.6"/>'),
  SCENE: svg('<circle cx="7" cy="12" r="3.5" stroke="#bdbdbd" stroke-width="1.6"/><path d="M13 15l2.5-9 2.5 9z" stroke="#bdbdbd" stroke-width="1.6"/>'),
  WORLD: svg('<circle cx="10" cy="10" r="6.5" stroke="#d1574d" stroke-width="1.6"/><path d="M3.5 10h13M10 3.5c-3 3.5-3 9.5 0 13m0-13c3 3.5 3 9.5 0 13" stroke="#d1574d" stroke-width="1.2"/>'),
  COLLECTION: svg('<rect x="3.5" y="5" width="13" height="10" rx="1.5" stroke="#e6e6e6" stroke-width="1.6"/><path d="M3.5 8.5h13" stroke="#e6e6e6" stroke-width="1.4"/>'),
  OBJECT: svg('<rect x="4" y="4" width="12" height="12" rx="2" fill="#ff9e2e"/>'),
  MODIFIER: svg('<path d="M5 15l6-6m1.5-5.2a3.3 3.3 0 0 0 3.7 3.7l-2.1 2.1-3.7-3.7z" stroke="#4f8ef2" stroke-width="2.2"/>'),
  PARTICLES: svg('<circle cx="6" cy="6" r="1.8" fill="#bdbdbd"/><circle cx="14" cy="8" r="1.8" fill="#bdbdbd"/><circle cx="8" cy="14" r="1.8" fill="#bdbdbd"/>'),
  PHYSICS: svg('<circle cx="10" cy="10" r="2.5" fill="#4f8ef2"/><ellipse cx="10" cy="10" rx="7" ry="3.2" stroke="#4f8ef2" stroke-width="1.4"/>'),
  CONSTRAINT: svg('<rect x="3" y="7.5" width="7" height="5" rx="2.5" stroke="#4f8ef2" stroke-width="1.6"/><rect x="10" y="7.5" width="7" height="5" rx="2.5" stroke="#4f8ef2" stroke-width="1.6"/>'),
  DATA: svg('<path d="M10 3.5l6.5 12.5h-13z" stroke="#4fd16a" stroke-width="1.8"/>'),
  MATERIAL: svg('<circle cx="10" cy="10" r="6.5" fill="#d1574d"/><circle cx="8" cy="8" r="2" fill="#f2a097"/>'),
  TEXTURE: svg('<rect x="4" y="4" width="12" height="12" stroke="#d1574d" stroke-width="1.6"/><path d="M4 10h6V4M10 16v-6h6" stroke="#d1574d" stroke-width="1.4"/>'),
};

const MODIFIERS = {
  SOLIDIFY: svg('<rect x="3" y="7" width="14" height="6" stroke="#4f8ef2" stroke-width="1.6"/><path d="M3 10h14" stroke="#4f8ef2" stroke-width="1" stroke-dasharray="2 2"/>'),
  BEVEL: svg('<path d="M4 16V9l5-5h7v12z" stroke="#4f8ef2" stroke-width="1.6"/>'),
  SUBSURF: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="1" stroke="#4f8ef2" stroke-width="1.2"/><circle cx="10" cy="10" r="5" stroke="#4f8ef2" stroke-width="1.6"/>'),
};

export const tabIcon = identifier => TABS[identifier] || svg('<circle cx="10" cy="10" r="3" fill="#888"/>');
export const modifierIcon = type => MODIFIERS[type] || TABS.MODIFIER;
