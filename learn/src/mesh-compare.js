// Rotate a polygon to its smallest vertex index while preserving its winding.
function topologyKey(kind, cycle, selected) {
  let first = 0;
  for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[first]) first = i;
  return [kind, selected, ...cycle.slice(first), ...cycle.slice(0, first)].join(',');
}

function topology(edit, compareSelection) {
  const incident = edit.verts.map(() => []);
  const counts = new Map();
  for (const kind of ['edges', 'faces']) {
    const selected = new Set(compareSelection ? edit.selection[kind] : []);
    edit[kind].forEach((cycle, i) => {
      const element = { kind, cycle, selected: selected.has(i) };
      for (const v of cycle) incident[v].push(element);
      const key = topologyKey(kind, cycle, element.selected);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
  }
  return { incident, counts, selected: new Set(compareSelection ? edit.selection.verts : []) };
}

// map[i] is the expected vertex index corresponding to actual vertex i.
export function compareEdit(actual, expected, { tol = 1e-4 } = {}) {
  const fail = reason => ({ ok: false, reason, map: null });
  for (const kind of ['verts', 'edges', 'faces']) {
    if (actual[kind].length !== expected[kind].length) return fail('Different ' + kind + ' counts');
  }
  const selection = actual.selection && expected.selection;
  const a = topology(actual, selection);
  const b = topology(expected, selection);
  const candidates = actual.verts.map(([x, y, z], i) => {
    const nearby = [];
    expected.verts.forEach(([u, v, w], j) => {
      if (a.incident[i].length !== b.incident[j].length || a.selected.has(i) !== b.selected.has(j)) return;
      const distance = Math.hypot(x - u, y - v, z - w);
      if (distance <= tol) nearby.push({ j, distance });
    });
    return nearby.sort((a, b) => a.distance - b.distance);
  });
  const order = candidates.map((_, i) => i).sort((i, j) => candidates[i].length - candidates[j].length);
  const map = Array(order.length).fill(-1);
  const used = new Set();
  // Consume each completed edge or face exactly once, undoing on backtrack.
  function match(depth) {
    if (depth === order.length) return true;
    const i = order[depth];
    for (const { j } of candidates[i]) {
      if (used.has(j)) continue;
      map[i] = j;
      used.add(j);
      const consumed = [];
      let valid = true;
      for (const { kind, cycle, selected } of a.incident[i]) {
        const mapped = cycle.map(v => map[v]);
        if (mapped.includes(-1)) continue;
        const key = topologyKey(kind, mapped, selected);
        const remaining = b.counts.get(key);
        if (!remaining) { valid = false; break; }
        b.counts.set(key, remaining - 1);
        consumed.push(key);
      }
      if (valid && match(depth + 1)) return true;
      for (const key of consumed) b.counts.set(key, b.counts.get(key) + 1);
      used.delete(j);
      map[i] = -1;
    }
    return false;
  }
  if (candidates.some(list => !list.length)) return fail('No matching vertex within tolerance with compatible incidence and selection');
  return match(0) ? { ok: true, reason: null, map } : fail('No bijection preserves edges, oriented faces and selection');
}
