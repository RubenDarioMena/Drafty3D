/** Selection references use exact BRep edges, never triangulation diagonals. */
export function validateEdgeSelection(params) {
  if (params.edges === undefined) {
    if (params.edgeCount !== undefined) throw new Error('La selección necesita sus referencias de aristas.');
    return;
  }
  if (!Number.isInteger(params.edgeCount) || params.edgeCount < 1 || params.edgeCount > 10000 ||
      !Array.isArray(params.edges) || !params.edges.length || params.edges.length > params.edgeCount) {
    throw new Error('La selección de aristas no es válida.');
  }
  const indices = new Set();
  for (const edge of params.edges) {
    if (!edge || Object.keys(edge).some(key => !['index', 'signature'].includes(key)) ||
        !Number.isInteger(edge.index) || edge.index < 0 || edge.index >= params.edgeCount || indices.has(edge.index) ||
        typeof edge.signature !== 'string' || !edge.signature.length || edge.signature.length > 500) {
      throw new Error('La selección de aristas no es válida.');
    }
    indices.add(edge.index);
  }
}

export function collectSubshapes(oc, shape, type, cast, own) {
  const explorer = own(new oc.TopExp_Explorer_2(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  const buckets = new Map(), result = [];
  while (explorer.More()) {
    const current = own(explorer.Current());
    const item = own(cast(current));
    const hash = item.HashCode(2147483647);
    const bucket = buckets.get(hash) || [];
    if (!bucket.some(previous => previous.IsSame(item))) {
      bucket.push(item); buckets.set(hash, bucket); result.push(item);
      if (result.length > 10000) throw new Error('La pieza contiene demasiados elementos para esta selección. Simplifica la geometría.');
    }
    explorer.Next();
  }
  return result;
}

export function describeEdge(oc, edge, bounds, own, display = true) {
  if (oc.BRep_Tool.Degenerated(edge)) return { points: [], signature: null };
  const curve = own(new oc.BRepAdaptor_Curve_2(edge));
  const first = curve.FirstParameter(), last = curve.LastParameter();
  if (!Number.isFinite(first) || !Number.isFinite(last)) return { points: [], signature: null };
  const pointAt = fraction => {
    const point = own(curve.Value(first + (last - first) * fraction));
    return [point.X(), point.Y(), point.Z()];
  };
  const type = curve.GetType().value;
  const segments = type === oc.GeomAbs_CurveType.GeomAbs_Line.value ? 1 : 64;
  const points = display ? Array.from({ length: segments + 1 }, (_, index) => pointAt(index / segments)) : [];
  // Normalizing preserves references under translation and primitive resizing.
  // A changed geometric signature fails safely instead of retargeting another edge.
  const samples = [0, 0.25, 0.5, 0.75, 1].map(fraction => pointAt(fraction).map((value, axis) =>
    Math.round((value - bounds.min[axis]) / (bounds.size[axis] || 1) * 100000)));
  const forward = JSON.stringify(samples), backward = JSON.stringify([...samples].reverse());
  return { points, signature: `${type}:${forward < backward ? forward : backward}` };
}
