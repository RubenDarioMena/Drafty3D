import { showOperation } from './ui.js';
import { MAX_MESH_TRIANGLES, recommendedMeshQuality, bytesToBase64 } from './mesh-quality.js';
import { CadViewport } from './viewport.js';
import { CadInteractions } from './interactions.js';
import { createDocument, createExampleDocument, validateDocument, addObject, updateObject, removeObject, cloneDocument, serializeDocument, parseDocument, CadHistory, DOCUMENT_LIMITS } from './document.js';
import { applyStaticTranslations, formatNumber, onLocaleChange, t } from './i18n.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const labelKeys = { sketch: 'piece.sketch', box: 'piece.box', cylinder: 'piece.cylinder', sphere: 'piece.sphere', extrusion: 'piece.extrusion', boolean: 'piece.boolean', fillet: 'piece.fillet', transform: 'piece.transform', import: 'piece.import', mesh: 'piece.mesh' };
const icons = { sketch: '⌁', box: '▱', cylinder: '◉', sphere: '◌', extrusion: '⌁', boolean: '⊖', fillet: '◜', transform: '✥', import: '↳', mesh: '◇' };
const fieldKeys = { width: 'field.width', depth: 'field.depth', height: 'field.height', radius: 'field.radius', x: 'field.x', y: 'field.y', z: 'field.z', rx: 'field.rx', ry: 'field.ry', rz: 'field.rz' };
const qualityKeys = ['mesh.minimum', 'mesh.standard', 'mesh.fine', 'mesh.high', 'mesh.veryHigh'];
const storageKey = 'drafty3d.document.v1';
let project = createExampleDocument();
let restoreNotice = '';
let savedProject = null;
let recoveryProject = null;
let recoveryPersisted = false;
function preserveRecovery(json) {
  if (!json) return;
  recoveryProject = json;
  try { localStorage.setItem(`${storageKey}.recovery`, json); recoveryPersisted = true; } catch { /* No sobrescribir el original si no cabe también su copia. */ }
  $('#recover-project').hidden = false;
}
try {
  recoveryProject = localStorage.getItem(`${storageKey}.recovery`);
  recoveryPersisted = Boolean(recoveryProject);
  savedProject = localStorage.getItem(storageKey);
  if (savedProject) project = parseDocument(savedProject);
} catch {
  preserveRecovery(savedProject);
  restoreNotice = 'No se pudo recuperar el guardado local. Puedes descargar la copia anterior o abrir otro proyecto.';
}
$('#recover-project').hidden = !recoveryProject;
const history = new CadHistory(project);
let selection = new Set();
let geometry = { meshes: [] };
let busy = true;
let viewport;
let interactions;
let engine;
let toolAction = null;
let operationToken = 0;
let meshSession = null;
let currentMessage = { text: 'status.localProject', error: false };
let busyText = { title: 'status.loadingEngine', detail: 'status.engineLoading' };
let engineStatusKey = 'status.loadingEngine';
let saveStatusKey = 'status.savedLocal';
let meshEstimateKey = 'mesh.estimateInitial';
let meshPerformance = null;
let meshErrorText = '';
let toolRenderer = null;
let retryMode = false;
let selectionTopology = null;
let elementRequestToken = 0;
let elementLoading = false;

function renderElements() {
  const elements = viewport?.elements, topology = elements?.topology;
  $('#selection-filter').value = topology ? elements.kind : 'body';
  $('#element-panel').hidden = !topology || Boolean(toolAction || meshSession || interactions?.drawing);
  if (!topology) return;
  const references = elements.edgeReferences();
  const coordinates = elements.kind === 'vertex' && elements.selected.size === 1
    ? topology.vertices[[...elements.selected][0]].point.map((value, index) => `${['X', 'Y', 'Z'][index]}: ${formatNumber(value, { maximumFractionDigits: 3 })}`).join(' · ') + ' mm'
    : '';
  $('#element-summary').textContent = t(elements.kind === 'vertex' ? 'selection.vertexCount' : 'selection.edgeCount', { count: formatNumber(elements.selected.size) }) + (coordinates ? ` · ${coordinates}` : '');
  $('#element-note').textContent = t(topology.isMesh ? 'selection.meshNote' : topology.isSketch ? 'selection.sketchNote' : elements.kind === 'vertex' ? 'selection.incidentEdges' : 'selection.edgeNote', { count: formatNumber(references.length) });
  $('#fillet-elements').disabled = Boolean(busy || !references.length);
}

async function chooseElements(kind) {
  const token = ++elementRequestToken;
  if (kind === 'body') { interactions.setMode('orbit'); renderElements(); return; }
  const object = project.objects.find(object => selection.has(object.id) && object.visible);
  if (selection.size !== 1 || !object) { $('#selection-filter').value = 'body'; message('selection.selectPiece'); return; }
  const revision = geometry.meshes.find(mesh => mesh.id === object.id)?.revision;
  elementLoading = true; syncControls(); message('selection.loading');
  try {
    const topology = selectionTopology?.id === object.id && selectionTopology.revision === revision
      ? selectionTopology : await engine.request('topology', project, undefined, { id: object.id });
    if (token !== elementRequestToken || !selection.has(object.id) || geometry.meshes.find(mesh => mesh.id === object.id)?.revision !== topology.revision) return;
    selectionTopology = topology;
    if (kind === 'edge' && topology.isMesh) { message('selection.meshNote'); renderElements(); return; }
    interactions.setMode(kind);
    viewport.elements.activate(kind, topology);
    message(kind === 'edge' ? 'selection.edgeHint' : 'selection.vertexHint');
  } catch (error) { if (token === elementRequestToken) { message(error.message, true); renderElements(); } }
  finally { if (token === elementRequestToken) { elementLoading = false; syncControls(); } }
}

$('#selection-filter').onchange = event => chooseElements(event.target.value);
$('#clear-elements').onclick = () => { viewport.elements.selected.clear(); viewport.elements.paint(); };
$('#fillet-elements').onclick = () => $('#fillet-button').click();
window.addEventListener('drafty-space-change', () => {
  if (!viewport) return;
  ++elementRequestToken; elementLoading = false;
  closeOperation(); interactions.setMode('orbit'); syncControls();
});

function translatedValues(values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value && typeof value === 'object' && value.$t ? t(value.$t) : value]));
}

function renderMessage() {
  $('#message').textContent = t(currentMessage.text, translatedValues(currentMessage.values));
  $('#message').classList.toggle('error', currentMessage.error);
}

function message(text, error = false, values = {}) {
  currentMessage = { text, error, values };
  renderMessage();
}

function updateEngineStatus(key) {
  engineStatusKey = key;
  $('#engine-status').textContent = t(key);
}

function renderBusyLabels() {
  $('#loading-title').textContent = t(busyText.title);
  $('#loading-detail').textContent = t(busyText.detail);
}

function renderMeshLabels() {
  const level = Number($('#mesh-quality').value) || 0;
  $('#mesh-quality-label').textContent = t(qualityKeys[level] || qualityKeys[0]);
  if (meshSession?.result) {
    const result = meshSession.result;
    $('#mesh-estimate').textContent = t('mesh.triangles', { count: formatNumber(result.triangles), deviation: formatNumber(result.deflection, { maximumFractionDigits: 4 }) });
  } else {
    $('#mesh-estimate').textContent = t(meshEstimateKey);
  }
  $('#mesh-performance').textContent = meshPerformance
    ? t('mesh.performance', { milliseconds: formatNumber(meshPerformance.milliseconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), quality: t(qualityKeys[meshPerformance.maximum]) })
    : t('mesh.performanceHint');
  $('#mesh-error').textContent = t(meshErrorText);
}

function closeOperation() {
  meshSession = null;
  toolRenderer = null;
  toolAction = null;
  meshPerformance = null;
  meshErrorText = '';
  viewport?.clearMeshPreview();
  viewport?.setBlocked(busy);
  showOperation('properties');
  renderElements();
  syncControls();
}

$('#cancel-tool').onclick = () => { closeOperation(); message('Operación cancelada.'); };
$('#mesh-cancel').onclick = () => { closeOperation(); syncControls(); message('Conversión cancelada. El CAD se conserva.'); };
$('#mesh-save-first').onclick = () => {
  download(serializeDocument(project), `${filename()}.cad.json`, 'application/json');
  message('Proyecto paramétrico descargado. Puedes continuar con la conversión.');
};
$('#mesh-quality').oninput = () => {
  if (!meshSession || busy) return;
  meshSession.result = null;
  viewport.clearMeshPreview();
  meshEstimateKey = 'mesh.estimatePrompt';
  const level = Number($('#mesh-quality').value);
  $('#mesh-quality-label').textContent = t(qualityKeys[level]);
  $('#mesh-estimate').textContent = t(meshEstimateKey);
  $('#mesh-error').textContent = '';
  meshErrorText = '';
  syncControls();
};
$('#mesh-button').onclick = () => {
  const object = project.objects.find(object => selection.has(object.id));
  const mesh = geometry.meshes.find(mesh => mesh.id === object?.id);
  if (busy || selection.size !== 1 || !object?.visible || mesh?.isMesh || !mesh?.solidCount) {
    message('Selecciona un sólido CAD visible para convertirlo.'); return;
  }
  closeOperation();
  meshSession = { id: object.id, result: null };
  meshEstimateKey = 'mesh.estimateInitial';
  meshPerformance = null;
  meshErrorText = '';
  $('#mesh-source-name').textContent = object.name;
  $('#mesh-quality').max = '4'; $('#mesh-quality').value = '1';
  $('#mesh-quality-label').textContent = t(qualityKeys[1]);
  $('#mesh-error').textContent = '';
  showOperation('mesh');
  $('#operation-content').scrollTop = 0;
  previewMesh();
};
$('#mesh-preview').onclick = previewMesh;

async function previewMesh() {
  const session = meshSession;
  if (!session || busy) return;
  session.result = null;
  meshErrorText = '';
  const quality = Number($('#mesh-quality').value);
  const otherTriangles = geometry.meshes.reduce((sum, mesh) => sum + (mesh.id !== session.id && project.objects.find(object => object.id === mesh.id)?.visible ? mesh.indices.length / 3 : 0), 0);
  const token = ++operationToken;
  $('#mesh-error').textContent = '';
  setBusy(true, 'Preparando la malla', 'Calculando la resolución y midiendo esta escena. El CAD original se conserva.');
  let lowerQuality = null;
  try {
    if (engine.failed) await engine.restart();
    const result = await engine.request('mesh-preview', project, undefined, { id: session.id, quality, maxTriangles: Math.max(1, MAX_MESH_TRIANGLES - otherTriangles) });
    if (token !== operationToken || meshSession !== session) return;
    viewport.showMeshPreview(session.id, result.mesh);
    const milliseconds = await viewport.measureScene();
    if (token !== operationToken || meshSession !== session) return;
    const maximum = recommendedMeshQuality(quality, { milliseconds, triangles: result.triangles, sceneTriangles: result.triangles + otherTriangles });
    $('#mesh-quality').max = String(Math.min(Number($('#mesh-quality').max), maximum));
    meshPerformance = { milliseconds, maximum };
    $('#mesh-performance').textContent = t('mesh.performance', { milliseconds: formatNumber(milliseconds, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), quality: t(qualityKeys[maximum]) });
    if (quality > maximum) {
      lowerQuality = maximum;
      message('Ajustando la resolución al rendimiento medido de esta escena.');
      return;
    }
    if (milliseconds > 40 || otherTriangles + result.triangles > MAX_MESH_TRIANGLES) throw new Error('La escena es demasiado pesada para editarla con fluidez. Oculta otras piezas o reduce la resolución.');
    session.result = result;
    $('#mesh-estimate').textContent = t('mesh.triangles', { count: formatNumber(result.triangles), deviation: formatNumber(result.deflection, { maximumFractionDigits: 4 }) });
    message('Vista previa de malla lista. Confirma la conversión o cancela para volver al CAD.');
  } catch (error) {
    if (token === operationToken) {
      viewport.clearMeshPreview();
      meshErrorText = error.message;
      $('#mesh-error').textContent = t(error.message);
      message(error.message, true);
    }
  } finally {
    if (token === operationToken) {
      setBusy(false);
      if (lowerQuality !== null) {
        $('#mesh-quality').value = String(lowerQuality);
        $('#mesh-quality-label').textContent = t(qualityKeys[lowerQuality]);
        await previewMesh();
      }
    }
  }
}

$('#mesh-confirm').onclick = async () => {
  if (busy || !meshSession?.result) return;
  const { id: sourceId, result } = meshSession;
  const source = project.objects.find(object => object.id === sourceId);
  let id;
  const data = bytesToBase64(result.data);
  viewport.clearMeshPreview();
  const applied = await mutate(candidate => {
    id = addObject(candidate, { type: 'mesh', name: `${source.name.slice(0, 100)} · malla`, color: source.color, params: { data, quality: result.quality } }).id;
    updateObject(candidate, sourceId, { visible: false });
  }, 'Malla creada. El CAD original queda oculto y editable; puedes deshacer.');
  if (applied) { closeOperation(); select(id); }
};

class EngineClient {
  constructor() { this.sequence = 0; this.pending = new Map(); this.start(); }
  start() {
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    // El error lo recoge también quien espera ready; evita un rechazo sin consumidor al reiniciar.
    this.ready.catch(() => {});
    this.worker = new Worker(new URL('./kernel-worker.js', import.meta.url), { type: 'module' });
    this.startTimer = setTimeout(() => this.fail(new Error('El motor CAD está tardando demasiado en cargar. Recarga la página para intentarlo de nuevo.')), 90000);
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        clearTimeout(this.startTimer);
        this.resolveReady(data.capabilities);
        updateEngineStatus('status.engineReady');
      } else if (data.type === 'progress') {
        if (data.message) { busyText.detail = data.message; $('#loading-detail').textContent = t(data.message); }
      } else if (data.id !== undefined) {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(data.id);
        if (data.error) pending.reject(new Error(typeof data.error === 'string' ? data.error : data.error.message));
        else pending.resolve(data.result);
      } else if (data.type === 'error' || data.type === 'fatal') this.fail(new Error(data.error || 'No se pudo iniciar OpenCascade.'));
    };
    this.worker.onerror = (event) => { event.preventDefault(); this.fail(new Error(event.message || 'El motor CAD no pudo cargar.')); };
    this.worker.onmessageerror = () => this.fail(new Error('No se pudo leer la respuesta del motor CAD.'));
  }
  fail(error) {
    clearTimeout(this.startTimer);
    this.rejectReady(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.worker.terminate();
    this.failed = error;
    updateEngineStatus('status.engineStopped');
  }
  async request(type, document, format, options) {
    await this.ready;
    if (this.failed) throw this.failed;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('La operación superó 60 segundos. Tu proyecto anterior se conserva; reinicia el motor para continuar.')), 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, type, document, format, options });
    });
  }
  restart() {
    this.fail(new Error('Operación cancelada. El proyecto anterior se conserva.'));
    this.failed = null;
    this.start();
    return this.ready;
  }
}

function setBusy(value, title = 'status.calculatingPart', detail = 'status.rebuildingSolids') {
  busy = value;
  busyText = { title, detail };
  syncControls();
  viewport?.setBlocked(value || Boolean(meshSession || toolAction));
  $('#loading-overlay').hidden = !value;
  renderBusyLabels();
  $('#cancel-operation').textContent = t('status.cancelOperation');
  $('#cancel-operation').hidden = !value || title === 'Preparando OpenCascade' || title === 'status.enginePreparing';
}

function syncControls() {
  const locked = busy || interactions?.locked || Boolean(meshSession);
  $$('[data-edit], #inspector-content input, #inspector-content button, #inspector-content select, .object-select, .visibility-button, [data-interaction], #transform-snap, [data-plane], #pick-face').forEach((element) => { element.disabled = Boolean(locked); });
  $('#document-name').disabled = Boolean(locked);
  $('#selection-filter').disabled = Boolean(locked || elementLoading || toolAction);
  $$('button[data-space]').forEach(button => { button.disabled = Boolean(locked); });
  $('#clear-elements').disabled = Boolean(locked || toolAction);
  $$('#tool-form input, #tool-form select, #tool-form button').forEach(element => { element.disabled = Boolean(locked); });
  $$('#mesh-panel button, #mesh-panel input').forEach(element => { element.disabled = busy; });
  $('#mesh-confirm').disabled = Boolean(busy || !meshSession?.result);
  const selectedMesh = geometry.meshes.find(mesh => selection.has(mesh.id));
  $('#mesh-button').disabled = Boolean(locked || selection.size !== 1 || selectedMesh?.isMesh || !selectedMesh?.solidCount || !project.objects.find(object => selection.has(object.id))?.visible);
  $('#mesh-button').title = t('mesh.sourceTooltip');
  $('#extrude-sketch-button').disabled = Boolean(locked || selection.size !== 1 || !project.objects.some(object => selection.has(object.id) && object.type === 'sketch'));
  $('#undo').disabled = locked || !history.canUndo;
  $('#redo').disabled = locked || !history.canRedo;
  $$('#sketch-panel button, #sketch-panel input, #sketch-panel select').forEach((element) => { element.disabled = busy; });
  if (interactions?.session && !busy) { interactions.session.draw(); $('#sketch-effect').disabled = Boolean(interactions.session.object); }
}

function saveLocal() {
  try {
    if (recoveryProject && !recoveryPersisted) throw new Error('La copia de recuperación no cabe en el navegador.');
    localStorage.setItem(storageKey, serializeDocument(project));
    saveStatusKey = 'status.savedLocal';
    $('#save-status').textContent = t(saveStatusKey);
  } catch {
    saveStatusKey = 'status.downloadToKeep';
    $('#save-status').textContent = t(saveStatusKey);
    message('El navegador no pudo guardar el proyecto localmente. Usa Guardar archivo para conservarlo.', true);
  }
}

function select(id, multiple = false) {
  if (busy || interactions?.locked) return;
  ++elementRequestToken; elementLoading = false;
  if (viewport.elements.topology) interactions.setMode('orbit');
  closeOperation();
  if (!multiple) selection.clear();
  if (id) {
    if (multiple && selection.has(id)) selection.delete(id);
    else selection.add(id);
  }
  renderPanels();
  viewport.setSelection(selection);
}

function refreshLocalizedPanels() {
  const visibleMeshes = geometry.meshes.filter(mesh => project.objects.find(object => object.id === mesh.id)?.visible);
  const triangleCount = visibleMeshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  const visibleCount = project.objects.filter(object => object.visible).length;
  $('#scene-stats').textContent = t('mesh.count', { count: formatNumber(triangleCount) });
  $('#object-count').textContent = visibleCount === 1 ? t('document.oneVisible') : t('document.visible', { count: formatNumber(visibleCount) });
  $('#selection-label').textContent = selection.size > 1
    ? t('operation.selected', { count: formatNumber(selection.size) })
    : project.objects.find(item => selection.has(item.id))?.name ?? project.name;
  const object = project.objects.find(item => selection.has(item.id));
  $('#inspector-kind').textContent = selection.size === 1 ? t(labelKeys[object.type]).toLocaleUpperCase() : t('operation.selection');
  const sketchNote = $('#sketch-inspector-note');
  if (sketchNote) {
    const sketch = project.objects.find(item => item.id === sketchNote.dataset.sketch);
    const dependents = project.objects.filter(item => item.params.sketch === sketch?.id);
    sketchNote.textContent = dependents.length
      ? t('sketch.dependentNote', { features: dependents.map(item => item.name).join(', ') })
      : t('sketch.noVolumeNote');
  }
  for (const button of $$('.visibility-button')) {
    const part = project.objects.find(item => item.id === button.dataset.visible);
    if (!part) continue;
    const key = part.visible ? 'object.hidePart' : 'object.showPart';
    button.title = t(key, { name: part.name });
    button.setAttribute('aria-label', button.title);
  }
  applyStaticTranslations($('#object-list'));
  applyStaticTranslations($('#inspector-content'));
  renderElements();
}

function renderPanels() {
  const validIds = new Set(project.objects.map(object => object.id));
  selection = new Set([...selection].filter(id => validIds.has(id)));
  $('#document-name').value = project.name;
  const visibleObjects = project.objects.filter(object => object.visible);
  $('#empty-tree').hidden = project.objects.length > 0;
  $('#viewport-empty').hidden = visibleObjects.length > 0;
  $('#object-list').innerHTML = project.objects.map(object => {
    const isMesh = geometry.meshes.find(mesh => mesh.id === object.id)?.isMesh;
    const badgeKey = object.type === 'sketch' ? 'piece.sketchBadge' : isMesh ? 'piece.meshBadge' : 'piece.cad';
    return `<div class="object-row ${selection.has(object.id) ? 'selected' : ''} ${object.visible ? '' : 'source'}"><button class="object-select" data-id="${escape(object.id)}" title="${escape(object.name)}" ${busy ? 'disabled' : ''}><span class="node-icon" aria-hidden="true">${icons[object.type]}</span><span class="node-name">${escape(object.name)}</span><span class="type-badge" data-i18n="${badgeKey}">${escape(t(badgeKey))}</span></button><button class="visibility-button" data-visible="${escape(object.id)}" ${busy ? 'disabled' : ''}>${object.visible ? '◉' : '○'}</button></div>`;
  }).join('');
  $$('.object-select').forEach(button => button.onclick = event => select(button.dataset.id, event.ctrlKey || event.metaKey || event.shiftKey));
  $$('.visibility-button').forEach(button => button.onclick = () => mutate(candidate => {
    const object = candidate.objects.find(item => item.id === button.dataset.visible);
    updateObject(candidate, object.id, { visible: !object.visible });
  }, 'Visibilidad actualizada.'));

  const object = project.objects.find(item => selection.has(item.id));
  const inspector = $('#inspector-content');
  if (selection.size !== 1) {
    const multiple = selection.size > 1;
    inspector.innerHTML = `<div class="inspector-empty"><span class="large-icon">${multiple ? '⊖' : '◈'}</span><h3 data-i18n="${multiple ? 'operation.multipleTitle' : 'operation.emptyTitle'}"></h3><p data-i18n="${multiple ? 'operation.multipleHelp' : 'operation.emptyHelp'}"></p><p data-i18n="operation.kernelHelp"></p></div>`;
    refreshLocalizedPanels();
    syncControls();
    return;
  }
  const dimensions = Object.keys(object.params).filter(key => ['width', 'depth', 'height', 'radius'].includes(key));
  const position = Object.keys(object.params).filter(key => ['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(key));
  const field = key => {
    const labelKey = object.type === 'transform' && ['x', 'y', 'z'].includes(key)
      ? `field.offset${key.toUpperCase()}`
      : object.type === 'extrusion' && key === 'height' ? 'field.profileDepth' : fieldKeys[key];
    return `<div class="field-row"><label for="param-${key}" data-i18n="${labelKey}">${escape(t(labelKey))}</label><div class="number-unit"><input id="param-${key}" name="${key}" type="number" step="any" value="${object.params[key]}" ${dimensions.includes(key) ? `min="${DOCUMENT_LIMITS.minimumDimension}" max="${DOCUMENT_LIMITS.dimension}"` : 'min="-1000000" max="1000000"'} required ${busy ? 'disabled' : ''} /><span>${key.startsWith('r') && key !== 'radius' ? '°' : 'mm'}</span></div></div>`;
  };
  const references = object.type === 'boolean' ? [object.params.left, object.params.right] : object.params.sketch ? [object.params.sketch] : object.params.source ? [object.params.source] : object.params.support ? [object.params.support.source] : [];
  const volume = geometry.meshes.find(mesh => mesh.id === object.id)?.volume;
  const booleanOptions = [['cut', 'tool.cutBtoA'], ['fuse', 'tool.unionAB'], ['common', 'tool.intersectionAB']];
  const sections = `<div class="section-label" data-i18n="operation.piece"></div><input name="name" class="field-input name-field" data-i18n-aria="property.name" maxlength="100" value="${escape(object.name)}" required ${busy ? 'disabled' : ''}/>${dimensions.length ? `<div class="section-label" data-i18n="operation.dimensions"></div>${dimensions.map(field).join('')}` : ''}${position.length ? `<div class="section-label" data-i18n="${object.type === 'transform' ? 'operation.transformPosition' : 'operation.position'}"></div>${position.map(field).join('')}` : ''}${object.type === 'boolean' ? `<div class="section-label" data-i18n="field.operation"></div><select name="operation" aria-label="${escape(t('field.operation'))}" ${busy ? 'disabled' : ''}>${booleanOptions.map(([value, key]) => `<option value="${value}" data-i18n="${key}" ${object.params.operation === value ? 'selected' : ''}>${escape(t(key))}</option>`).join('')}</select>` : ''}<div class="section-label" data-i18n="operation.appearance"></div><div class="field-row"><label for="piece-color" data-i18n="operation.color"></label><input type="color" id="piece-color" name="color" value="${object.color}" ${busy ? 'disabled' : ''}/></div><button class="button primary" type="submit" data-i18n="operation.apply" ${busy ? 'disabled' : ''}></button>`;
  inspector.innerHTML = `<form id="properties-form">${sections}</form>${references.length ? `<div class="section-label" data-i18n="operation.origins"></div><div class="dependency-list">${references.map(id => `<button type="button" class="dependency-link" data-reference="${escape(id)}">${escape(project.objects.find(item => item.id === id)?.name ?? id)} →</button>`).join('')}</div><p class="inspector-note" data-i18n="operation.dependencies"></p>` : ''}${['sketch', 'extrusion'].includes(object.type) ? `<div class="inspector-actions"><button id="edit-profile" class="button" data-i18n="sketch.editProfile"></button>${object.type === 'sketch' ? '<button id="extrude-profile" class="button primary" data-i18n="tool.extrudeSketch"></button>' : ''}</div>` : ''}${Number.isFinite(volume) ? `<div class="stats-card"><span data-i18n="operation.volume"></span><strong>${escape(formatNumber(volume, { maximumFractionDigits: 2 }))} <small>mm³</small></strong></div>` : ''}<div class="inspector-actions"><button id="delete-piece" class="button subtle danger" data-i18n="operation.delete" ${busy ? 'disabled' : ''}></button></div>`;
  applyStaticTranslations(inspector);
  $('#properties-form').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = {};
    [...dimensions, ...position].forEach(key => params[key] = Number(data.get(key)));
    if (object.type === 'boolean') params.operation = data.get('operation');
    mutate(candidate => updateObject(candidate, object.id, { name: String(data.get('name')).trim(), color: data.get('color'), params }), 'Medidas actualizadas.');
  };
  if (geometry.meshes.find(mesh => mesh.id === object.id)?.isMesh) {
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.dataset.i18n = 'mesh.independentNote';
    $('#properties-form').after(note);
    applyStaticTranslations($('#inspector-content'));
  }
  $('#delete-piece').onclick = deleteSelected;
  $$('[data-reference]').forEach(button => button.onclick = () => select(button.dataset.reference));
  if (object.type === 'sketch') {
    const dependents = project.objects.filter(item => item.params.sketch === object.id);
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.id = 'sketch-inspector-note';
    note.dataset.sketch = object.id;
    note.textContent = dependents.length
      ? t('sketch.dependentNote', { features: dependents.map(item => item.name).join(', ') })
      : t('sketch.noVolumeNote');
    $('#properties-form').after(note);
  }
  if ($('#extrude-profile')) $('#extrude-profile').onclick = () => openSketch(object, 'volume');
  if ($('#edit-profile')) $('#edit-profile').onclick = () => openSketch(object);
  refreshLocalizedPanels();
  syncControls();
}

async function applyDocument(candidate, text, { fit = false, commit = true, messageValues = {} } = {}) {
  validateDocument(candidate);
  const token = ++operationToken;
  setBusy(true);
  try {
    if (engine.failed) await engine.restart();
    const geometryUnchanged = candidate.objects.length === project.objects.length && candidate.objects.every((object, index) => { const previous = project.objects[index]; return previous.id === object.id && previous.type === object.type && JSON.stringify(previous.params) === JSON.stringify(object.params); });
    const result = geometryUnchanged ? geometry : await engine.request('evaluate', candidate, undefined, { known: geometry.meshes.map(({ id, revision }) => ({ id, revision })) });
    if (!geometryUnchanged) {
      const previous = new Map(geometry.meshes.map(mesh => [mesh.id, mesh]));
      result.meshes = result.meshes.map(mesh => mesh.positions ? mesh : { ...previous.get(mesh.id), ...mesh });
    }
    if (token !== operationToken) return false;
    project = candidate;
    geometry = result;
    if (commit) history.commit(project);
    viewport.setDocument(project, result);
    if (fit) viewport.fit();
    message(text, false, messageValues);
    saveLocal();
    return true;
  } catch (error) {
    if (token === operationToken) message(error.message || 'No se pudo construir la pieza. El proyecto anterior se conserva.', true);
    return false;
  } finally {
    if (token === operationToken) {
      setBusy(false);
      renderPanels();
      viewport.setSelection(selection);
    }
  }
}

async function mutate(change, text = 'status.projectUpdated', options = {}) {
  if (busy || (interactions?.drawing && !options.fromSketch) || interactions?.dragging) return false;
  const candidate = cloneDocument(project);
  try { change(candidate); return await applyDocument(candidate, text, options); }
  catch (error) { message(error.message, true); return false; }
}

function download(data, name, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function filename() { return project.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ_-]+/g, '-').replace(/^-|-$/g, '') || 'pieza'; }
function numericField(key, value, label, positive = false) { return `<label class="dialog-field"><span>${escape(label)}</span><input name="${key}" type="number" step="any" value="${value}" ${positive ? `min="${DOCUMENT_LIMITS.minimumDimension}" max="${DOCUMENT_LIMITS.dimension}"` : 'min="-1000000" max="1000000"'} required /></label>`; }
function options(selectedId, candidates = project.objects.filter(object => object.type !== 'sketch')) { return candidates.map((object) => `<option value="${escape(object.id)}" ${object.id === selectedId ? 'selected' : ''}>${escape(object.name)}${object.visible ? '' : ` ${escape(t('piece.sourceSuffix'))}`}</option>`).join(''); }
function openTool(title, fields, note, action) {
  if (busy) return;
  closeOperation();
  toolAction = action;
  viewport.setBlocked(true);
  let firstRender = true;
  toolRenderer = () => {
    const values = firstRender ? new Map() : new Map([...$('#tool-fields').querySelectorAll('input, select')].filter(element => element.name).map(element => [element.name, element.value]));
    firstRender = false;
    $('#tool-title').textContent = title();
    $('#tool-fields').innerHTML = `<div class="dialog-fields">${fields()}</div>`;
    $('#tool-note').textContent = note();
    for (const element of $('#tool-fields').querySelectorAll('input, select')) if (values.has(element.name)) element.value = values.get(element.name);
    applyStaticTranslations($('#tool-fields'));
  };
  toolRenderer();
  $('#tool-error').textContent = '';
  showOperation('tool');
  $('#operation-content').scrollTop = 0;
  $('#tool-form input, #tool-form select')?.focus();
  renderElements(); syncControls();
}

$$('[data-create]').forEach((button) => button.onclick = () => {
  const type = button.dataset.create;
  const defaults = { box: { width: 30, depth: 20, height: 10 }, cylinder: { radius: 8, height: 20 }, sphere: { radius: 12 } }[type];
  openTool(() => t('tool.create', { piece: t(labelKeys[type]).toLocaleLowerCase() }), () => Object.entries(defaults).map(([key, value]) => numericField(key, value, `${t(fieldKeys[key])} (mm)`, true)).join('') + ['x','y','z'].map(key => numericField(key, 0, `${t(fieldKeys[key])} (mm)`)).join(''), () => t(type === 'box' ? 'tool.blockPosition' : 'tool.roundPosition'), async data => {
    const params = Object.fromEntries([...data.entries()].map(([key,value]) => [key, Number(value)]));
    let id;
    const applied = await mutate(candidate => { id = addObject(candidate, { type, params }).id; }, 'status.featureCreated', { fit: true, messageValues: { piece: { $t: labelKeys[type] } } });
    if (applied) select(id);
  });
});

$('#boolean-button').onclick = () => {
  const candidates = project.objects.filter(object => geometry.meshes.some(mesh => mesh.id === object.id && mesh.solidCount && !mesh.isMesh));
  if (candidates.length < 2) { message('tool.createTwoSolids'); return; }
  const ids = [...selection].filter(id => candidates.some(object => object.id === id));
  const visible = candidates.filter(object => object.visible);
  const left = ids[0] ?? visible[0]?.id ?? candidates[0].id;
  const right = ids[1] ?? visible.find(object => object.id !== left)?.id ?? candidates.find(object => object.id !== left).id;
  openTool(() => t('tool.combine'), () => `<label class="dialog-field full"><span>${t('field.operation')}</span><select name="operation"><option value="cut">${t('tool.cutBtoA')}</option><option value="fuse">${t('tool.unionAB')}</option><option value="common">${t('tool.intersectionAB')}</option></select></label><label class="dialog-field full"><span>${t('field.pieceA')}</span><select name="left">${options(left, candidates)}</select></label><label class="dialog-field full"><span>${t('field.pieceB')}</span><select name="right">${options(right, candidates)}</select></label>`, () => t('tool.combineSources'), async data => {
    let id;
    const applied = await mutate(candidate => {
      const params = Object.fromEntries(data);
      id = addObject(candidate, { type: 'boolean', name: { cut: t('tool.cut'), fuse: t('tool.union'), common: t('tool.intersection') }[params.operation], params }).id;
      updateObject(candidate, params.left, { visible: false });
      updateObject(candidate, params.right, { visible: false });
    }, 'tool.combineCreated', { fit: true });
    if (applied) select(id);
  });
};

$('#fillet-button').onclick = () => {
  const candidates = project.objects.filter(object => geometry.meshes.some(mesh => mesh.id === object.id && mesh.solidCount && !mesh.isMesh));
  if (!candidates.length) { message('tool.createBeforeFillet'); return; }
  const source = candidates.find(object => selection.has(object.id))?.id ?? candidates.find(object => object.visible)?.id ?? candidates.at(-1).id;
  const topology = viewport.elements.topology;
  const local = topology?.id === source ? { edges: viewport.elements.edgeReferences(), edgeCount: topology.edges.length } : null;
  if (local && !local.edges.length) { message('selection.chooseElements'); return; }
  openTool(() => t(local ? 'selection.fillet' : 'tool.roundEdges'), () => `${local ? `<input name="source" type="hidden" value="${escape(source)}"/><p class="dialog-field full">${escape(candidates.find(object => object.id === source).name)} · ${escape(t('selection.edgeCount', { count: local.edges.length }))}</p>` : `<label class="dialog-field full"><span>${t('field.sourcePiece')}</span><select name="source">${options(source, candidates)}</select></label>`}${numericField('radius', 1, `${t('field.radiusMm')}`, true)}`, () => t(local ? 'selection.filletHint' : 'tool.filletHint'), async data => {
    let id;
    const applied = await mutate((candidate) => {
      id = addObject(candidate, { type: 'fillet', name: t('tool.filletDefault'), params: { source: data.get('source'), radius: Number(data.get('radius')), ...(local || {}) } }).id;
      updateObject(candidate, data.get('source'), { visible: false });
    }, 'tool.filletCreated');
    if (applied) select(id);
  });
};

$('#transform-button').onclick = () => {
  const candidates = project.objects.filter(object => object.type !== 'sketch');
  if (!candidates.length) { message('tool.createBeforeTransform'); return; }
  const source = candidates.find(object => selection.has(object.id))?.id ?? candidates.find(object => object.visible)?.id ?? candidates.at(-1).id;
  openTool(() => t('tool.transform'), () => `<label class="dialog-field full"><span>${t('field.sourcePiece')}</span><select name="source">${options(source, candidates)}</select></label>${['x','y','z','rx','ry','rz'].map(key => numericField(key, 0, key.startsWith('r') ? `${t(fieldKeys[key])} (°)` : `${t(`field.offset${key.toUpperCase()}`)} (mm)`)).join('')}`, () => t('tool.transformHint'), async data => {
    let id;
    const applied = await mutate((candidate) => {
      const params = Object.fromEntries([...data.entries()].map(([key,value]) => [key, key === 'source' ? value : Number(value)]));
      id = addObject(candidate, { type: 'transform', name: t('tool.transformDefault'), params }).id;
      updateObject(candidate, params.source, { visible: false });
    }, 'tool.transformed', { fit: true });
    if (applied) select(id);
  });
};

$('#tool-form').onsubmit = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  await toolAction?.(data);
  if ($('#message').classList.contains('error')) $('#tool-error').textContent = $('#message').textContent;
  else closeOperation();
};
$$('.close-dialog').forEach((button) => button.onclick = () => button.closest('dialog').close());
document.addEventListener('invalid', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.setCustomValidity(input.type === 'number'
    ? t('field.numberError', { min: input.min || t('field.minimum'), max: input.max || t('field.maximum') })
    : t('field.nameError'));
}, true);
document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('');
});
$('#help-button').onclick = () => $('#help-dialog').showModal();
$('#export-button').onclick = () => {
  if (!project.objects.some((object) => object.visible && object.type !== 'sketch')) { message('export.noVisibleSolids'); return; }
  $('#export-dialog').showModal();
};
$$('[data-export]').forEach((button) => button.onclick = async () => {
  $('#export-dialog').close();
  const token = ++operationToken;
  setBusy(true, 'Preparando el archivo', 'Exportando la geometría de las piezas visibles.');
  try {
    if (engine.failed) await engine.restart();
    const result = await engine.request('export', project, button.dataset.export);
    if (token !== operationToken) return;
    download(result.data, `${filename()}.${result.extension}`, result.mime);
    message(`Archivo ${result.extension.toUpperCase()} exportado.`);
  } catch (error) { if (token === operationToken) message(error.message, true); }
  finally { if (token === operationToken) setBusy(false); }
});
$('#save-project').onclick = () => { download(serializeDocument(project), `${filename()}.cad.json`, 'application/json'); message('Proyecto descargado con todas sus operaciones editables.'); };
$('#recover-project').onclick = () => download(recoveryProject, 'proyecto-anterior.cad.json', 'application/json');
$('#open-project').onclick = () => $('#file-input').click();
$('#file-input').onchange = async (event) => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || busy) return;
  const token = ++operationToken;
  const previousSelection = new Set(selection);
  setBusy(true, 'Abriendo archivo', 'Leyendo el archivo en este navegador.');
  try {
    if (file.size > DOCUMENT_LIMITS.payloadBytes) throw new Error('El archivo supera el límite de 40 MB.');
    const extension = file.name.split('.').at(-1).toLowerCase();
    let candidate;
    if (['json','cad'].includes(extension)) {
      const text = await file.text();
      if (token !== operationToken) return;
      candidate = parseDocument(text);
    }
    else if (['step','stp','stl'].includes(extension)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (token !== operationToken) return;
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      candidate = cloneDocument(project);
      const object = addObject(candidate, { name: file.name.slice(0, 100), type: 'import', params: { format: extension === 'stl' ? 'stl' : 'step', data: btoa(binary) } });
      selection = new Set([object.id]);
    } else throw new Error('Abre un proyecto JSON o una pieza STEP/STL.');
    const applied = await applyDocument(candidate, 'status.fileOpened', { fit: true, messageValues: { filename: file.name } });
    if (!applied) { selection = previousSelection; renderPanels(); viewport.setSelection(selection); }
  } catch (error) { if (token === operationToken) message(error.message, true); }
  finally { if (token === operationToken) { setBusy(false); renderPanels(); } }
};
$('#new-project').onclick = async () => { closeOperation(); selection.clear(); await applyDocument(createDocument(), 'Proyecto nuevo. Puedes deshacer para recuperar el anterior.', { fit: true }); };
$('#load-example').onclick = async () => { closeOperation(); selection.clear(); await applyDocument(createExampleDocument(), 'Ejemplo cargado: una placa con un agujero pasante.', { fit: true }); };
$('#document-name').onchange = () => mutate((candidate) => { candidate.name = $('#document-name').value.trim(); }, 'Nombre del proyecto actualizado.');

async function navigateHistory(direction) {
  if (busy || !(direction === 'undo' ? history.canUndo : history.canRedo)) return;
  closeOperation();
  const candidate = direction === 'undo' ? history.undo() : history.redo();
  const ok = await applyDocument(candidate, direction === 'undo' ? 'Operación deshecha.' : 'Operación rehecha.', { commit: false });
  if (!ok) { direction === 'undo' ? history.redo() : history.undo(); setBusy(false); }
}
$('#undo').onclick = () => navigateHistory('undo');
$('#redo').onclick = () => navigateHistory('redo');
function deleteSelected() {
  if (!selection.size || busy) return;
  mutate((candidate) => { candidate.objects.filter((object) => selection.has(object.id)).reverse().forEach((object) => removeObject(candidate, object.id)); }, 'Operación eliminada.');
}
$$('[data-view]').forEach((button) => button.onclick = () => viewport?.view(button.dataset.view));
$('#fit-view').onclick = () => viewport?.fit();
$('#grid-toggle').onclick = () => $('#grid-toggle').setAttribute('aria-pressed', String(viewport.toggleGrid()));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('dialog[open]') && !busy && (!$('#operation-form-panel').hidden || meshSession)) { closeOperation(); event.preventDefault(); return; }
  if (event.key === 'Escape' && !$('dialog[open]') && !busy && interactions?.escape()) { event.preventDefault(); return; }
  if (event.target.matches('input,select,textarea') || $('dialog[open]') || busy) return;
  if (interactions?.locked) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); navigateHistory(event.shiftKey ? 'redo' : 'undo'); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); navigateHistory('redo'); }
  else if (event.key.toLowerCase() === 'f') viewport?.fit();
  else if (event.key.toLowerCase() === 'g') interactions?.setMode('translate');
  else if (event.key.toLowerCase() === 'r') interactions?.setMode('rotate');
  else if (event.key === 'Delete') { event.preventDefault(); deleteSelected(); }
  else if (event.key === 'Escape') select(null);
});

function openSketch(object, stage = 'profile') { interactions?.editSketch(object, stage); }

onLocaleChange(() => {
  renderMessage();
  updateEngineStatus(engineStatusKey);
  $('#save-status').textContent = t(saveStatusKey);
  renderBusyLabels();
  $('#cancel-operation').textContent = t(retryMode ? 'status.retry' : 'status.cancelOperation');
  refreshLocalizedPanels();
  if (toolRenderer && !$('#operation-form-panel').hidden) toolRenderer();
  renderMeshLabels();
  if (currentMessage.error) $('#tool-error').textContent = $('#message').textContent;
  viewport?.renderer.domElement.setAttribute('aria-label', t(viewport.mode === 'sketch' ? 'canvas.sketchAria' : 'canvas.aria'));
  interactions?.refreshLabels();
});

$('#cancel-operation').onclick = async () => {
  ++operationToken;
  closeOperation();
  $('#cancel-operation').disabled = true;
  setBusy(true, 'Reiniciando el motor', 'La operación se ha detenido. Conservando el proyecto anterior.');
  try { await engine.restart(); message('Operación cancelada. El proyecto anterior se conserva.'); }
  catch (error) { message(error.message, true); }
  finally { $('#cancel-operation').disabled = false; setBusy(false); renderPanels(); }
};

async function start() {
  try {
    viewport = new CadViewport($('#viewport'), select);
    interactions = new CadInteractions(viewport, { project: () => project, geometry: () => geometry, selection: () => selection, busy: () => busy, operationActive: () => Boolean(toolAction || meshSession), renderElements, mutate, select, message, syncControls, closeOperation, showOperation });
    interactions.refreshLabels();
    engine = new EngineClient();
    renderPanels();
    setBusy(true, 'Preparando OpenCascade', 'El motor CAD se carga en tu navegador. La primera descarga puede tardar.');
    await engine.ready;
    let result;
    try { result = await engine.request('evaluate', project); }
    catch (error) {
      if (!savedProject || engine.failed) throw error;
      preserveRecovery(savedProject);
      project = createDocument('Proyecto recuperado');
      history.reset(project);
      result = await engine.request('evaluate', project);
      restoreNotice = 'La geometría guardada no se pudo reconstruir. Descarga la copia anterior o abre otro proyecto.';
    }
    geometry = result;
    viewport.setDocument(project, result); viewport.fit();
    setBusy(false); renderPanels();
    message(restoreNotice || 'Listo. Crea piezas o selecciona una operación para cambiar sus medidas.');
    saveLocal();
    window.cadReady = true;
    window.draftyDiagnostics = () => ({ ...viewport.metrics, engineRequests: engine.sequence, mode: viewport.mode, elements: viewport.elements.topology ? { id: viewport.elements.topology.id, kind: viewport.elements.kind, selected: [...viewport.elements.selected], edges: viewport.elements.edgeReferences().map(edge => edge.index) } : null, sketchProfile: viewport.sketchPlane ? structuredClone(viewport.pendingProfile) : null, camera: { fov: viewport.camera.fov, aspect: viewport.camera.aspect, position: viewport.camera.position.toArray(), target: viewport.controls.target.toArray(), up: viewport.camera.up.toArray() }, sketch: interactions.session ? { points: structuredClone(interactions.session.points), circle: structuredClone(interactions.session.circle), anchor: structuredClone(interactions.session.anchor), hover: structuredClone(interactions.session.hover), closed: interactions.session.closed, stage: interactions.session.stage } : null, geometries: viewport.renderer.info.memory.geometries, objects: project.objects.length, revisions: geometry.meshes.map(({ id, revision }) => ({ id, revision })) });
  } catch (error) {
    retryMode = true;
    busyText = { title: 'status.editorInitFailed', detail: error.message || 'status.webglRequired' };
    renderBusyLabels();
    $('#cancel-operation').hidden = false;
    $('#cancel-operation').textContent = t('status.retry');
    $('#cancel-operation').onclick = () => window.location.reload();
    updateEngineStatus('status.engineFailed');
    message(error.message, true);
  }
}
start();
