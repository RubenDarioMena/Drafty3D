import { showOperation } from './ui.js';
import { MESH_QUALITIES, MAX_MESH_TRIANGLES, recommendedMeshQuality, bytesToBase64 } from './mesh-quality.js';
import { CadViewport } from './viewport.js';
import { CadInteractions } from './interactions.js';
import { createDocument, createExampleDocument, validateDocument, addObject, updateObject, removeObject, cloneDocument, serializeDocument, parseDocument, CadHistory, DOCUMENT_LIMITS } from './document.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const labels = { box: 'Bloque', cylinder: 'Cilindro', sphere: 'Esfera', extrusion: 'Extrusión', boolean: 'Combinación', fillet: 'Redondeo', transform: 'Mover / girar', import: 'Pieza importada', mesh: 'Malla convertida' };
const icons = { box: '▱', cylinder: '◉', sphere: '◌', extrusion: '⌁', boolean: '⊖', fillet: '◜', transform: '✥', import: '↳', mesh: '◇' };
const fieldNames = { width: 'Ancho X', depth: 'Fondo Y', height: 'Altura Z', radius: 'Radio', x: 'Posición X', y: 'Posición Y', z: 'Posición Z', rx: 'Giro X', ry: 'Giro Y', rz: 'Giro Z' };
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

function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
}

function closeOperation() {
  meshSession = null;
  viewport?.clearMeshPreview();
  viewport?.setBlocked(busy);
  showOperation('properties');
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
  const level = Number($('#mesh-quality').value);
  $('#mesh-quality-label').textContent = MESH_QUALITIES[level].label;
  $('#mesh-estimate').textContent = 'Previsualiza esta resolución para comprobar sus triángulos y rendimiento.';
  $('#mesh-error').textContent = '';
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
  $('#mesh-source-name').textContent = object.name;
  $('#mesh-quality').max = '4'; $('#mesh-quality').value = '1';
  $('#mesh-quality-label').textContent = MESH_QUALITIES[1].label;
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
    $('#mesh-performance').textContent = `${milliseconds.toFixed(1)} ms por dibujo y selección medidos · máximo recomendado: ${MESH_QUALITIES[maximum].label}. La recomendación cambia con la escena; no garantiza una tasa de imágenes constante.`;
    if (quality > maximum) {
      lowerQuality = maximum;
      message('Ajustando la resolución al rendimiento medido de esta escena.');
      return;
    }
    if (milliseconds > 40 || otherTriangles + result.triangles > MAX_MESH_TRIANGLES) throw new Error('La escena es demasiado pesada para una edición fluida. Oculta otras piezas o reduce la resolución.');
    session.result = result;
    $('#mesh-estimate').textContent = `${result.triangles.toLocaleString('es-MX')} triángulos · desviación ${result.deflection.toLocaleString('es-MX', { maximumFractionDigits: 4 })} mm. Vista previa lista.`;
    message('Vista previa de malla lista. Confirma la conversión o cancela para volver al CAD.');
  } catch (error) {
    if (token === operationToken) {
      viewport.clearMeshPreview();
      $('#mesh-error').textContent = error.message;
      message(error.message, true);
    }
  } finally {
    if (token === operationToken) {
      setBusy(false);
      if (lowerQuality !== null) {
        $('#mesh-quality').value = String(lowerQuality);
        $('#mesh-quality-label').textContent = MESH_QUALITIES[lowerQuality].label;
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
        $('#engine-status').innerHTML = '<i class="status-dot"></i>OpenCascade · listo';
      } else if (data.type === 'progress') {
        if (data.message) $('#loading-detail').textContent = data.message;
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
    $('#engine-status').textContent = 'Motor detenido';
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

function setBusy(value, title = 'Calculando la pieza', detail = 'OpenCascade está reconstruyendo los sólidos con tus medidas.') {
  busy = value;
  syncControls();
  viewport?.setBlocked(value || Boolean(meshSession));
  $('#loading-overlay').hidden = !value;
  $('#loading-title').textContent = title;
  $('#loading-detail').textContent = detail;
  $('#cancel-operation').hidden = !value || title === 'Preparando OpenCascade';
}

function syncControls() {
  const locked = busy || interactions?.locked || Boolean(meshSession);
  $$('[data-edit], #inspector-content input, #inspector-content button, #inspector-content select, .object-select, .visibility-button, [data-interaction], #transform-snap, [data-plane], #pick-face').forEach((element) => { element.disabled = Boolean(locked); });
  $('#document-name').disabled = Boolean(locked);
  $$('#tool-form input, #tool-form select, #tool-form button').forEach(element => { element.disabled = Boolean(locked); });
  $$('#mesh-panel button, #mesh-panel input').forEach(element => { element.disabled = busy; });
  $('#mesh-confirm').disabled = Boolean(busy || !meshSession?.result);
  const selectedMesh = geometry.meshes.find(mesh => selection.has(mesh.id));
  $('#mesh-button').disabled = Boolean(locked || selection.size !== 1 || selectedMesh?.isMesh || !selectedMesh?.solidCount || !project.objects.find(object => selection.has(object.id))?.visible);
  $('#mesh-button').title = 'Selecciona un sólido CAD visible. La malla conservará el original oculto.';
  $('#undo').disabled = locked || !history.canUndo;
  $('#redo').disabled = locked || !history.canRedo;
  $$('#sketch-panel button, #sketch-panel input, #sketch-panel select').forEach((element) => { element.disabled = busy; });
  if (interactions?.session && !busy) { interactions.session.draw(); $('#sketch-effect').disabled = Boolean(interactions.session.object); }
}

function saveLocal() {
  try {
    if (recoveryProject && !recoveryPersisted) throw new Error('La copia de recuperación no cabe en el navegador.');
    localStorage.setItem(storageKey, serializeDocument(project));
    $('#save-status').textContent = 'Guardado en este navegador';
  } catch {
    $('#save-status').textContent = 'Descarga el proyecto para conservarlo';
    message('El navegador no pudo guardar el proyecto localmente. Usa Guardar archivo para conservarlo.', true);
  }
}

function select(id, multiple = false) {
  if (busy || interactions?.locked) return;
  closeOperation();
  if (!multiple) selection.clear();
  if (id) {
    if (multiple && selection.has(id)) selection.delete(id);
    else selection.add(id);
  }
  renderPanels();
  viewport.setSelection(selection);
}

function renderPanels() {
  const validIds = new Set(project.objects.map((object) => object.id));
  selection = new Set([...selection].filter((id) => validIds.has(id)));
  $('#document-name').value = project.name;
  const visibleMeshes = geometry.meshes.filter(mesh => project.objects.find(object => object.id === mesh.id)?.visible);
  $('#scene-stats').textContent = `${visibleMeshes.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0).toLocaleString('es-MX')} triángulos`;
  $('#object-count').textContent = `${project.objects.filter((object) => object.visible).length} visibles`;
  $('#empty-tree').hidden = project.objects.length > 0;
  $('#viewport-empty').hidden = project.objects.some((object) => object.visible);
  $('#object-list').innerHTML = project.objects.map((object) => `<div class="object-row ${selection.has(object.id) ? 'selected' : ''} ${object.visible ? '' : 'source'}"><button class="object-select" data-id="${object.id}" title="${escape(object.name)}" ${busy ? 'disabled' : ''}><span class="node-icon" aria-hidden="true">${icons[object.type]}</span><span class="node-name">${escape(object.name)}</span><span class="type-badge">${geometry.meshes.find(mesh => mesh.id === object.id)?.isMesh ? 'MALLA' : 'CAD'}</span></button><button class="visibility-button" data-visible="${object.id}" title="${object.visible ? 'Ocultar' : 'Mostrar'} ${escape(object.name)}" aria-label="${object.visible ? 'Ocultar' : 'Mostrar'} ${escape(object.name)}" ${busy ? 'disabled' : ''}>${object.visible ? '◉' : '○'}</button></div>`).join('');
  $$('.object-select').forEach((button) => button.onclick = (event) => select(button.dataset.id, event.ctrlKey || event.metaKey || event.shiftKey));
  $$('.visibility-button').forEach((button) => button.onclick = () => mutate((candidate) => {
    const object = candidate.objects.find((item) => item.id === button.dataset.visible);
    updateObject(candidate, object.id, { visible: !object.visible });
  }, 'Visibilidad actualizada.'));
  const object = project.objects.find((item) => selection.has(item.id));
  $('#selection-label').textContent = selection.size > 1 ? `${selection.size} operaciones seleccionadas` : object?.name ?? project.name;
  $('#inspector-kind').textContent = selection.size === 1 ? labels[object.type].toUpperCase() : 'SELECCIÓN';
  const inspector = $('#inspector-content');
  if (selection.size !== 1) {
    inspector.innerHTML = `<div class="inspector-empty"><span class="large-icon">${selection.size ? '⊖' : '◈'}</span><h3>${selection.size ? 'Combina tus piezas' : 'Diseña con medidas'}</h3><p>${selection.size ? 'Usa Combinar para unir, restar o intersectar las piezas seleccionadas.' : 'Selecciona una pieza para cambiar sus dimensiones. También puedes editar las operaciones anteriores de la lista.'}</p><p>Los sólidos se calculan con OpenCascade. Todas las distancias están en milímetros.</p></div>`;
    syncControls();
    return;
  }
  const dimensions = Object.keys(object.params).filter((key) => ['width', 'depth', 'height', 'radius'].includes(key));
  const position = Object.keys(object.params).filter((key) => ['x', 'y', 'z', 'rx', 'ry', 'rz'].includes(key));
  const field = (key) => `<div class="field-row"><label for="param-${key}">${object.type === 'transform' && ['x','y','z'].includes(key) ? `Desplazamiento ${key.toUpperCase()}` : object.type === 'extrusion' && key === 'height' ? 'Profundidad' : fieldNames[key]}</label><div class="number-unit"><input id="param-${key}" name="${key}" type="number" step="any" value="${object.params[key]}" ${dimensions.includes(key) ? `min="${DOCUMENT_LIMITS.minimumDimension}" max="${DOCUMENT_LIMITS.dimension}"` : 'min="-1000000" max="1000000"'} required ${busy ? 'disabled' : ''} /><span>${key.startsWith('r') && key !== 'radius' ? '°' : 'mm'}</span></div></div>`;
  const references = object.type === 'boolean' ? [object.params.left, object.params.right] : object.params.source ? [object.params.source] : object.params.support ? [object.params.support.source] : [];
  const volume = geometry.meshes.find((mesh) => mesh.id === object.id)?.volume;
  inspector.innerHTML = `<form id="properties-form"><div class="section-label">PIEZA</div><input name="name" class="field-input name-field" aria-label="Nombre de la pieza" maxlength="100" value="${escape(object.name)}" required ${busy ? 'disabled' : ''}/>${dimensions.length ? `<div class="section-label">DIMENSIONES</div>${dimensions.map(field).join('')}` : ''}${position.length ? `<div class="section-label">${object.type === 'transform' ? 'DESPLAZAMIENTO Y ROTACIÓN' : 'POSICIÓN'}</div>${position.map(field).join('')}` : ''}${object.type === 'boolean' ? `<div class="section-label">OPERACIÓN</div><select name="operation" aria-label="Tipo de combinación" ${busy ? 'disabled' : ''}>${[['cut','Restar B a A'],['fuse','Unir A y B'],['common','Intersección']].map(([value,label]) => `<option value="${value}" ${object.params.operation === value ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}<div class="section-label">APARIENCIA</div><div class="field-row"><label for="piece-color">Color</label><input type="color" id="piece-color" name="color" value="${object.color}" ${busy ? 'disabled' : ''}/></div><button class="button primary" type="submit" ${busy ? 'disabled' : ''}>Aplicar cambios</button></form>${references.length ? `<div class="section-label">PIEZAS DE ORIGEN</div><div class="dependency-list">${references.map((id) => escape(project.objects.find((item) => item.id === id)?.name ?? id)).join('<br>')}</div><p class="inspector-note">Puedes cambiar las medidas de las piezas de origen. Esta operación se reconstruirá automáticamente.</p>` : ''}${object.type === 'extrusion' ? '<div class="inspector-actions"><button id="edit-profile" class="button">Editar perfil</button></div>' : ''}${Number.isFinite(volume) ? `<div class="stats-card"><span>VOLUMEN DEL SÓLIDO</span><strong>${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(volume)} <small>mm³</small></strong></div>` : ''}<div class="inspector-actions"><button id="delete-piece" class="button subtle danger" ${busy ? 'disabled' : ''}>Eliminar operación</button></div>`;
  $('#properties-form').onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = {};
    [...dimensions, ...position].forEach((key) => params[key] = Number(data.get(key)));
    if (object.type === 'boolean') params.operation = data.get('operation');
    mutate((candidate) => updateObject(candidate, object.id, { name: String(data.get('name')).trim(), color: data.get('color'), params }), 'Medidas actualizadas.');
  };
  if (geometry.meshes.find(mesh => mesh.id === object.id)?.isMesh) {
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.textContent = 'Malla independiente: puedes moverla, girarla y exportarla a STL. Sus triángulos no conservan las operaciones paramétricas del CAD. La edición de vértices llegará en una etapa posterior.';
    $('#properties-form').after(note);
  }
  $('#delete-piece').onclick = deleteSelected;
  if ($('#edit-profile')) $('#edit-profile').onclick = () => openSketch(object);
  syncControls();
}

async function applyDocument(candidate, text, { fit = false, commit = true } = {}) {
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
    message(text);
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

async function mutate(change, text = 'Proyecto actualizado.', options = {}) {
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
function numericField(key, value, label = fieldNames[key], positive = false) { return `<label class="dialog-field">${label}<input name="${key}" type="number" step="any" value="${value}" ${positive ? `min="${DOCUMENT_LIMITS.minimumDimension}" max="${DOCUMENT_LIMITS.dimension}"` : 'min="-1000000" max="1000000"'} required /></label>`; }
function options(selectedId) { return project.objects.map((object) => `<option value="${object.id}" ${object.id === selectedId ? 'selected' : ''}>${escape(object.name)}${object.visible ? '' : ' (origen)'}</option>`).join(''); }
function openTool(title, fields, note, action) {
  if (busy) return;
  $('#tool-title').textContent = title;
  $('#tool-fields').innerHTML = `<div class="dialog-fields">${fields}</div>`;
  $('#tool-note').textContent = note;
  closeOperation();
  toolAction = action;
  $('#tool-error').textContent = '';
  showOperation('tool');
  $('#operation-content').scrollTop = 0;
  $('#tool-form input, #tool-form select')?.focus();
}

$$('[data-create]').forEach((button) => button.onclick = () => {
  const type = button.dataset.create;
  const defaults = { box: { width: 30, depth: 20, height: 10 }, cylinder: { radius: 8, height: 20 }, sphere: { radius: 12 } }[type];
  const fields = Object.entries(defaults).map(([key,value]) => numericField(key, value, `${fieldNames[key]} (mm)`, true)).join('') + ['x','y','z'].map((key) => numericField(key, 0, `${fieldNames[key]} (mm)`)).join('');
  openTool(`Crear ${labels[type].toLowerCase()}`, fields, type === 'box' ? 'La posición corresponde a la esquina inferior del bloque.' : 'La posición corresponde al centro de la esfera o a la base del cilindro.', async (data) => {
    const params = Object.fromEntries([...data.entries()].map(([key,value]) => [key, Number(value)]));
    let id;
    const applied = await mutate((candidate) => { id = addObject(candidate, { type, params }).id; }, `${labels[type]} creado.`, { fit: true });
    if (applied) select(id);
  });
});

$('#boolean-button').onclick = () => {
  if (project.objects.length < 2) { message('Crea dos piezas para combinarlas.'); return; }
  const ids = [...selection];
  const visible = project.objects.filter((object) => object.visible);
  const left = ids[0] ?? visible[0]?.id ?? project.objects[0].id;
  const right = ids[1] ?? visible.find((object) => object.id !== left)?.id ?? project.objects.find((object) => object.id !== left).id;
  openTool('Combinar piezas', `<label class="dialog-field full">Operación<select name="operation"><option value="cut">Restar B a A</option><option value="fuse">Unir A y B</option><option value="common">Intersección de A y B</option></select></label><label class="dialog-field full">Pieza A<select name="left">${options(left)}</select></label><label class="dialog-field full">Pieza B<select name="right">${options(right)}</select></label>`, 'Las piezas de origen se ocultarán y seguirán disponibles para cambiar sus medidas.', async (data) => {
    let id;
    const applied = await mutate((candidate) => {
      const params = Object.fromEntries(data);
      id = addObject(candidate, { type: 'boolean', name: { cut: 'Corte', fuse: 'Unión', common: 'Intersección' }[params.operation], params }).id;
      updateObject(candidate, params.left, { visible: false });
      updateObject(candidate, params.right, { visible: false });
    }, 'Combinación creada.', { fit: true });
    if (applied) select(id);
  });
};

$('#fillet-button').onclick = () => {
  if (!project.objects.length) { message('Crea una pieza antes de redondearla.'); return; }
  const source = [...selection][0] ?? project.objects.find((object) => object.visible)?.id ?? project.objects.at(-1).id;
  openTool('Redondear aristas', `<label class="dialog-field full">Pieza<select name="source">${options(source)}</select></label>${numericField('radius', 1, 'Radio (mm)', true)}`, 'Se intenta redondear todas las aristas compatibles. Un radio demasiado grande puede no formar un sólido válido.', async (data) => {
    let id;
    const applied = await mutate((candidate) => {
      id = addObject(candidate, { type: 'fillet', params: { source: data.get('source'), radius: Number(data.get('radius')) } }).id;
      updateObject(candidate, data.get('source'), { visible: false });
    }, 'Redondeo creado.');
    if (applied) select(id);
  });
};

$('#transform-button').onclick = () => {
  if (!project.objects.length) { message('Crea una pieza antes de moverla.'); return; }
  const source = [...selection][0] ?? project.objects.find((object) => object.visible)?.id ?? project.objects.at(-1).id;
  openTool('Mover / girar una pieza', `<label class="dialog-field full">Pieza<select name="source">${options(source)}</select></label>${['x','y','z','rx','ry','rz'].map((key) => numericField(key, 0, `${key.startsWith('r') ? fieldNames[key] + ' (°)' : 'Desplazamiento ' + key.toUpperCase() + ' (mm)'}`)).join('')}`, 'Rotaciones alrededor del origen: X, Y y Z; después se aplica el desplazamiento.', async (data) => {
    let id;
    const applied = await mutate((candidate) => {
      const params = Object.fromEntries([...data.entries()].map(([key,value]) => [key, key === 'source' ? value : Number(value)]));
      id = addObject(candidate, { type: 'transform', params }).id;
      updateObject(candidate, params.source, { visible: false });
    }, 'Pieza transformada.', { fit: true });
    if (applied) select(id);
  });
};

$('#tool-form').onsubmit = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  await toolAction?.(data);
  if ($('#message').classList.contains('error')) $('#tool-error').textContent = $('#message').textContent;
  else showOperation('properties');
};
$$('.close-dialog').forEach((button) => button.onclick = () => button.closest('dialog').close());
document.addEventListener('invalid', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.setCustomValidity(input.type === 'number'
    ? `Introduce un número válido entre ${input.min || 'el mínimo permitido'} y ${input.max || 'el máximo permitido'}.`
    : 'Completa este campo con un nombre válido.');
}, true);
document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('');
});
$('#help-button').onclick = () => $('#help-dialog').showModal();
$('#export-button').onclick = () => {
  if (!project.objects.some((object) => object.visible)) { message('Muestra al menos una pieza para exportar.'); return; }
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
    const applied = await applyDocument(candidate, `Archivo «${file.name}» abierto.`, { fit: true });
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

function openSketch(object) { interactions?.editSketch(object); }

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
    interactions = new CadInteractions(viewport, { project: () => project, geometry: () => geometry, selection: () => selection, busy: () => busy, mutate, select, message, syncControls, closeOperation, showOperation });
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
    window.draftyDiagnostics = () => ({ ...viewport.metrics, engineRequests: engine.sequence, geometries: viewport.renderer.info.memory.geometries, objects: project.objects.length, revisions: geometry.meshes.map(({ id, revision }) => ({ id, revision })) });
  } catch (error) {
    $('#loading-title').textContent = 'No se pudo iniciar el editor';
    $('#loading-detail').textContent = error.message || 'Este navegador necesita WebGL 2 y WebAssembly. Prueba una versión reciente de Edge, Chrome o Firefox.';
    $('#cancel-operation').hidden = false;
    $('#cancel-operation').textContent = 'Reintentar';
    $('#cancel-operation').onclick = () => window.location.reload();
    $('#engine-status').textContent = 'Editor sin iniciar';
    message(error.message, true);
  }
}
start();
