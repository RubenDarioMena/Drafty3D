import { Cursor } from './cursor.js';
import { LessonBar } from './lesson-bar.js';
import { AddModifierMenu, ModeMenu } from './menu.js';
import { PropertiesEditor } from './panel.js';
import { lessonProgress } from './progress.js';
import { SculptEditor } from './sculpt-editor.js';
import { Viewer, createLoader, loadGeometries } from './viewer.js';
import { WatchMode } from './watch.js';
import { YourTurnMode } from './yourturn.js';

const examples = new URL('./examples/', document.baseURI);
const fetchJson = async path => {
  const response = await fetch(new URL(path, examples));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};

const [catalog, ui] = await Promise.all([fetchJson('index.json'), fetchJson('blender-ui.json')]);
const home = document.getElementById('home');
const lessonView = document.getElementById('lesson');
const title = document.getElementById('lesson-title');
const editors = {
  modifiers: new PropertiesEditor(document.getElementById('tabs'), document.getElementById('panel'), ui),
  sculpt: new SculptEditor(document.getElementById('sculpt-tools'), ui),
};
const MODULE_TITLES = { modifiers: 'Modifiers', sculpt: 'Sculpting' };
const menu = new AddModifierMenu(document.getElementById('menu-layer'), ui);
const modeMenu = new ModeMenu(document.getElementById('menu-layer'), ui);
const cursor = new Cursor(document.getElementById('cursor'));
const bar = new LessonBar();
const loader = createLoader();
const toastNode = document.getElementById('toast');
let viewer;
let mode;
let toastTimer;

// Inside the Android app there is no Drafty3D site to go back to.
document.getElementById('workspace-link').hidden = Boolean(window.Capacitor?.isNativePlatform?.());
const about = document.getElementById('about');
document.getElementById('about-open').addEventListener('click', () => about.showModal());

function toast(message) {
  toastNode.textContent = message;
  toastNode.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastNode.hidden = true; }, 1400);
}

const keyOf = lesson => `${lesson.module}/${lesson.example}`;

function progressText(lesson) {
  const progress = lessonProgress(keyOf(lesson));
  if (lesson.mode === 'watch') {
    if (progress.completed) return { text: 'Watched ✓', done: true };
    return { text: progress.lastStep >= 0 ? `Paused at step ${progress.lastStep + 1}` : 'Not started' };
  }
  if (progress.completed) return { text: `Done ✓${progress.helps ? ` · ${progress.helps} with help` : ''}`, done: true };
  return { text: progress.solved ? `Step ${progress.solved + 1} next` : 'Not started' };
}

function lessonCard(lesson) {
  const item = document.createElement('li');
  item.className = 'lesson-card';
  const heading = document.createElement('h3');
  heading.textContent = lesson.title;
  const status = progressText(lesson);
  const detail = document.createElement('p');
  detail.textContent = `${lesson.mode === 'watch' ? 'Watch' : 'Practice'} · ${status.text}`;
  detail.classList.toggle('done', Boolean(status.done));
  const actions = document.createElement('div');
  actions.className = 'actions';
  const open = document.createElement('a');
  open.href = `#/lesson/${keyOf(lesson)}`;
  open.className = 'primary';
  open.textContent = lesson.mode === 'watch' ? 'Watch' : 'Start';
  open.setAttribute('role', 'button');
  actions.append(open);
  item.append(heading, detail, actions);
  return item;
}

/** One section per module, in the catalog's order (the pipeline sorts it). */
function renderHome() {
  const modules = [...new Set(catalog.lessons.map(lesson => lesson.module))];
  document.getElementById('modules').replaceChildren(...modules.map(module => {
    const section = document.createElement('section');
    section.className = 'module';
    section.dataset.module = module;
    section.setAttribute('aria-labelledby', `module-${module}`);
    const header = document.createElement('header');
    const heading = document.createElement('h2');
    heading.id = `module-${module}`;
    heading.textContent = MODULE_TITLES[module] ?? module;
    const version = document.createElement('span');
    version.className = 'version';
    version.textContent = `Blender ${ui.blenderVersion}`;
    header.append(heading, version);
    const list = document.createElement('ul');
    list.className = 'lesson-list';
    list.append(...catalog.lessons.filter(lesson => lesson.module === module).map(lessonCard));
    section.append(header, list);
    return section;
  }));
}

async function openLesson(key) {
  const lesson = catalog.lessons.find(candidate => keyOf(candidate) === key);
  if (!lesson) {
    location.hash = '#/';
    return;
  }
  const timeline = await fetchJson(lesson.timeline);
  const folder = new URL(lesson.timeline.replace(/[^/]+$/, ''), examples);
  const names = [timeline.initial.mesh, ...timeline.steps.map(step => step.mesh).filter(Boolean)];
  const geometries = await loadGeometries(loader, folder, names);
  home.hidden = true;
  lessonView.hidden = false;
  title.textContent = lesson.title;
  document.getElementById('object-name').textContent = timeline.object;
  document.getElementById('viewport-mode').textContent = 'Object Mode';
  // Sculpt lessons swap the Properties editor for the 3D Viewport's tool header and brush shelf.
  lessonView.dataset.module = timeline.module;
  viewer ??= new Viewer(document.getElementById('viewport-canvas'));
  viewer.setHelpers(timeline.helpers ?? []);
  const editor = editors[timeline.module] ?? editors.modifiers;
  // The objects an Object field may point at: the lesson's helpers, as Blender would list them.
  editor.objects = (timeline.helpers ?? []).map(helper => helper.name);
  editor.openList = null;
  const context = { timeline, ui, viewer, editor, menu, modeMenu, cursor, bar, geometries, key, toast };
  mode = timeline.mode === 'watch' ? new WatchMode(context) : new YourTurnMode(context);
  mode.start();
}

async function route() {
  mode?.stop();
  mode = null;
  const match = location.hash.match(/^#\/lesson\/(.+)$/);
  if (match) {
    await openLesson(decodeURIComponent(match[1]));
    return;
  }
  lessonView.hidden = true;
  home.hidden = false;
  title.textContent = '';
  renderHome();
}

window.addEventListener('hashchange', route);
await route();
document.documentElement.dataset.ready = 'true';
