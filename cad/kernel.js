// OpenCascade conserva la geometría BRep. Estas mallas solo son su representación.
// Este módulo no interpreta ni ejecuta código procedente de documentos importados.
import { cross, onPlane, extrusionPlane } from './planes.js';
import { meshQuality, binaryStl, bytesToBase64, MAX_MESH_TRIANGLES } from './mesh-quality.js';
export const KERNEL_CAPABILITIES = Object.freeze({
  engine: 'OpenCascade.js',
  version: '2.0.0-beta.b5ff984',
  bindings: 'full',
  units: 'mm',
  local: true,
  operations: ['box', 'cylinder', 'sphere', 'extrusion', 'cut', 'fuse', 'common', 'fillet', 'transform'],
  import: ['step', 'stl'],
  export: ['step', 'stl'],
});

let activeKernel;

/** Inyectar `oc` permite usar exactamente el mismo núcleo en pruebas Node. */
export async function initKernel({ oc, factory, wasmUrl, wasmBinary, onProgress } = {}) {
  if (!oc) {
    if (!factory) throw new Error('Falta el cargador de OpenCascade.');
    let rejectAbort;
    const aborted = new Promise((resolve, reject) => { rejectAbort = reject; });
    // Algunas compilaciones Emscripten llaman onAbort sin rechazar ready.
    // En ese caso el worker también debe devolver un fallo a la interfaz.
    oc = await Promise.race([aborted, Promise.resolve().then(() => factory({
      locateFile: (path) => path.endsWith('.wasm') ? wasmUrl : path,
      ...(wasmBinary ? { wasmBinary } : {}),
      print: () => {},
      printErr: () => {},
      onAbort: (reason) => rejectAbort(new Error(`OpenCascade interrumpió la carga: ${String(reason)}`)),
    }))]);
  }
  activeKernel = new CadKernel(oc, onProgress);
  return activeKernel;
}

export function evaluateDocument(document, kernel = activeKernel) {
  if (!kernel) throw new Error('El motor geométrico todavía no está listo.');
  return kernel.evaluateDocument(document);
}

export function exportDocument(document, format, kernel = activeKernel) {
  if (!kernel) throw new Error('El motor geométrico todavía no está listo.');
  return kernel.exportDocument(document, format);
}

// Cada wrapper embind tiene que liberarse; la geometría compartida usa handles OCCT.
class Resources {
  constructor() { this.items = []; }
  own(value) { this.items.push(value); return value; }
  keep(value) { this.items = this.items.filter((item) => item !== value); return value; }
  dispose() {
    for (const item of this.items.reverse()) item?.delete?.();
    this.items.length = 0;
  }
}

function withResources(callback) {
  const resources = new Resources();
  try { return callback(resources); } finally { resources.dispose(); }
}

function number(value, label, fallback = undefined) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || Math.abs(result) > 1e7) {
    throw new Error(`${label} debe ser un número finito entre −10 000 000 y 10 000 000.`);
  }
  return result;
}

function positive(value, label) {
  const result = number(value, label);
  if (result < 0.00001) throw new Error(`${label} debe ser mayor que cero y medir al menos 0,00001 mm.`);
  return result;
}

function pointCoordinates(params) {
  return ['x', 'y', 'z'].map((key) => number(params[key], `La coordenada ${key}`, 0));
}

function dependencyIds(object) {
  if (object.type === 'extrusion' && object.params.support) return [object.params.support.source];
  if (object.type === 'boolean') return [object.params.left, object.params.right];
  if (object.type === 'transform' || object.type === 'fillet') return [object.params.source];
  return [];
}

function validateDocument(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.objects)) {
    throw new Error('El documento CAD no tiene un formato compatible (versión 1).');
  }
  if (document.objects.length > 512) throw new Error('El documento supera el límite de 512 operaciones.');
  const objects = new Map();
  for (const object of document.objects) {
    if (!object || typeof object.id !== 'string' || !object.id || objects.has(object.id)) {
      throw new Error('Cada operación necesita un identificador único.');
    }
    if (!object.params || typeof object.params !== 'object' || Array.isArray(object.params)) {
      throw new Error(`Faltan los parámetros de «${object.name || object.id}».`);
    }
    objects.set(object.id, object);
  }
  return objects;
}

function enumEquals(left, right) {
  return left === right || (left?.value !== undefined && left.value === right?.value);
}

function coords(point) { return [point.X(), point.Y(), point.Z()]; }

function operationError(error) {
  if (error instanceof Error) return error.message;
  return 'OpenCascade no pudo construir esta geometría. Revisa las medidas y las intersecciones.';
}

class CadKernel {
  constructor(oc, onProgress) {
    this.oc = oc;
    this.onProgress = onProgress;
    this.cache = new Map();
    this.capabilities = KERNEL_CAPABILITIES;
    this.fileSerial = 0;
    this.epoch = crypto.randomUUID();
    this.revision = 0;
  }

  dispose() {
    for (const entry of this.cache.values()) entry.shape.delete();
    this.cache.clear();
  }

  resolve(document) {
    const objects = validateDocument(document);
    const nextCache = new Map();
    const pending = new Set();
    const created = [];
    const resolveOne = (id) => {
      if (nextCache.has(id)) return nextCache.get(id);
      if (pending.has(id)) throw new Error('El historial tiene una dependencia circular.');
      const object = objects.get(id);
      if (!object) throw new Error(`La operación depende de una pieza inexistente: ${String(id)}.`);
      pending.add(id);
      const dependencies = dependencyIds(object).map(resolveOne);
      const key = JSON.stringify({ type: object.type, params: object.params });
      const previous = this.cache.get(id);
      let entry;
      if (previous?.key === key && dependencies.every((dep, index) => dep === previous.dependencies[index])) {
        entry = previous;
      } else {
        this.onProgress?.(`Calculando ${object.name || object.id}…`);
        let shape;
        try {
          const isMesh = object.type === 'mesh' || (object.type === 'import' && object.params.format === 'stl') ||
            (object.type === 'transform' && dependencies[0].isMesh);
          if (['boolean', 'fillet'].includes(object.type) && dependencies.some((entry) => entry.isMesh)) {
            throw new Error('Las piezas STL son mallas. Cortar, unir, intersectar y redondear requieren sólidos BRep; importa STEP para editar sólidos.');
          }
          shape = this.makeShape(object, dependencies, isMesh);
          if (shape.IsNull()) throw new Error('La operación produjo una forma vacía.');
          // Los resultados vacíos de una intersección son válidos, aunque no tengan caras.
          entry = { key, dependencies, shape, isMesh, mesh: null, revision: `${this.epoch}:${++this.revision}` };
          created.push(entry);
        } catch (error) {
          shape?.delete();
          throw new Error(`«${object.name || object.id}»: ${operationError(error)}`);
        }
      }
      pending.delete(id);
      nextCache.set(id, entry);
      return entry;
    };
    try {
      for (const object of document.objects) resolveOne(object.id);
    } catch (error) {
      for (const entry of created) entry.shape.delete();
      throw error;
    }
    // Commit atómico: un error conserva el último documento geométrico correcto.
    for (const [id, entry] of this.cache) {
      if (nextCache.get(id) !== entry) entry.shape.delete();
    }
    this.cache = nextCache;
    return nextCache;
  }

  makeShape(object, dependencies, isMesh = false) {
    const oc = this.oc;
    const p = object.params;
    return withResources((r) => {
      const own = (value) => r.own(value);
      const origin = () => own(new oc.gp_Pnt_3(...pointCoordinates(p)));
      const resultOf = (builder) => {
        own(builder);
        const shape = own(builder.Shape());
        if (!builder.IsDone()) throw new Error('No se pudo completar la operación geométrica.');
        return shape;
      };
      const translated = (shape) => {
        const coordinates = pointCoordinates(p);
        if (coordinates.every((value) => value === 0)) return shape;
        const trsf = own(new oc.gp_Trsf_1());
        trsf.SetTranslation_1(own(new oc.gp_Vec_4(...coordinates)));
        return resultOf(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
      };
      let shape;
      switch (object.type) {
        case 'box':
          shape = resultOf(new oc.BRepPrimAPI_MakeBox_3(origin(), positive(p.width, 'El ancho'), positive(p.depth, 'El fondo'), positive(p.height, 'La altura')));
          break;
        case 'cylinder':
          shape = translated(resultOf(new oc.BRepPrimAPI_MakeCylinder_1(positive(p.radius, 'El radio'), positive(p.height, 'La altura'))));
          break;
        case 'sphere':
          shape = resultOf(new oc.BRepPrimAPI_MakeSphere_5(origin(), positive(p.radius, 'El radio')));
          break;
        case 'extrusion': {
          const support = p.support ? this.supportPlane(dependencies[0], p.support) : null;
          const plane = extrusionPlane(p, support);
          const normal = cross(plane.u, plane.v).map((value) => value * (p.reverse ? -1 : 1));
          const height = positive(p.height, 'La altura');
          if (p.profile?.type === 'circle') {
            const center = onPlane(plane, ...p.profile.center);
            const axes = own(new oc.gp_Ax2_2(own(new oc.gp_Pnt_3(...center)), own(new oc.gp_Dir_4(...normal)), own(new oc.gp_Dir_4(...plane.u))));
            shape = resultOf(new oc.BRepPrimAPI_MakeCylinder_3(axes, positive(p.profile.radius, 'El radio'), height));
            break;
          }
          if (!Array.isArray(p.points) || p.points.length < 3 || p.points.length > 1024) {
            throw new Error('El croquis necesita entre 3 y 1024 puntos.');
          }
          const polygon = own(new oc.BRepBuilderAPI_MakePolygon_1());
          for (const pair of p.points) {
            if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Cada punto del croquis necesita dos coordenadas.');
            polygon.Add_1(own(new oc.gp_Pnt_3(...onPlane(plane, number(pair[0], 'U del croquis'), number(pair[1], 'V del croquis')))));
          }
          polygon.Close();
          if (!polygon.IsDone()) throw new Error('No se pudo cerrar el croquis.');
          const wire = own(polygon.Wire());
          const faceBuilder = own(new oc.BRepBuilderAPI_MakeFace_15(wire, true));
          if (!faceBuilder.IsDone()) throw new Error('El croquis no define una superficie plana válida.');
          const face = own(faceBuilder.Face());
          shape = resultOf(new oc.BRepPrimAPI_MakePrism_1(face, own(new oc.gp_Vec_4(...normal.map((value) => value * height))), true, true));
          break;
        }
        case 'boolean': {
          const Builder = {
            cut: oc.BRepAlgoAPI_Cut_3,
            fuse: oc.BRepAlgoAPI_Fuse_3,
            common: oc.BRepAlgoAPI_Common_3,
          }[p.operation];
          if (!Builder) throw new Error('La operación booleana debe ser cortar, unir o intersectar.');
          const progress = own(new oc.Message_ProgressRange_1());
          shape = resultOf(new Builder(dependencies[0].shape, dependencies[1].shape, progress));
          const faces = own(new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
          if (!faces.More()) throw new Error('La operación booleana no produjo geometría. Revisa que las piezas se intersecten y que el corte no elimine toda la pieza.');
          break;
        }
        case 'fillet': {
          const radius = positive(p.radius, 'El radio del redondeo');
          const builder = own(new oc.BRepFilletAPI_MakeFillet(dependencies[0].shape, oc.ChFi3d_FilletShape.ChFi3d_Rational));
          const explorer = own(new oc.TopExp_Explorer_2(dependencies[0].shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
          const uniqueEdges = [];
          while (explorer.More()) {
            const current = own(explorer.Current());
            const edge = own(oc.TopoDS.Edge_1(current));
            if (!uniqueEdges.some((previous) => previous.IsSame(edge))) {
              uniqueEdges.push(edge);
              builder.Add_2(radius, edge);
            }
            explorer.Next();
          }
          if (!uniqueEdges.length) throw new Error('La pieza no tiene aristas para redondear.');
          try { builder.Build(own(new oc.Message_ProgressRange_1())); } catch {
            throw new Error('No se pudo construir el redondeo. Prueba un radio menor.');
          }
          if (!builder.IsDone()) throw new Error('El radio no permite redondear todas las aristas. Prueba un radio menor.');
          shape = own(builder.Shape());
          break;
        }
        case 'transform': {
          // Rotaciones en grados alrededor del origen global: X, luego Y, luego Z.
          const [rx, ry, rz] = ['rx', 'ry', 'rz'].map((key) => number(p[key], `Rotación ${key}`, 0) * Math.PI / 180);
          const [sx, cx, sy, cy, sz, cz] = [Math.sin(rx), Math.cos(rx), Math.sin(ry), Math.cos(ry), Math.sin(rz), Math.cos(rz)];
          const [x, y, z] = pointCoordinates(p);
          const trsf = own(new oc.gp_Trsf_1());
          trsf.SetValues(cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, x,
            sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, y,
            -sy, cy * sx, cy * cx, z);
          shape = isMesh
            ? own(dependencies[0].shape.Moved(own(new oc.TopLoc_Location_2(trsf)), false))
            : resultOf(new oc.BRepBuilderAPI_Transform_2(dependencies[0].shape, trsf, true));
          break;
        }
        case 'mesh':
          shape = own(this.importShape({ format: 'stl', data: p.data }));
          break;
        case 'import':
          shape = own(this.importShape(p));
          break;
        default:
          throw new Error(`Tipo de operación no compatible: ${String(object.type)}.`);
      }
      // Rechaza croquis cruzados y sólidos inválidos antes de llegar a operaciones futuras.
      if (shape.IsNull()) throw new Error('La operación produjo una forma vacía.');
      // Una cara que solo contiene triangulación no posee superficie paramétrica:
      // el analizador BRep no se aplica a ese tipo de representación de malla.
      if (!isMesh) {
        const check = own(new oc.BRepCheck_Analyzer(shape, true, false));
        if (!check.IsValid_2()) throw new Error('La geometría no es válida. Revisa el croquis, las medidas o el archivo.');
      }
      return r.keep(shape);
    });
  }

  importShape(params) {
    if (!['step', 'stl'].includes(params.format)) throw new Error('Solo se admiten archivos STEP y STL.');
    if (typeof params.data !== 'string' || !params.data.length) throw new Error('El archivo importado está vacío.');
    let binary;
    try { binary = atob(params.data); } catch { throw new Error('Los datos del archivo no son Base64 válido.'); }
    const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const filename = `/entrada-${++this.fileSerial}.${params.format}`;
    this.oc.FS.writeFile(filename, data);
    try {
      return withResources((r) => {
        const oc = this.oc;
        if (params.format === 'step') {
          const reader = r.own(new oc.STEPControl_Reader_1());
          if (!enumEquals(reader.ReadFile(filename), oc.IFSelect_ReturnStatus.IFSelect_RetDone)) throw new Error('OpenCascade no pudo leer el archivo STEP.');
          reader.TransferRoots(r.own(new oc.Message_ProgressRange_1()));
          if (!reader.NbShapes()) throw new Error('El archivo STEP no contiene geometría compatible.');
          return reader.OneShape();
        }
        // RWStl lee el STL real en una triangulación única. StlAPI_Reader crea
        // una cara BRep por triángulo, innecesaria y muy costosa para visualizar.
        const triangulation = r.own(oc.RWStl.ReadFile_2(filename, r.own(new oc.Message_ProgressRange_1())));
        if (triangulation.IsNull() || !triangulation.get().NbTriangles()) throw new Error('OpenCascade no pudo leer la malla STL.');
        const face = r.own(new oc.TopoDS_Face());
        const builder = r.own(new oc.BRep_Builder());
        builder.MakeFace_4(face, triangulation);
        return r.keep(face);
      });
    } finally { this.oc.FS.unlink(filename); }
  }

  shapeProperties(shape, isMesh = false) {
    const oc = this.oc;
    return withResources((r) => {
      const bounds = r.own(new oc.Bnd_Box_1());
      oc.BRepBndLib.AddOptimal(shape, bounds, isMesh, false);
      let box = null;
      if (!bounds.IsVoid()) {
        const min = coords(r.own(bounds.CornerMin()));
        const max = coords(r.own(bounds.CornerMax()));
        box = { min, max, size: max.map((value, index) => value - min[index]) };
      }
      const solids = r.own(new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      let solidCount = 0;
      while (solids.More()) { solidCount++; solids.Next(); }
      let volume = null;
      if (!isMesh && solidCount) {
        const props = r.own(new oc.GProp_GProps_1());
        oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
        volume = Math.abs(props.Mass());
      }
      return { bounds: box, volume, solidCount };
    });
  }

  facePlane(face) {
    const oc = this.oc;
    return withResources((r) => {
      const surface = r.own(new oc.BRepAdaptor_Surface_2(face, true));
      if (!enumEquals(surface.GetType(), oc.GeomAbs_SurfaceType.GeomAbs_Plane)) return null;
      const plane = r.own(surface.Plane());
      const axes = r.own(plane.Position());
      const origin = coords(r.own(axes.Location()));
      const u = coords(r.own(axes.XDirection()));
      const v = coords(r.own(axes.YDirection()));
      if (enumEquals(face.Orientation_1(), oc.TopAbs_Orientation.TopAbs_REVERSED)) v.forEach((value, i) => { v[i] = -value; });
      return { origin, u, v };
    });
  }

  supportPlane(entry, support) {
    if (entry.isMesh) throw new Error('Una malla STL no contiene caras planas BRep para apoyar un croquis.');
    const mesh = entry.mesh || (entry.mesh = this.tessellate(entry.shape, false));
    const face = mesh.faces.find((face) => face.index === support.face);
    if (mesh.faceCount !== support.faceCount || !face?.plane) throw new Error('La cara de apoyo ha cambiado. Vuelve a seleccionar un plano para este perfil.');
    return face.plane;
  }

  tessellate(shape, isMesh = false, quality = null) {
    const oc = this.oc;
    const properties = this.shapeProperties(shape, isMesh);
    return withResources((r) => {
      // Deflexión absoluta en mm; la visualización no afecta la precisión BRep.
      const extent = Math.max(...(properties.bounds?.size || [1]));
      const deflection = quality?.deflection ?? Math.max(0.02, Math.min(0.2, extent / 200));
      if (!isMesh) r.own(new oc.BRepMesh_IncrementalMesh_2(shape, deflection, false, quality?.angle ?? 0.25, false));
      const explorer = r.own(new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      const positions = [];
      const normals = [];
      const indices = [];
      const faces = [];
      let faceCount = 0;
      while (explorer.More()) {
        withResources((faceResources) => {
          const own = (value) => faceResources.own(value);
          const current = own(explorer.Current());
          const face = own(oc.TopoDS.Face_1(current));
          const location = own(new oc.TopLoc_Location_1());
          const handle = own(oc.BRep_Tool.Triangulation(face, location, 0));
          if (handle.IsNull()) return;
          // Handle::get() devuelve un puntero prestado. delete() destruiría la
          // triangulación que sigue perteneciendo a la cara y corrompería la BRep.
          const triangulation = handle.get();
          if (quality && (indices.length / 3 + triangulation.NbTriangles() > quality.maxTriangles || positions.length / 3 + triangulation.NbNodes() > quality.maxTriangles * 3)) {
            throw new Error('Esta resolución supera el presupuesto de la escena. Reduce la resolución.');
          }
          const transformation = own(location.Transformation());
          const reversed = enumEquals(face.Orientation_1(), oc.TopAbs_Orientation.TopAbs_REVERSED);
          const offset = positions.length / 3;
          const start = indices.length;
          triangulation.ComputeNormals();
          for (let index = 1; index <= triangulation.NbNodes(); index++) {
            withResources((nodeResources) => {
              const point = nodeResources.own(triangulation.Node(index));
              point.Transform(transformation);
              positions.push(...coords(point));
              const normal = nodeResources.own(triangulation.Normal_1(index));
              normal.Transform(transformation);
              const sign = reversed ? -1 : 1;
              normals.push(normal.X() * sign, normal.Y() * sign, normal.Z() * sign);
            });
          }
          for (let index = 1; index <= triangulation.NbTriangles(); index++) {
            const triangle = triangulation.Triangle(index);
            const a = offset + triangle.Value(1) - 1;
            const b = offset + triangle.Value(2) - 1;
            const c = offset + triangle.Value(3) - 1;
            triangle.delete();
            indices.push(a, reversed ? c : b, reversed ? b : c);
          }
          faces.push({ index: faceCount, start, count: indices.length - start, plane: isMesh ? null : this.facePlane(face) });
        });
        faceCount++;
        explorer.Next();
      }
      return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), faces, faceCount, ...properties };
    });
  }

  evaluateDocument(document, { known = [] } = {}) {
    const start = performance.now();
    const entries = this.resolve(document);
    const knownRevisions = new Map(known.map(({ id, revision }) => [id, revision]));
    const meshes = document.objects.map((object) => {
      const entry = entries.get(object.id);
      if (!entry.mesh) entry.mesh = this.tessellate(entry.shape, entry.isMesh);
      const mesh = entry.mesh;
      // El worker puede transferir estos buffers sin separar los almacenados en caché.
      return { id: object.id, revision: entry.revision, triangleCount: mesh.indices.length / 3,
        ...(knownRevisions.get(object.id) === entry.revision ? {} : { positions: mesh.positions.slice(), normals: mesh.normals.slice(), indices: mesh.indices.slice() }),
        volume: mesh.volume, bounds: mesh.bounds, faces: mesh.faces, faceCount: mesh.faceCount, solidCount: mesh.solidCount, isMesh: entry.isMesh };
    });
    const visible = meshes.filter((mesh) => document.objects.find((object) => object.id === mesh.id).visible !== false);
    const boxes = visible.map((mesh) => mesh.bounds).filter(Boolean);
    let bounds = null;
    if (boxes.length) {
      const min = [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis])));
      const max = [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis])));
      bounds = { min, max, size: max.map((value, index) => value - min[index]) };
    }
    return {
      meshes,
      stats: { objectCount: document.objects.length, visibleCount: visible.length,
        triangles: visible.reduce((total, mesh) => total + mesh.triangleCount, 0),
        volume: visible.some((mesh) => mesh.volume === null) ? null : visible.reduce((total, mesh) => total + mesh.volume, 0),
        bounds, milliseconds: performance.now() - start, units: 'mm' },
    };
  }

  convertToMesh(document, { id, quality = 1, maxTriangles = MAX_MESH_TRIANGLES } = {}) {
    if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > MAX_MESH_TRIANGLES) throw new Error('El presupuesto de malla no es válido.');
    const entry = this.resolve(document).get(id);
    if (!entry || entry.isMesh) throw new Error('Selecciona un sólido CAD para convertirlo a malla.');
    const properties = this.shapeProperties(entry.shape);
    if (!properties.solidCount) throw new Error('La pieza no contiene un sólido convertible.');
    const settings = meshQuality(quality, Math.max(...properties.bounds.size));
    const start = performance.now();
    return withResources(r => {
      // Copia profunda sin triangulación: una previa no altera la malla ni la BRep original.
      const copy = r.own(new this.oc.BRepBuilderAPI_Copy_2(entry.shape, true, false));
      const shape = r.own(copy.Shape());
      const tessellation = this.tessellate(shape, false, { ...settings, maxTriangles });
      // RWStl suelda vértices coincidentes y descarta triángulos degenerados (p. ej.
      // polos de una esfera). Mostrar esa misma malla que se guardará y reabrirá.
      const canonical = r.own(this.importShape({ format: 'stl', data: bytesToBase64(binaryStl(tessellation)) }));
      const mesh = this.tessellate(canonical, true);
      const data = binaryStl(mesh);
      return { mesh: { ...mesh, isMesh: true, faces: [], volume: null }, data, quality,
        triangles: mesh.indices.length / 3, deflection: settings.deflection, milliseconds: performance.now() - start };
    });
  }

  exportDocument(document, format) {
    if (!['step', 'stl'].includes(format)) throw new Error('El formato de exportación debe ser STEP o STL.');
    const entries = this.resolve(document);
    const visible = document.objects.filter((object) => object.visible !== false);
    if (!visible.length) throw new Error('Muestra al menos una pieza para exportar.');
    if (format === 'step' && visible.some((object) => entries.get(object.id).isMesh)) {
      throw new Error('Las piezas STL son mallas y no contienen sólidos BRep para STEP. Ocúltalas o exporta STL.');
    }
    const oc = this.oc;
    const filename = `/salida-${++this.fileSerial}.${format}`;
    try {
      return withResources((r) => {
        const compound = r.own(new oc.TopoDS_Compound());
        const builder = r.own(new oc.BRep_Builder());
        builder.MakeCompound(compound);
        for (const object of visible) builder.Add(compound, entries.get(object.id).shape);
        if (format === 'step') {
          const writer = r.own(new oc.STEPControl_Writer_1());
          const status = writer.Transfer(compound, oc.STEPControl_StepModelType.STEPControl_AsIs, true, r.own(new oc.Message_ProgressRange_1()));
          if (!enumEquals(status, oc.IFSelect_ReturnStatus.IFSelect_RetDone) ||
              !enumEquals(writer.Write(filename), oc.IFSelect_ReturnStatus.IFSelect_RetDone)) {
            throw new Error('OpenCascade no pudo escribir el archivo STEP.');
          }
        } else {
          for (const object of visible) {
            const entry = entries.get(object.id);
            if (!entry.isMesh) r.own(new oc.BRepMesh_IncrementalMesh_2(entry.shape, 0.08, false, 0.2, false));
          }
          if (!oc.StlAPI.Write(compound, filename, false)) throw new Error('OpenCascade no pudo escribir el archivo STL.');
        }
        const data = oc.FS.readFile(filename).slice();
        return { data, mime: format === 'step' ? 'model/step' : 'model/stl', extension: format, units: 'mm' };
      });
    } finally {
      try { oc.FS.unlink(filename); } catch { /* Puede fallar antes de crear el archivo. */ }
    }
  }
}
