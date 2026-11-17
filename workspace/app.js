import { connectEditor, downloadFile, editors, extension } from './editors.js';
import { getCloud, maxBackupBytes, projectStore } from './storage.js';

const $ = id => document.getElementById(id);
const state = { client: null, user: null, store: null, projects: [], project: null, filesRequest: 0, editor: null };
let activeHistory;
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const formatNames = { json: 'JSON editable', step: 'STEP', stl: 'STL', sgl: 'SGL editable', obj: 'OBJ', ply: 'PLY', svg: 'SVG' };

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function action(label, run, className = 'button small') {
  const button = element('button', label, className);
  button.type = 'button';
  button.addEventListener('click', () => run(button));
  return button;
}

function message(id, value = '', error = false) {
  const node = $(id);
  node.textContent = value;
  node.classList.toggle('error', error);
  node.hidden = !value;
}

function errorText(error) {
  if (error.code === '40001') return 'Hay una versión más reciente. Descarga una copia de este trabajo, vuelve al proyecto y abre la última versión.';
  return ({
    filename: 'Usa un nombre de archivo válido de hasta 180 caracteres.',
    filesize: 'Cada archivo debe medir más de 0 bytes y hasta 50 MiB.',
    openFile: 'SolidCraft no pudo abrir este archivo. Descarga el original desde el proyecto para revisarlo.',
    loading: 'El editor no terminó de cargar. Vuelve a Proyectos y ábrelo de nuevo.',
    timeout: 'El editor tardó demasiado. Intenta de nuevo.',
    invalid_credentials: 'Correo o contraseña incorrectos.',
    email_not_confirmed: 'El correo de esta cuenta todavía no está confirmado.',
    over_request_rate_limit: 'Espera un momento y vuelve a intentarlo.',
  })[error.code || error.message] || 'No se pudo completar la operación. Intenta de nuevo.';
}

async function run(button, status, callback) {
  button.disabled = true;
  message(status);
  try {
    await callback();
  } catch (error) {
    message(status, errorText(error), true);
  } finally {
    button.disabled = false;
  }
}

function show(id) {
  const dialog = $(id);
  for (const status of dialog.querySelectorAll('.status')) message(status.id);
  dialog.showModal();
}

function onSubmit(id, status, callback) {
  $(id).addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const dialog = form.closest('dialog');
    const data = new FormData(form);
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    dialog.dataset.pending = 'true';
    form.querySelector('[data-close]').disabled = true;
    await run(submit, status, () => callback(dialog, data));
    delete dialog.dataset.pending;
    form.querySelector('[data-close]').disabled = false;
  });
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    if (dialog.dataset.pending) event.preventDefault();
  });
}

function renderProjects() {
  $('project-empty').hidden = state.projects.length > 0;
  let empty = 'Configura Supabase para guardar tus proyectos.';
  if (state.user) empty = 'Crea un proyecto para empezar.';
  else if (state.client) empty = 'Inicia sesión para acceder a tus proyectos.';
  $('project-empty').textContent = empty;
  $('new-project').hidden = !state.user;
  const items = state.projects.map(project => {
    const listItem = element('li');
    const button = action(project.name, () => selectProject(project), 'button project-option');
    button.setAttribute('aria-current', String(state.project?.id === project.id));
    listItem.append(button);
    return listItem;
  });
  $('projects').replaceChildren(...items);
}

function fileDescription(file) {
  const size = file.size_bytes >= 1024 ** 2
    ? `${(file.size_bytes / 1024 ** 2).toFixed(1)} MiB`
    : `${Math.max(1, Math.ceil(file.size_bytes / 1024))} KiB`;
  return `Versión ${file.version_number} · ${size} · ${dateFormat.format(new Date(file.created_at))}`;
}

function fileItem(name, detail, buttons) {
  const item = element('li');
  const info = element('div');
  const actions = element('div', '', 'actions');
  info.append(element('p', name, 'file-title'), element('p', detail, 'file-detail'));
  actions.append(...buttons);
  item.append(info, actions);
  return item;
}

function renderFiles(files) {
  $('files-empty').hidden = files.length > 0;
  if (!files.length) $('files-empty').textContent = 'Sube un original o crea un archivo con un editor.';
  $('files').replaceChildren(...files.map(file => {
    const buttons = Object.entries(editors)
      .filter(([, editor]) => editor.accepts.includes(extension(file.name)))
      .map(([tool, editor]) => action(`Abrir en ${editor.name}`, () => openEditor(tool, file), 'button small primary'));
    buttons.push(
      action('Descargar', button => downloadVersion(button, file, file.name, 'dashboard-status')),
      action('Versiones', () => showHistory(file)),
    );
    return fileItem(file.name, fileDescription(file), buttons);
  }));
}

async function selectProject(project) {
  const request = ++state.filesRequest;
  state.project = project;
  renderProjects();
  $('files').replaceChildren();
  $('files-heading').textContent = project?.name || 'Archivos';
  $('project-actions').hidden = !project;
  $('files-empty').hidden = false;
  $('files-empty').textContent = project ? 'Cargando archivos…' : 'Selecciona un proyecto para ver sus archivos.';
  if (!project) return;
  try {
    const files = await state.store.listFiles(project);
    if (request === state.filesRequest) renderFiles(files);
  } catch (error) {
    if (request !== state.filesRequest) return;
    $('files-empty').textContent = 'Vuelve a seleccionar este proyecto para reintentar.';
    message('dashboard-status', errorText(error), true);
  }
}

async function refreshProjects(preferredId = state.project?.id) {
  const store = state.store;
  const projects = await store.listProjects();
  if (state.store !== store) return;
  state.projects = projects;
  await selectProject(projects.find(project => project.id === preferredId) ?? projects[0] ?? null);
}

function setAccount(user) {
  state.user = user;
  state.store = user ? projectStore(state.client, user.id) : null;
  state.projects = [];
  $('account-email').textContent = user?.email ?? '';
  $('account-email').hidden = !user;
  $('sign-in').hidden = Boolean(user);
  $('sign-out').hidden = !user;
  message('dashboard-status');
  if (!user && state.editor) {
    state.editor.project = null;
    state.editor.file = null;
    updateEditorActions();
  }
  return selectProject(null);
}

$('sign-in').addEventListener('click', () => show('login'));
$('login').addEventListener('close', () => $('login-form').reset());
onSubmit('login-form', 'login-status', async (dialog, data) => {
  const email = data.get('email').trim();
  const password = data.get('password');
  $('login-form').elements.password.value = '';
  const { data: auth, error } = await state.client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  dialog.close();
  await setAccount(auth.user);
  try {
    await refreshProjects();
  } catch (error) {
    message('dashboard-status', errorText(error), true);
  }
});

$('sign-out').addEventListener('click', async () => {
  const button = $('sign-out');
  button.disabled = true;
  try {
    const { error } = await state.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await setAccount(null);
  } catch {
    // A failed remote revocation still ends this document's in-memory session.
    location.reload();
  } finally {
    button.disabled = false;
  }
});

for (const id of ['new-project', 'rename-project']) {
  $(id).addEventListener('click', () => {
    const rename = id === 'rename-project';
    $('project-form').dataset.project = rename ? state.project.id : '';
    $('project-form').elements.name.value = rename ? state.project.name : '';
    $('project-dialog-title').textContent = rename ? 'Renombrar proyecto' : 'Nuevo proyecto';
    show('project-dialog');
  });
}
onSubmit('project-form', 'project-status', async (dialog, data) => {
  const name = data.get('name').trim();
  if (!name) return message('project-status', 'Escribe un nombre para el proyecto.', true);
  const id = $('project-form').dataset.project;
  const project = id ? await state.store.renameProject(id, name) : await state.store.createProject(name);
  dialog.close();
  await refreshProjects(project.id).catch(error => message('dashboard-status', errorText(error), true));
});

$('upload').addEventListener('click', () => $('files-input').click());
$('files-input').addEventListener('change', () => {
  const files = [...$('files-input').files];
  $('files-input').value = '';
  const { project, store } = state;
  if (!files.length || !store || !project) return;
  void run($('upload'), 'dashboard-status', async () => {
    let saved = 0;
    const failures = [];
    for (const file of files) {
      if (state.store !== store) return;
      try {
        await store.save(project, file, file.name);
        saved++;
      } catch (error) {
        failures.push(`${file.name} · ${errorText(error)}`);
      }
    }
    if (state.store !== store) return;
    if (state.project?.id === project.id) await selectProject(project);
    const done = saved === 1 ? 'Se guardó 1 archivo.' : `Se guardaron ${saved} archivos.`;
    message('dashboard-status', [done, ...failures].join(' '), Boolean(failures.length));
  });
});

$('new-note').addEventListener('click', () => show('note-dialog'));
onSubmit('note-form', 'note-status', async (dialog, data) => {
  const name = data.get('name').trim();
  const body = data.get('body');
  if (!name || !body.trim()) return message('note-status', 'Escribe un título y el contenido de la nota.', true);
  const project = state.project;
  await state.store.save(project, new Blob([body]), withExtension(name, 'md'));
  dialog.close();
  $('note-form').reset();
  await selectProject(project);
  message('dashboard-status', 'Nota guardada.');
});

async function downloadVersion(button, version, name, status) {
  await run(button, status, async () => {
    const store = state.store;
    const blob = await store.download(version);
    if (state.store === store) downloadFile(blob, name);
  });
}

async function refreshHistory(history) {
  const versions = await history.store.listVersions(history.file);
  if (activeHistory !== history || state.store !== history.store) return;
  history.file.latest_version_id = versions[0]?.id ?? history.file.latest_version_id;
  $('upload-version').disabled = false;
  $('versions').replaceChildren(...versions.map(version => {
    const buttons = [action('Descargar', button => downloadVersion(button, version, history.file.name, 'history-status'))];
    if (version.id !== history.file.latest_version_id) {
      buttons.push(action('Restaurar', () => saveHistoryVersion(() => history.store.download(version))));
    }
    return fileItem(
      version.version_number === 1 ? 'Original' : `Versión ${version.version_number}`,
      fileDescription(version), buttons,
    );
  }));
  message('history-status');
}

async function showHistory(file) {
  const history = activeHistory = { file, project: state.project, store: state.store, busy: false };
  $('history-title').textContent = `Versiones de ${file.name}`;
  $('versions').replaceChildren();
  $('upload-version').disabled = true;
  show('history');
  message('history-status', 'Cargando versiones…');
  try {
    await refreshHistory(history);
  } catch (error) {
    if (activeHistory === history) message('history-status', errorText(error), true);
  }
}

async function saveHistoryVersion(getBlob) {
  const history = activeHistory;
  if (!history || history.busy) return;
  history.busy = true;
  const controls = [...$('history').querySelectorAll('button')];
  for (const control of controls) control.disabled = true;
  $('history').dataset.pending = 'true';
  try {
    message('history-status', 'Guardando versión…');
    const blob = await getBlob();
    history.file = await history.store.save(history.project, blob, history.file.name, history.file);
    if (state.store !== history.store) return;
    await Promise.all([refreshHistory(history), selectProject(history.project)]);
    message('history-status', 'Se guardó una nueva versión. El original sigue en el historial.');
  } catch (error) {
    message('history-status', errorText(error), true);
  } finally {
    history.busy = false;
    delete $('history').dataset.pending;
    for (const control of controls) control.disabled = false;
  }
}

$('history').addEventListener('close', () => { activeHistory = null; });
$('upload-version').addEventListener('click', () => $('version-input').click());
$('version-input').addEventListener('change', () => {
  const [upload] = $('version-input').files;
  $('version-input').value = '';
  if (!upload || !activeHistory) return;
  if (extension(upload.name) !== extension(activeHistory.file.name)) {
    return message('history-status', 'La nueva versión debe usar la misma extensión que el original.', true);
  }
  void saveHistoryVersion(() => upload);
});

$('backup').addEventListener('click', () => run($('backup'), 'dashboard-status', async () => {
  const { project, store } = state;
  const versions = await store.projectVersions(project);
  if (versions.reduce((total, version) => total + version.size_bytes, 0) > maxBackupBytes) {
    message('dashboard-status', 'Este respaldo supera 128 MiB. Descarga los archivos desde su historial.', true);
    return;
  }
  message('dashboard-status', 'Preparando respaldo…');
  const { zip, strToU8 } = await import('fflate');
  const contents = {};
  const manifest = { project, files: [] };
  for (const version of versions) {
    if (state.store !== store) return;
    const { name } = version.design_files;
    const filename = name === '.' || name === '..' ? 'archivo' : name;
    const path = `${version.file_id}/v${version.version_number}/${filename}`;
    contents[path] = new Uint8Array(await (await store.download(version)).arrayBuffer());
    manifest.files.push({ name, path, version: version.version_number, createdAt: version.created_at });
  }
  contents['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const bytes = await new Promise((resolve, reject) => {
    zip(contents, { level: 0 }, (error, data) => error ? reject(error) : resolve(data));
  });
  if (state.store !== store) return;
  downloadFile(new Blob([bytes]), withExtension(project.name.replace(/[\\/]/g, '-'), 'zip'));
  message('dashboard-status', 'Respaldo preparado.');
}));

function updateEditorActions() {
  const context = state.editor;
  if (!context) return;
  $('format').disabled = context.busy || !context.ready;
  $('back').disabled = context.busy;
  $('editor-download').disabled = context.busy || !context.ready;
  $('editor-save').hidden = !state.user;
  $('editor-save').disabled = context.busy || !context.ready || !state.projects.length;
  $('editor-save').title = state.projects.length ? '' : 'Crea un proyecto para guardar el archivo.';
}

async function openEditor(tool, file = null) {
  if (state.editor) return;
  const settings = editors[tool];
  const frame = document.createElement('iframe');
  frame.title = settings.name;
  frame.allow = 'fullscreen';
  if (settings.isolated) frame.setAttribute('sandbox', 'allow-scripts allow-downloads allow-modals');
  const language = document.documentElement.lang;
  frame.src = settings.isolated ? `${settings.url}?lang=${language}` : settings.url;

  const controller = new AbortController();
  const context = {
    tool, file, project: state.project, controller,
    ready: false, busy: false, dirty: !file, edits: 0,
    focus: document.activeElement,
  };
  context.bridge = connectEditor(frame, tool, () => {
    context.dirty = true;
    context.edits++;
  }, controller.signal);
  state.editor = context;
  $('editor-title').textContent = settings.name;
  $('editor-document').textContent = file?.name || 'Documento nuevo';
  $('format').replaceChildren(...settings.formats.map(format => new Option(formatNames[format], format)));
  if (file && settings.formats.includes(extension(file.name))) $('format').value = extension(file.name);
  setEditorVisible(true);
  $('back').focus();
  updateEditorActions();
  message('editor-status', 'Cargando editor…');
  $('editor-frame').replaceChildren(frame);

  try {
    const original = file ? state.store.download(file) : Promise.resolve(null);
    const [, blob] = await Promise.all([context.bridge.ready(), original]);
    if (controller.signal.aborted) return;
    if (file) {
      await context.bridge.open(blob, extension(file.name), file.name);
      if (controller.signal.aborted) return;
      context.dirty = false;
    }
    context.ready = true;
    updateEditorActions();
    message('editor-status');
  } catch (error) {
    if (controller.signal.aborted) return;
    message('editor-status', errorText(error), true);
  }
}

for (const button of document.querySelectorAll('[data-editor]')) {
  button.addEventListener('click', () => openEditor(button.dataset.editor));
}

function setEditorVisible(visible) {
  $('editor').hidden = !visible;
  for (const id of ['dashboard', 'topbar', 'footer']) $(id).hidden = visible;
}

function closeEditor() {
  const context = state.editor;
  context.controller.abort();
  $('editor-frame').replaceChildren();
  state.editor = null;
  setEditorVisible(false);
  context.focus?.focus();
  if (state.project) void selectProject(state.project);
}

$('back').addEventListener('click', () => {
  const context = state.editor;
  if (!context.ready || !context.dirty) return closeEditor();
  $('leave-dialog').returnValue = '';
  show('leave-dialog');
});
$('leave-dialog').addEventListener('close', () => {
  if ($('leave-dialog').returnValue === 'leave') closeEditor();
});
window.addEventListener('beforeunload', event => {
  if (state.editor?.ready && (state.editor.dirty || state.editor.busy)) {
    event.preventDefault();
    event.returnValue = true;
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});

function withExtension(name, format) {
  return extension(name) === format ? name : `${name}.${format}`;
}

function suggestedName(context, format) {
  const stem = context.file ? context.file.name.replace(/\.[a-z0-9]+$/i, '') : editors[context.tool].name;
  return withExtension(stem, format);
}

async function editorOperation(status, callback) {
  const context = state.editor;
  context.busy = true;
  updateEditorActions();
  message(status, 'Preparando archivo…');
  try {
    const capturedEdits = context.edits;
    const format = $('format').value;
    const blob = await context.bridge.export(format);
    await callback(context, blob, format);
    if (capturedEdits === context.edits && format === editors[context.tool].formats[0]) context.dirty = false;
  } finally {
    context.busy = false;
    updateEditorActions();
  }
}

$('editor-download').addEventListener('click', async () => {
  try {
    await editorOperation('editor-status', (context, blob, format) => {
      downloadFile(blob, suggestedName(context, format));
      message('editor-status', 'Archivo preparado para descargar.');
    });
  } catch (error) {
    message('editor-status', errorText(error), true);
  }
});

$('editor-save').addEventListener('click', () => {
  const context = state.editor;
  const format = $('format').value;
  const update = context.file && extension(context.file.name) === format;
  $('save-project').replaceChildren(...state.projects.map(project => new Option(project.name, project.id)));
  $('save-project').value = context.project?.id ?? state.projects[0].id;
  $('save-project').disabled = Boolean(update);
  $('save-name').value = suggestedName(context, format);
  $('save-name').disabled = Boolean(update);
  $('save-name-label').hidden = Boolean(update);
  $('save-info').textContent = update
    ? `Se añadirá una versión de ${context.file.name}.`
    : 'Si cambiaste el formato, la exportación se guarda como archivo independiente.';
  show('save-dialog');
});

onSubmit('save-form', 'save-status', async (dialog, data) => {
  await editorOperation('save-status', async (context, blob, format) => {
    const update = context.file && extension(context.file.name) === format;
    const project = update ? context.project : state.projects.find(item => item.id === data.get('project'));
    const name = update ? context.file.name : withExtension(data.get('name').trim(), format);
    if (!project || (!update && !data.get('name').trim())) throw new Error('filename');
    const store = state.store;
    const saved = await store.save(project, blob, name, update ? context.file : null);
    if (state.store !== store) throw new Error('session');
    if (update || !context.file) {
      context.file = saved;
      context.project = project;
      $('editor-document').textContent = saved.name;
    }
    dialog.close();
    message('editor-status', `${saved.name} guardado en ${project.name}.`);
  });
});

try {
  state.client = await getCloud();
  $('sign-in').disabled = !state.client;
  if (state.client) {
    state.client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && state.user) void setAccount(null);
    });
  } else {
    message('dashboard-status', 'Supabase pendiente de configurar. Puedes usar los editores y descargar archivos.');
  }
} catch {
  message('dashboard-status', 'No se pudo leer la configuración de Supabase. Los editores siguen disponibles.', true);
}
renderProjects();
