/**
 * Mesh checks behind `npm run check:assets` (VISUAL_STATUS.md, asset quality bar): a model may be
 * low-poly but never broken. Pure functions on triangle lists, so they are unit-tested directly.
 */

export type TriMesh = {
  /** xyz per vertex, world space. */
  positions: ArrayLike<number>;
  /** Three vertex indices per triangle. */
  indices: ArrayLike<number>;
  /** xyz per vertex, if the mesh has normals. */
  normals?: ArrayLike<number>;
};

/** Vertices closer than this (m) are one vertex: texture seams split a mesh without opening it. */
const WELD = 1e-5;
/** Triangles smaller than this (m²) have no area. */
const MIN_AREA = 1e-10;

/** One id per distinct position, so seams split for UVs or normals do not count as open edges. */
function weld(p: ArrayLike<number>): number[] {
  const ids = new Map<string, number>();
  const out: number[] = [];
  for (let i = 0; i < p.length / 3; i++) {
    const key = [0, 1, 2].map((k) => Math.round((p[i * 3 + k] as number) / WELD)).join(",");
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    out.push(id);
  }
  return out;
}

/** Edges used by one triangle only (open: tears and holes) and by more than two (non-manifold). */
export function edges(m: TriMesh): { open: number; nonManifold: number } {
  const id = weld(m.positions);
  const count = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [0, 1, 2].map((k) => id[m.indices[t + k] as number] as number);
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let k = 0; k < 3; k++) {
      const a = v[k] as number;
      const b = v[(k + 1) % 3] as number;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const n of count.values()) {
    if (n === 1) open++;
    else if (n > 2) nonManifold++;
  }
  return { open, nonManifold };
}

const sub = (p: ArrayLike<number>, a: number, b: number) =>
  [0, 1, 2].map((k) => (p[a * 3 + k] as number) - (p[b * 3 + k] as number)) as [number, number, number];
const cross = (u: number[], v: number[]) => [
  (u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number),
  (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number),
  (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number),
];

/** Triangles with no area, and triangles whose winding faces away from their vertex normals. */
export function faces(m: TriMesh): { zeroArea: number; flipped: number } {
  let zeroArea = 0;
  let flipped = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.indices[t + k] as number) as [number, number, number];
    const n = cross(sub(m.positions, b, a), sub(m.positions, c, a));
    const len = Math.hypot(n[0] as number, n[1] as number, n[2] as number);
    if (len / 2 < MIN_AREA) {
      zeroArea++;
      continue;
    }
    if (!m.normals) continue;
    let dot = 0;
    for (const v of [a, b, c])
      for (let k = 0; k < 3; k++) dot += (n[k] as number) * (m.normals[v * 3 + k] as number);
    if (dot < 0) flipped++;
  }
  return { zeroArea, flipped };
}

/** Lowest point (m), for contact rules: on the floor, on the seat, on the table. */
export function bottom(m: TriMesh): number {
  let y = Infinity;
  for (let i = 1; i < m.positions.length; i += 3) y = Math.min(y, m.positions[i] as number);
  return y;
}
