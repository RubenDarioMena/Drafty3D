// Progress lives only on this device; storage can be unavailable (private mode), so every access is guarded.
const KEY = 'drafty3d.learn.v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { lessons: {} };
  } catch {
    return { lessons: {} };
  }
}

export function lessonProgress(key) {
  return read().lessons[key] || {};
}

export function saveLessonProgress(key, patch) {
  const data = read();
  data.lessons[key] = { ...data.lessons[key], ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
