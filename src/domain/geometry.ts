// Planar geometry on the floor plane. x = east, z = south (metres).

export type Vec2 = readonly [number, number];
export type Polygon = readonly Vec2[];

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);

/** Rotate around the origin. Positive angle turns +x toward -z (three.js rotation about +y). */
export function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
}

export function transform(local: Polygon, x: number, z: number, angle: number): Polygon {
  return local.map((p) => add(rotate(p, angle), [x, z]));
}

export function rect(x0: number, z0: number, x1: number, z1: number): Polygon {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/** Axis-aligned rectangle centred on the origin. */
export function centredRect(w: number, d: number): Polygon {
  return rect(-w / 2, -d / 2, w / 2, d / 2);
}

export function circle(r: number, segments = 16): Polygon {
  return Array.from({ length: segments }, (_, i): Vec2 => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

export function area(poly: Polygon): number {
  let s = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length] as Vec2;
    s += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(s) / 2;
}

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec2;
    const b = poly[j] as Vec2;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function edgesCross(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i] as Vec2;
    const a1 = a[(i + 1) % a.length] as Vec2;
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a0, a1, b[j] as Vec2, b[(j + 1) % b.length] as Vec2)) return true;
    }
  }
  return false;
}

/** True when the interiors overlap (works for concave polygons). Touching edges do not count. */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  if (edgesCross(a, b)) return true;
  return a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a));
}

/** True when every point of `inner` lies inside `outer` (outer may be concave). */
export function polygonInside(inner: Polygon, outer: Polygon): boolean {
  return inner.every((p) => pointInPolygon(p, outer)) && !edgesCross(inner, outer);
}

export function centroid(poly: Polygon): Vec2 {
  const n = poly.length;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

/** Shortest distance from point p to segment ab. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12)));
  return len(sub(p, add(a, [ab[0] * t, ab[1] * t])));
}

export function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function normalizeAngle(a: number): number {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}
