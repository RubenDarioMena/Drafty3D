// Your turn for strokes: does the learner's finger path follow the recorded stroke?
// Pure geometry on screen points, so the rule is testable without a browser.

const SAMPLES = 32;

function length(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** Evenly spaced points along a polyline, by arc length. */
export function resample(points, count = SAMPLES) {
  if (points.length < 2) return points.slice();
  const total = length(points);
  if (!total) return Array.from({ length: count }, () => ({ ...points[0] }));
  const out = [];
  let segment = 1;
  let walked = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (total * i) / (count - 1);
    while (segment < points.length - 1) {
      const step = Math.hypot(points[segment].x - points[segment - 1].x, points[segment].y - points[segment - 1].y);
      if (walked + step >= target) break;
      walked += step;
      segment += 1;
    }
    const a = points[segment - 1];
    const b = points[segment];
    const step = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const t = Math.min(1, Math.max(0, (target - walked) / step));
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function distanceToPolyline(point, polyline) {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)));
  }
  return polyline.length === 1 ? Math.hypot(point.x - polyline[0].x, point.y - polyline[0].y) : best;
}

/**
 * The stroke counts when the trace covers the guide, stays near it and starts at its start.
 * `tolerance` is in screen pixels (the brush radius on screen, with a floor for fingers).
 */
export function traceMatches(trace, guide, tolerance) {
  if (trace.length < 2 || guide.length < 2) return { ok: false, reason: 'short' };
  const guideSamples = resample(guide);
  const traceSamples = resample(trace);
  const covered = guideSamples.filter(point => distanceToPolyline(point, trace) <= tolerance).length / guideSamples.length;
  const near = traceSamples.filter(point => distanceToPolyline(point, guide) <= tolerance).length / traceSamples.length;
  const start = guide[0];
  const end = guide[guide.length - 1];
  const guideLength = length(guide);
  // A loop ends where it starts, so any starting point works. Judged on the guide's own shape, not the
  // tolerance: a short straight stroke under a big brush must still be drawn from its start.
  const closed = Math.hypot(start.x - end.x, start.y - end.y) < 0.2 * guideLength;
  const fromStart = Math.hypot(trace[0].x - start.x, trace[0].y - start.y);
  const fromEnd = Math.hypot(trace[0].x - end.x, trace[0].y - end.y);
  const direction = closed || fromStart <= fromEnd;
  // A tap is not a stroke, even when the brush ring is wider than the stroke.
  const long = length(trace) >= 0.5 * guideLength;
  const ok = long && covered >= 0.8 && near >= 0.75 && direction;
  const reason = ok ? null : !long ? 'short' : !direction ? 'direction' : covered < 0.8 ? 'coverage' : 'off-path';
  return { ok, covered, near, direction, reason };
}
