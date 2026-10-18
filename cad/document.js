import { validateEdgeSelection } from './topology.js';
/** Modelo paramétrico portable. Distancias en milímetros; rx, ry y rz en grados. */
export const DOCUMENT_VERSION = 1;
export const DOCUMENT_LIMITS = Object.freeze({
  objects: 100,
  points: 1024,
  payloadBytes: 40 * 1024 * 1024,
  minimumDimension: 0.00001,
  dimension: 100_000,
  coordinate: 1_000_000,
  historyBytes: 80 * 1024 * 1024,
});

const labels = {
  box: "Caja",
  cylinder: "Cilindro",
  sphere: "Esfera",
  sketch: "Croquis",
  extrusion: "Extrusión",
  boolean: "Operación booleana",
  fillet: "Redondeo",
  transform: "Transformación",
  import: "Pieza importada",
  mesh: "Malla convertida",
};
const parameterKeys = {
  box: ["width", "depth", "height", "x", "y", "z"],
  cylinder: ["radius", "height", "x", "y", "z"],
  sphere: ["radius", "x", "y", "z"],
  sketch: ["points", "profile", "plane", "support", "x", "y", "z"],
  extrusion: ["sketch", "points", "profile", "plane", "support", "reverse", "height", "x", "y", "z"],
  boolean: ["operation", "left", "right"],
  fillet: ["source", "radius", "edges", "edgeCount"],
  transform: ["source", "x", "y", "z", "rx", "ry", "rz"],
  import: ["format", "data"],
  mesh: ["data", "quality"],
};
const encoder = new TextEncoder();
let nextId = 0;

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} debe ser un objeto.`);
  }
}

function keys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label}: el campo «${unknown}» no está permitido.`);
}

function title(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new Error(`${label} debe tener entre 1 y 120 caracteres.`);
  }
}

function number(value, label, { positive = false, limit = DOCUMENT_LIMITS.coordinate, unit = "mm" } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} debe ser un número finito.`);
  }
  if (positive && value <= 0) throw new Error(`${label} debe ser mayor que cero.`);
  if (Math.abs(value) > limit) throw new Error(`${label} supera el límite de ${limit} ${unit}.`);
}

function dimension(value, label) {
  number(value, label, { positive: true, limit: DOCUMENT_LIMITS.dimension });
  if (value < DOCUMENT_LIMITS.minimumDimension) {
    throw new Error(`${label} debe ser de al menos ${DOCUMENT_LIMITS.minimumDimension} mm para calcular un sólido.`);
  }
}

function references(object) {
  if (object.type === "extrusion" && object.params.sketch !== undefined) return [object.params.sketch];
  if (["extrusion", "sketch"].includes(object.type) && object.params.support) return [object.params.support.source];
  if (object.type === "boolean") return [object.params.left, object.params.right];
  if (object.type === "fillet" || object.type === "transform") return [object.params.source];
  return [];
}

function orientation(a, b, c) {
  const left = (b[0] - a[0]) * (c[1] - a[1]);
  const right = (b[1] - a[1]) * (c[0] - a[0]);
  const cross = left - right;
  // El margen solo absorbe el redondeo de coma flotante, sin una tolerancia geométrica fija.
  const rounding = 8 * Number.EPSILON * (Math.abs(left) + Math.abs(right));
  return cross > rounding ? 1 : cross < -rounding ? -1 : 0;
}

function onSegment(point, a, b) {
  return point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0])
    && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1]);
}

function segmentsIntersect(a, b, c, d) {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0])
    || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return (abc * abd < 0 && cda * cdb < 0)
    || (abc === 0 && onSegment(c, a, b))
    || (abd === 0 && onSegment(d, a, b))
    || (cda === 0 && onSegment(a, c, d))
    || (cdb === 0 && onSegment(b, c, d));
}

function validateProfile(points) {
  const distinct = new Set();
  for (const point of points) {
    const key = `${point[0]},${point[1]}`;
    if (distinct.has(key)) throw new Error("El perfil contiene puntos duplicados. No repitas el punto inicial: el contorno se cierra automáticamente.");
    distinct.add(key);
  }
  for (let i = 0; i < points.length; i++) {
    const nextI = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j++) {
      const nextJ = (j + 1) % points.length;
      // Los lados contiguos comparten un vértice y no cuentan como cruce.
      if (j === nextI || nextJ === i) continue;
      if (segmentsIntersect(points[i], points[nextI], points[j], points[nextJ])) {
        throw new Error("El perfil contiene auto-intersecciones: sus lados no pueden cruzarse ni tocar otros lados del contorno.");
      }
    }
  }
  const [originX, originY] = points[0];
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + (point[0] - originX) * (next[1] - originY) - (next[0] - originX) * (point[1] - originY);
  }, 0);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-12) throw new Error("El perfil debe tener un área mayor que cero.");
  for (let i = 0; i < points.length; i++) {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    // Un vértice colineal es válido mientras el siguiente lado no retroceda sobre el anterior.
    if (orientation(a, b, c) === 0 && (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) > 0) {
      throw new Error("El perfil contiene auto-intersecciones: dos lados contiguos se superponen.");
    }
  }
}

/** Perfil cerrado compartido por el documento portable y el núcleo geométrico. */
export function validateSketchParameters(params) {
  if (params.plane !== undefined) {
    record(params.plane, 'El plano');
    keys(params.plane, ['origin', 'u', 'v'], 'El plano');
    for (const key of ['origin', 'u', 'v']) {
      if (!Array.isArray(params.plane[key]) || params.plane[key].length !== 3) throw new Error('El plano necesita origen y dos ejes de tres coordenadas.');
      params.plane[key].forEach((value) => number(value, 'La coordenada del plano'));
    }
    const { u, v } = params.plane;
    if (Math.abs(Math.hypot(...u) - 1) > 1e-7 || Math.abs(Math.hypot(...v) - 1) > 1e-7 || Math.abs(u.reduce((sum, value, i) => sum + value * v[i], 0)) > 1e-7) throw new Error('Los ejes del plano deben ser unitarios y perpendiculares.');
  }
  if (params.support !== undefined) {
    record(params.support, 'La cara de apoyo');
    keys(params.support, ['source', 'face', 'faceCount'], 'La cara de apoyo');
    if (!Number.isInteger(params.support.face) || params.support.face < 0 || !Number.isInteger(params.support.faceCount) || params.support.faceCount <= params.support.face) throw new Error('La cara de apoyo no es válida.');
  }
  if (params.profile != null) {
    record(params.profile, 'El círculo');
    keys(params.profile, ['type', 'center', 'radius'], 'El círculo');
    if (params.profile.type !== 'circle' || !Array.isArray(params.profile.center) || params.profile.center.length !== 2) throw new Error('El perfil circular necesita centro y radio.');
    params.profile.center.forEach((value) => number(value, 'El centro del círculo'));
    dimension(params.profile.radius, 'El radio del círculo');
    if (!Array.isArray(params.points) || params.points.length) throw new Error('Un círculo no debe contener también un contorno poligonal.');
  } else {
    if (!Array.isArray(params.points) || params.points.length < 3 || params.points.length > DOCUMENT_LIMITS.points) {
      throw new Error(`El perfil debe contener entre 3 y ${DOCUMENT_LIMITS.points} puntos.`);
    }
    for (const point of params.points) {
      if (!Array.isArray(point) || point.length !== 2) throw new Error("Cada punto del perfil debe contener x e y.");
      number(point[0], "La coordenada x del perfil");
      number(point[1], "La coordenada y del perfil");
    }
    validateProfile(params.points);
  }
  for (const axis of [0, 1]) {
    const values = params.points.map((point) => point[axis]);
    if (Math.max(...values) - Math.min(...values) > DOCUMENT_LIMITS.dimension) {
      throw new Error(`El perfil supera la dimensión máxima de ${DOCUMENT_LIMITS.dimension} mm.`);
    }
  }
}

function validateParameters(object, previousObjects) {
  const { type, params } = object;
  record(params, `Los parámetros de «${object.name}»`);
  keys(params, parameterKeys[type], `Los parámetros de «${object.name}»`);
  if (["box", "cylinder", "sphere", "sketch", "extrusion", "transform"].includes(type)) {
    for (const axis of ["x", "y", "z"]) number(params[axis], `La posición ${axis}`);
  }
  if (type === "box") {
    for (const key of ["width", "depth", "height"]) dimension(params[key], `La dimensión ${key}`);
  } else if (type === "cylinder") {
    dimension(params.radius, "El radio");
    dimension(params.height, "La altura");
  } else if (type === "sphere" || type === "fillet") {
    dimension(params.radius, "El radio");
    if (type === 'fillet') validateEdgeSelection(params);
  } else if (type === "extrusion") {
    dimension(params.height, "La altura");
    if (params.reverse !== undefined && typeof params.reverse !== 'boolean') throw new Error('El sentido de extrusión debe ser booleano.');
    if (params.sketch !== undefined) {
      if (["points", "profile", "plane", "support"].some((key) => params[key] !== undefined)) {
        throw new Error("Una extrusión vinculada usa el perfil y el plano de su croquis; no puede definir otro perfil ni apoyo.");
      }
    } else validateSketchParameters(params);
  } else if (type === "sketch") {
    validateSketchParameters(params);
  } else if (type === "boolean") {
    if (!["cut", "fuse", "common"].includes(params.operation)) {
      throw new Error("La operación booleana debe ser cut, fuse o common.");
    }
    if (params.left === params.right) throw new Error("La operación booleana necesita dos piezas diferentes.");
  } else if (type === "transform") {
    for (const axis of ["rx", "ry", "rz"]) {
      number(params[axis], `La rotación ${axis}`, { limit: 360_000, unit: "grados" });
    }
  } else if (type === "import" || type === "mesh") {
    if (type === 'mesh' && (!Number.isInteger(params.quality) || params.quality < 0 || params.quality > 4)) throw new Error('La resolución de malla no es válida.');
    if (type === 'import' && !["step", "stl"].includes(params.format)) throw new Error("El formato importado debe ser STEP o STL.");
    const data = params.data;
    if (typeof data === "string" && data.length > DOCUMENT_LIMITS.payloadBytes) throw new Error("La pieza importada supera el límite de 40 MB.");
    // Una clase de caracteres plana evita desbordar la pila del regexp con archivos grandes.
    if (typeof data !== "string" || !data.length || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      throw new Error("Los datos de la pieza importada deben ser base64 válido.");
    }
  }
  for (const id of references(object)) {
    if (typeof id !== "string" || !previousObjects.has(id)) {
      throw new Error(`«${object.name}» debe referenciar una pieza anterior existente.`);
    }
  }
  if (type === "extrusion" && params.sketch !== undefined && previousObjects.get(params.sketch).type !== "sketch") {
    throw new Error("La extrusión debe referenciar un croquis independiente.");
  }
  if (["boolean", "fillet", "transform"].includes(type) && references(object).some((id) => previousObjects.get(id).type === "sketch")) {
    throw new Error("Esta operación necesita piezas con volumen. Extruye primero el croquis.");
  }
  if (["sketch", "extrusion"].includes(type) && params.support) {
    let source = previousObjects.get(params.support.source);
    while (source.type === "transform") source = previousObjects.get(source.params.source);
    if (source.type === "sketch" || source.type === "mesh" || (source.type === "import" && source.params.format === "stl")) {
      throw new Error("La cara de apoyo debe pertenecer a un sólido CAD, no a un croquis ni a una malla.");
    }
  }
}

function json(document) {
  let result;
  try {
    result = JSON.stringify(document);
  } catch {
    throw new Error("El proyecto debe contener datos JSON serializables.");
  }
  if (encoder.encode(result).byteLength > DOCUMENT_LIMITS.payloadBytes) {
    throw new Error("El archivo del proyecto supera el límite de 40 MB.");
  }
  return result;
}

/** Valida sin modificar y devuelve el mismo documento. */
export function validateDocument(document) {
  record(document, "El proyecto");
  keys(document, ["version", "name", "objects"], "El proyecto");
  if (document.version !== DOCUMENT_VERSION) throw new Error("La versión del proyecto CAD no es compatible.");
  title(document.name, "El nombre del proyecto");
  if (!Array.isArray(document.objects) || document.objects.length > DOCUMENT_LIMITS.objects) {
    throw new Error(`El proyecto puede contener hasta ${DOCUMENT_LIMITS.objects} operaciones.`);
  }
  const previousObjects = new Map();
  for (const object of document.objects) {
    record(object, "Cada pieza");
    keys(object, ["id", "name", "type", "params", "visible", "color"], "La pieza");
    if (typeof object.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(object.id)) {
      throw new Error("El identificador debe tener hasta 80 letras, números, guiones o guiones bajos.");
    }
    if (previousObjects.has(object.id)) throw new Error(`El identificador «${object.id}» está duplicado.`);
    title(object.name, "El nombre de la pieza");
    if (!Object.hasOwn(labels, object.type)) throw new Error(`El tipo de pieza «${String(object.type)}» no es compatible.`);
    if (typeof object.visible !== "boolean") throw new Error("La visibilidad de la pieza debe ser true o false.");
    if (typeof object.color !== "string" || !/^#[a-f0-9]{6}$/i.test(object.color)) {
      throw new Error("El color de la pieza debe usar el formato #RRGGBB.");
    }
    validateParameters(object, previousObjects);
    previousObjects.set(object.id, object);
  }
  json(document);
  return document;
}

export function createDocument(name = "Pieza nueva") {
  return validateDocument({ version: DOCUMENT_VERSION, name, objects: [] });
}

export function createExampleDocument() {
  const document = createDocument("Soporte mecánico");
  addObject(document, { id: "base", name: "Placa 60 × 40 × 8", type: "box", params: { width: 60, depth: 40, height: 8 }, visible: false });
  addObject(document, { id: "agujero", name: "Herramienta Ø12", type: "cylinder", params: { radius: 6, height: 12, x: 30, y: 20, z: -2 }, visible: false });
  addObject(document, { id: "soporte", name: "Soporte con agujero", type: "boolean", params: { operation: "cut", left: "base", right: "agujero" }, color: "#4a9eff" });
  return document;
}

function defaults(type) {
  const position = { x: 0, y: 0, z: 0 };
  switch (type) {
    case "box": return { width: 30, depth: 20, height: 10, ...position };
    case "cylinder": return { radius: 10, height: 20, ...position };
    case "sphere": return { radius: 12, ...position };
    case "sketch": return position;
    case "extrusion": return { height: 10, ...position };
    case "fillet": return { radius: 2 };
    case "transform": return { ...position, rx: 0, ry: 0, rz: 0 };
    default: return {};
  }
}

function uniqueId(document, type) {
  let id;
  do {
    id = `${type}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(++nextId).toString(36)}`}`;
  } while (document.objects.some((object) => object.id === id));
  return id;
}

/** Añade una operación de forma atómica y devuelve el nodo añadido. */
export function addObject(document, specification) {
  validateDocument(document);
  record(specification, "La pieza nueva");
  keys(specification, ["id", "name", "type", "params", "visible", "color"], "La pieza nueva");
  const type = specification.type;
  if (!Object.hasOwn(labels, type)) throw new Error(`El tipo de pieza «${String(type)}» no es compatible.`);
  if (specification.params !== undefined) record(specification.params, "Los parámetros");
  const object = {
    id: specification.id ?? uniqueId(document, type),
    name: specification.name ?? labels[type],
    type,
    params: { ...defaults(type), ...structuredClone(specification.params ?? {}) },
    visible: specification.visible ?? true,
    color: specification.color ?? "#56b6ff",
  };
  validateDocument({ ...document, objects: [...document.objects, object] });
  document.objects.push(object);
  return object;
}

/** Fusiona los parámetros; el identificador y el tipo conservan su identidad. */
export function updateObject(document, id, patch) {
  validateDocument(document);
  record(patch, "Los cambios de la pieza");
  keys(patch, ["id", "name", "type", "params", "visible", "color"], "Los cambios de la pieza");
  const index = document.objects.findIndex((object) => object.id === id);
  if (index === -1) throw new Error("La pieza que quieres editar no existe.");
  const original = document.objects[index];
  if ((patch.id !== undefined && patch.id !== id) || (patch.type !== undefined && patch.type !== original.type)) {
    throw new Error("El identificador y el tipo de una operación no se pueden cambiar.");
  }
  if (patch.params !== undefined) record(patch.params, "Los parámetros");
  const object = { ...original, ...patch, params: { ...original.params, ...structuredClone(patch.params ?? {}) } };
  const candidate = [...document.objects];
  candidate[index] = object;
  validateDocument({ ...document, objects: candidate });
  document.objects[index] = object;
  return object;
}

/** Bloquea las dependencias salvo que se pida eliminar la cadena completa. */
export function removeObject(document, id, { cascade = false } = {}) {
  validateDocument(document);
  const original = document.objects.find((object) => object.id === id);
  if (!original) throw new Error("La pieza que quieres eliminar no existe.");
  const removedIds = new Set([id]);
  for (const object of document.objects) {
    if (references(object).some((reference) => removedIds.has(reference))) removedIds.add(object.id);
  }
  if (!cascade && removedIds.size > 1) {
    const dependentNames = document.objects.filter((object) => object.id !== id && removedIds.has(object.id)).map((object) => `«${object.name}»`).join(", ");
    throw new Error(`No se puede eliminar «${original.name}»: ${dependentNames} depende de esta pieza. Elimina primero sus operaciones o elimina toda la cadena.`);
  }
  const removed = document.objects.filter((object) => removedIds.has(object.id));
  document.objects = document.objects.filter((object) => !removedIds.has(object.id));
  return removed;
}

export function cloneDocument(document) {
  return structuredClone(validateDocument(document));
}

export function serializeDocument(document) {
  validateDocument(document);
  return json(document);
}

export function parseDocument(text) {
  if (typeof text !== "string") throw new Error("El archivo del proyecto debe contener texto JSON.");
  if (encoder.encode(text).byteLength > DOCUMENT_LIMITS.payloadBytes) throw new Error("El archivo del proyecto supera el límite de 40 MB.");
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error("El archivo del proyecto no contiene JSON válido.");
  }
  return validateDocument(document);
}

/** Historial de documentos, independiente del render y de los sólidos calculados. */
export class CadHistory {
  #snapshots = [];
  #index = -1;
  #limit;
  #byteBudget;
  #byteSize = 0;

  constructor(initial = createDocument(), limit = 50, byteBudget = DOCUMENT_LIMITS.historyBytes) {
    if (!Number.isInteger(limit) || limit < 2 || limit > 100) throw new Error("El historial debe conservar entre 2 y 100 estados.");
    if (!Number.isSafeInteger(byteBudget) || byteBudget <= 0) throw new Error("El presupuesto del historial debe ser un número positivo de bytes.");
    this.#limit = limit;
    this.#byteBudget = byteBudget;
    this.reset(initial);
  }

  get current() { return parseDocument(this.#snapshots[this.#index].text); }
  get canUndo() { return this.#index > 0; }
  get canRedo() { return this.#index < this.#snapshots.length - 1; }
  get byteSize() { return this.#byteSize; }
  get byteBudget() { return this.#byteBudget; }
  get snapshotCount() { return this.#snapshots.length; }

  commit(document) {
    const text = serializeDocument(document);
    if (text === this.#snapshots[this.#index].text) return this.current;
    const snapshot = { text, bytes: encoder.encode(text).byteLength };
    this.#snapshots = this.#snapshots.slice(0, this.#index + 1);
    this.#snapshots.push(snapshot);
    this.#byteSize = this.#snapshots.reduce((sum, entry) => sum + entry.bytes, 0);
    // Conserva siempre el estado actual, incluso cuando supera un presupuesto personalizado.
    while (this.#snapshots.length > 1 && (this.#snapshots.length > this.#limit || this.#byteSize > this.#byteBudget)) {
      this.#byteSize -= this.#snapshots.shift().bytes;
    }
    this.#index = this.#snapshots.length - 1;
    return this.current;
  }

  undo() {
    if (this.canUndo) this.#index--;
    return this.current;
  }

  redo() {
    if (this.canRedo) this.#index++;
    return this.current;
  }

  reset(document = createDocument()) {
    const text = serializeDocument(document);
    const snapshot = { text, bytes: encoder.encode(text).byteLength };
    this.#snapshots = [snapshot];
    this.#byteSize = snapshot.bytes;
    this.#index = 0;
    return this.current;
  }
}
