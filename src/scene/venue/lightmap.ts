import * as THREE from "three";

/**
 * Light-map UVs for the fixed room (visual stage V2, ADR-2), computed the same way here and when
 * the room is exported for the bake, so the baked light lines up without shipping geometry.
 *
 * Surfaces are grouped into flat islands: triangles facing the same axis direction, on the same
 * plane (to 2 cm) and touching each other. Each island is a rectangle on its plane, packed into the
 * map at one texel density. A surface built later on one of those planes, inside an island (a wall
 * cut low by the dollhouse view), finds the same island, so it reuses the full wall's bake.
 */

/** Plane offsets within this distance (m) are the same plane: a bevel's faces join their side. */
const PLANE_STEP = 0.02;
/** Empty texels around each island, so filtering never reaches a neighbour's light. */
const PAD = 2;

type Island = {
  /** Axis (0 x, 1 y, 2 z) and side of the face normal, and the plane's offset in PLANE_STEPs. */
  key: string;
  /** Bounds on the plane (m): its two in-plane axes. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Where it lands in the map (texels). */
  x: number;
  y: number;
};

export type Atlas = { size: number; texelsPerMetre: number; islands: Island[] };

/** The in-plane axes for a face along `axis`, as [u, v]: floors use x/z, walls along x use x/y. */
const PLANE_AXES: Record<number, [number, number]> = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };

function faceKey(n: THREE.Vector3, p: THREE.Vector3): { key: string; axis: number } {
  const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const side = n.getComponent(axis) >= 0 ? "+" : "-";
  return { key: `${axis}${side}${Math.round(p.getComponent(axis) / PLANE_STEP)}`, axis };
}

/** Triangles of a world-space geometry: corners and face normal. */
function* triangles(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position");
  const idx = g.getIndex();
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const [ia, ib, ic] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    normal.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    yield { a, b, c, normal, corners: [ia, ib, ic] };
  }
}

/**
 * Builds the atlas from the room's full (uncut) surfaces, in world space. Faces `hidden` says are
 * never seen (a deck's top, a slab's underside) get no room in the map.
 */
export function buildAtlas(
  geos: readonly THREE.BufferGeometry[],
  hidden: (normal: THREE.Vector3, at: THREE.Vector3) => boolean = () => false,
  size = 2048,
): Atlas {
  // Flat islands: union triangles of one plane that share a corner position.
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i] as number] as number;
    return i;
  };
  const tris: { key: string; axis: number; pts: [number, number][] }[] = [];
  const byCorner = new Map<string, number>();
  for (const g of geos)
    for (const t of triangles(g)) {
      if (hidden(t.normal, t.a)) continue;
      const { key, axis } = faceKey(t.normal, t.a);
      const [ua, va] = PLANE_AXES[axis] as [number, number];
      const id = tris.length;
      parent.push(id);
      tris.push({ key, axis, pts: [t.a, t.b, t.c].map((p) => [p.getComponent(ua), p.getComponent(va)]) });
      for (const p of [t.a, t.b, t.c]) {
        const corner = `${key}|${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
        const other = byCorner.get(corner);
        if (other === undefined) byCorner.set(corner, id);
        else parent[find(id)] = find(other);
      }
    }
  const groups = new Map<number, Island>();
  tris.forEach((t, i) => {
    const r = find(i);
    let isl = groups.get(r);
    if (!isl)
      groups.set(
        r,
        (isl = { key: t.key, u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity, x: 0, y: 0 }),
      );
    for (const [u, v] of t.pts) {
      isl.u0 = Math.min(isl.u0, u);
      isl.v0 = Math.min(isl.v0, v);
      isl.u1 = Math.max(isl.u1, u);
      isl.v1 = Math.max(isl.v1, v);
    }
  });
  // Islands on one plane that overlap (two pieces of a wall split by an opening) become one.
  const islands = mergeOverlapping([...groups.values()]);
  // Largest density whose shelf packing fits the map.
  let lo = 1;
  let hi = 200;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (pack(islands, mid, size)) lo = mid;
    else hi = mid;
  }
  pack(islands, lo, size);
  return { size, texelsPerMetre: lo, islands };
}

function mergeOverlapping(list: Island[]): Island[] {
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as Island;
        const b = list[j] as Island;
        if (a.key !== b.key || a.u1 < b.u0 || b.u1 < a.u0 || a.v1 < b.v0 || b.v1 < a.v0) continue;
        a.u0 = Math.min(a.u0, b.u0);
        a.v0 = Math.min(a.v0, b.v0);
        a.u1 = Math.max(a.u1, b.u1);
        a.v1 = Math.max(a.v1, b.v1);
        list.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  // A stable order, whatever order the surfaces were built in.
  return list.sort(
    (a, b) => b.v1 - b.v0 - (a.v1 - a.v0) || a.key.localeCompare(b.key) || a.u0 - b.u0 || a.v0 - b.v0,
  );
}

/** Shelf packing at `tpm` texels per metre; false when it does not fit. */
function pack(islands: Island[], tpm: number, size: number): boolean {
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const isl of islands) {
    const w = Math.ceil((isl.u1 - isl.u0) * tpm) + 2 * PAD;
    const h = Math.ceil((isl.v1 - isl.v0) * tpm) + 2 * PAD;
    if (w > size) return false;
    if (x + w > size) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    if (y + h > size) return false;
    isl.x = x + PAD;
    isl.y = y + PAD;
    x += w;
    shelf = Math.max(shelf, h);
  }
  return true;
}

/**
 * Sets `uv1` on a world-space geometry from the atlas: each triangle's island is the one on its
 * plane containing its centre. A triangle on no island (a cut wall's top, under its cap) maps to
 * the first texel.
 */
export function applyAtlas(g: THREE.BufferGeometry, atlas: Atlas): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.getAttribute("position");
  const uv1 = new Float32Array(pos.count * 2);
  const byKey = new Map<string, Island[]>();
  for (const isl of atlas.islands) byKey.set(isl.key, [...(byKey.get(isl.key) ?? []), isl]);
  const eps = 1e-3;
  for (const t of triangles(geo)) {
    const { key, axis } = faceKey(t.normal, t.a);
    const [ua, va] = PLANE_AXES[axis] as [number, number];
    const cu = (t.a.getComponent(ua) + t.b.getComponent(ua) + t.c.getComponent(ua)) / 3;
    const cv = (t.a.getComponent(va) + t.b.getComponent(va) + t.c.getComponent(va)) / 3;
    const isl = byKey
      .get(key)
      ?.find((i) => cu >= i.u0 - eps && cu <= i.u1 + eps && cv >= i.v0 - eps && cv <= i.v1 + eps);
    t.corners.forEach((ci, k) => {
      const p = [t.a, t.b, t.c][k] as THREE.Vector3;
      const u = isl ? isl.x + (p.getComponent(ua) - isl.u0) * atlas.texelsPerMetre : 0.5;
      const v = isl ? isl.y + (p.getComponent(va) - isl.v0) * atlas.texelsPerMetre : 0.5;
      uv1[ci * 2] = u / atlas.size;
      uv1[ci * 2 + 1] = v / atlas.size;
    });
  }
  geo.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
  return geo;
}

/** FNV-1a over positions (to the millimetre): any change to the room's surfaces changes it. */
export function geometryHash(geos: readonly THREE.BufferGeometry[]): string {
  let h = 0x811c9dc5;
  for (const g of geos) {
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count * 3; i++) {
      h ^= Math.round((pos.array[i] as number) * 1000) & 0xffffffff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}
