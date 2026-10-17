import { onLocaleChange, t } from './i18n.js';

const $ = selector => document.querySelector(selector);
const paths = {
  box: 'M4 8l8-4 8 4v9l-8 4-8-4z M4 8l8 4 8-4 M12 12v9',
  cylinder: 'M5 7a7 3 0 0 0 14 0a7 3 0 0 0-14 0v10a7 3 0 0 0 14 0V7 M5 7v10',
  sphere: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M3 12h18 M12 3c-5 4-5 14 0 18c5-4 5-14 0-18',
  sketch: 'M4 18l2-5L16 3l5 5-10 10-7 1 M6 13l5 5 M3 22h18',
  boolean: 'M3 5h11v11H3z M10 11h11v10H10z',
  fillet: 'M4 21V12a8 8 0 0 1 8-8h9 M9 21v-8a4 4 0 0 1 4-4h8',
  transform: 'M12 2v20 M2 12h20 M9 5l3-3 3 3 M9 19l3 3 3-3 M5 9l-3 3 3 3 M19 9l3 3-3 3',
  mesh: 'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 5 9-5 M12 12v10 M3 7l9 15 9-15 M12 3v9',
};
export const commands = [
  { id: 'create-box', labelKey: 'piece.box', icon: 'box', groupKey: 'group.solids', spaces: ['cad'], create: 'box', aliases: ['bloque', 'block'] },
  { id: 'create-cylinder', labelKey: 'piece.cylinder', icon: 'cylinder', groupKey: 'group.solids', spaces: ['cad'], create: 'cylinder', aliases: ['cilindro', 'cylinder'] },
  { id: 'create-sphere', labelKey: 'piece.sphere', icon: 'sphere', groupKey: 'group.solids', spaces: ['cad'], create: 'sphere', aliases: ['esfera', 'sphere'] },
  { id: 'sketch-button', labelKey: 'command.sketch', icon: 'sketch', groupKey: 'group.sketch', spaces: ['cad', 'sketch'], aliases: ['croquis', 'perfil', 'extruir', 'extrusión', 'sketch', 'profile', 'extrude'] },
  { id: 'boolean-button', labelKey: 'tool.combine', icon: 'boolean', groupKey: 'group.modify', spaces: ['cad'], aliases: ['unir', 'restar', 'cortar', 'intersección', 'union', 'subtract', 'intersect'] },
  { id: 'fillet-button', labelKey: 'tool.roundEdges', icon: 'fillet', groupKey: 'group.modify', spaces: ['cad'], aliases: ['redondear', 'redondeo', 'fillet', 'round'] },
  { id: 'transform-button', labelKey: 'piece.transform', icon: 'transform', groupKey: 'group.transform', spaces: ['cad', 'sketch', 'mesh'], aliases: ['mover', 'girar', 'transformar', 'move', 'rotate', 'transform'] },
  { id: 'mesh-button', labelKey: 'mesh.confirm', icon: 'mesh', groupKey: 'group.representation', spaces: ['cad', 'mesh'], aliases: ['malla', 'poligonal', 'mesh', 'polygon'] },
];
let space = 'cad';
const groupElements = new Map();
const commandButtons = new Map();
for (const groupKey of new Set(commands.map(command => command.groupKey))) {
  const container = document.createElement('div');
  container.className = 'tool-group';
  container.innerHTML = '<div></div><small></small>';
  container.lastElementChild.textContent = t(groupKey);
  groupElements.set(groupKey, container.lastElementChild);
  for (const command of commands.filter(item => item.groupKey === groupKey)) {
    const button = document.createElement('button');
    button.id = command.id;
    button.dataset.edit = '';
    if (command.create) button.dataset.create = command.create;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[command.icon]}"/></svg><span></span>`;
    button.lastElementChild.textContent = t(command.labelKey);
    button.setAttribute('aria-label', t(command.labelKey));
    commandButtons.set(command.id, button);
    container.firstElementChild.append(button);
  }
  $('#command-groups').append(container);
}
function refreshCommandLabels() {
  for (const [key, element] of groupElements) element.textContent = t(key);
  for (const command of commands) {
    const button = commandButtons.get(command.id);
    button.lastElementChild.textContent = t(command.labelKey);
    button.setAttribute('aria-label', t(command.labelKey));
  }
  if ($('#command-palette').open) search();
}
function setSpace(next) {
  space = next;
  for (const button of document.querySelectorAll('[data-space]')) button.setAttribute('aria-pressed', String(button.dataset.space === space));
  for (const command of commands) $(`#${command.id}`).hidden = !command.spaces.includes(space);
  for (const group of document.querySelectorAll('#command-groups .tool-group')) group.hidden = [...group.querySelectorAll('button')].every(button => button.hidden);
}
for (const button of document.querySelectorAll('[data-space]')) button.onclick = () => setSpace(button.dataset.space);
setSpace('cad');
function search() {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const query = normalize($('#command-query').value);
  $('#command-results').replaceChildren();
  for (const command of commands.filter(command => [t(command.labelKey), ...command.aliases].some(value => normalize(value).includes(query)))) {
    const button = document.createElement('button');
    button.innerHTML = '<span></span><small></small>';
    button.firstElementChild.textContent = t(command.labelKey);
    button.lastElementChild.textContent = t(command.groupKey);
    button.disabled = $(`#${command.id}`).disabled;
    button.onclick = () => { $('#command-palette').close(); setSpace(command.spaces[0]); $(`#${command.id}`).click(); };
    $('#command-results').append(button);
  }
}
onLocaleChange(refreshCommandLabels);
$('#open-search').onclick = () => { $('#command-query').value = ''; search(); $('#command-palette').showModal(); $('#command-query').focus(); };
$('#command-query').oninput = search;
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!document.querySelector('dialog[open]')) $('#open-search').click(); } });

const preferenceKey = 'drafty3d.atlas.layout.v1';
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { /* Valores por defecto. */ }
function persistLayout() { try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* No afecta al documento. */ } }
function resizeDocument(value) {
  const max = Math.max(80, Math.min(600, $('.sidebar').clientHeight - 180));
  const size = Math.max(80, Math.min(max, Number(value) || 200));
  document.documentElement.style.setProperty('--document-height', `${size}px`);
  $('#panel-splitter').setAttribute('aria-valuenow', String(Math.round(size)));
  $('#panel-splitter').setAttribute('aria-valuemax', String(Math.round(max)));
  preferences.height = size;
}
function resizeSidebar(value) {
  const size = Math.max(260, Math.min(460, innerWidth * 0.42, Number(value) || 316));
  document.documentElement.style.setProperty('--sidebar', `${size}px`);
  $('#sidebar-resize').setAttribute('aria-valuenow', String(Math.round(size)));
  preferences.width = size;
}
function collapse(name, collapsed) {
  const operation = name === 'operation';
  $('.sidebar').classList.toggle(`${name}-collapsed`, collapsed);
  $(`#${operation ? 'operation' : 'document'}-content`).hidden = collapsed;
  $(`#toggle-${name}`).setAttribute('aria-expanded', String(!collapsed));
}
for (const name of ['document', 'operation']) $(`#toggle-${name}`).onclick = () => collapse(name, $(`#toggle-${name}`).getAttribute('aria-expanded') === 'true');
export function showOperation(kind = 'properties') {
  collapse('operation', false);
  for (const [name, id] of Object.entries({ properties: 'inspector-content', tool: 'operation-form-panel', mesh: 'mesh-panel', sketch: 'sketch-panel' })) $(`#${id}`).hidden = name !== kind;
}
function separator(id, axis, resize, initial) {
  const element = $(id);
  let start;
  element.onpointerdown = event => { if (event.button !== 0) return; start = { pointer: event[axis], size: initial() }; element.setPointerCapture(event.pointerId); event.preventDefault(); };
  element.onpointermove = event => { if (start) resize(start.size + event[axis] - start.pointer); };
  const stop = () => { start = null; persistLayout(); };
  element.onpointerup = stop; element.onpointercancel = stop;
  element.onkeydown = event => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); resize(initial() + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -20 : 20)); persistLayout(); };
}
separator('#panel-splitter', 'clientY', resizeDocument, () => $('.model-panel').clientHeight);
separator('#sidebar-resize', 'clientX', resizeSidebar, () => $('.sidebar').clientWidth);
resizeDocument(preferences.height); resizeSidebar(preferences.width);
window.addEventListener('resize', () => { resizeDocument(preferences.height); resizeSidebar(preferences.width); });
