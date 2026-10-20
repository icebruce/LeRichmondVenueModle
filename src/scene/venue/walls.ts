import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WallData } from "../../domain/venue/schema";
import { wallFrame } from "../../domain/venue/model";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TILE, metreUV } from "../materials";

/** Wall pieces in wall space: s along the wall, y up. */
type Piece = { s0: number; s1: number; y0: number; y1: number };

/** Solid parts of a wall after cutting out its openings. */
export function wallPieces(wall: WallData, height: number): Piece[] {
  const { length } = wallFrame(wall);
  const openings = [...wall.openings].sort((a, b) => a.start - b.start);
  const pieces: Piece[] = [];
  let s = 0;
  for (const o of openings) {
    if (o.start > s) pieces.push({ s0: s, s1: o.start, y0: 0, y1: height });
    if (o.sill > 0) pieces.push({ s0: o.start, s1: o.end, y0: 0, y1: o.sill });
    if (o.head < height) pieces.push({ s0: o.start, s1: o.end, y0: o.head, y1: height });
    s = Math.max(s, o.end);
  }
  if (s < length) pieces.push({ s0: s, s1: length, y0: 0, y1: height });
  return pieces;
}

function splitAt(pieces: Piece[], y: number): [Piece[], Piece[]] {
  const below: Piece[] = [];
  const above: Piece[] = [];
  for (const p of pieces) {
    if (p.y1 <= y) below.push(p);
    else if (p.y0 >= y) above.push(p);
    else {
      below.push({ ...p, y1: y });
      above.push({ ...p, y0: y });
    }
  }
  return [below, above];
}

function clip(pieces: Piece[], maxY: number): Piece[] {
  return pieces.filter((p) => p.y0 < maxY).map((p) => ({ ...p, y1: Math.min(p.y1, maxY) }));
}

/** World-space box for a piece; the wall's thickness extends away from the room. */
function pieceGeo(wall: WallData, p: Piece, thickness: number, inset = 0, bevel = 0): THREE.BufferGeometry {
  const { dir, normal } = wallFrame(wall);
  const w = p.s1 - p.s0;
  const h = p.y1 - p.y0;
  const g = bevel
    ? new RoundedBoxGeometry(w, h, thickness, 1, Math.min(bevel, w / 2, h / 2))
    : new THREE.BoxGeometry(w, h, thickness);
  // Local box: x along the wall, z across it (+z toward the room).
  g.translate(w / 2, (p.y0 + p.y1) / 2, -thickness / 2 + inset);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(dir[0], 0, dir[1]),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(normal[0], 0, normal[1]),
  );
  m.setPosition(wall.from[0] + dir[0] * p.s0, 0, wall.from[1] + dir[1] * p.s0);
  g.applyMatrix4(m);
  return g;
}

function merged(geos: THREE.BufferGeometry[], tile: number): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => x.toNonIndexed()));
  return g ? metreUV(g, tile) : null;
}

export type WallMeshes = {
  brick: THREE.BufferGeometry | null;
  redBrick: THREE.BufferGeometry | null;
  panel: THREE.BufferGeometry | null;
  cap: THREE.BufferGeometry | null;
};

export const CUT_HEIGHT = 1.15;

export function buildWall(wall: WallData, height: number, thickness: number, cut: boolean): WallMeshes {
  const full = wallPieces(wall, wall.height ?? height);
  const pieces = cut ? clip(full, CUT_HEIGHT) : full;
  // Red brick dado band where the photos show one (wall.dado = its height).
  const [low, high] = wall.dado ? splitAt(pieces, wall.dado) : [[], pieces];

  const panels: THREE.BufferGeometry[] = [];
  for (const pn of wall.panels ?? []) {
    const y0 = pn.from ?? 0;
    const y1 = cut ? Math.min(pn.height, CUT_HEIGHT) : pn.height;
    if (y1 <= y0) continue;
    // Panels cover solid wall only: intersect with each piece.
    for (const p of pieces) {
      const s0 = Math.max(p.s0, pn.start);
      const s1 = Math.min(p.s1, pn.end);
      const a = Math.max(p.y0, y0);
      const b = Math.min(p.y1, y1);
      if (!(s1 > s0 && b > a)) continue;
      panels.push(pieceGeo(wall, { s0, s1, y0: a, y1: b }, 0.04, 0.04));
      // Flat paint with one ledge at 0.9 m (R04).
      const r = y0 + 0.9;
      if (r - 0.03 >= a && r + 0.03 <= b)
        panels.push(pieceGeo(wall, { s0, s1, y0: r - 0.03, y1: r + 0.03 }, 0.03, 0.07));
    }
  }

  const caps = cut
    ? pieces
        .filter((p) => p.y1 >= CUT_HEIGHT - 1e-6)
        .map((p) =>
          pieceGeo(wall, { ...p, y0: CUT_HEIGHT, y1: CUT_HEIGHT + 0.06 }, thickness + 0.06, 0.03, 0.015),
        )
    : [];

  return {
    brick: merged(
      high.map((p) => pieceGeo(wall, p, thickness)),
      TILE.brick,
    ),
    redBrick: merged(
      low.map((p) => pieceGeo(wall, p, thickness)),
      TILE.redBrick,
    ),
    panel: merged(panels, 1),
    cap: merged(caps, 1),
  };
}

/** Where along a wall an opening sits, as a world transform (x along the opening, +z into the room). */
export function openingMatrix(wall: WallData, start: number): THREE.Matrix4 {
  const { dir, normal } = wallFrame(wall);
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(dir[0], 0, dir[1]),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(normal[0], 0, normal[1]),
  );
  m.setPosition(wall.from[0] + dir[0] * start, 0, wall.from[1] + dir[1] * start);
  return m;
}

/**
 * A wall's faces split by which way they look: `inner`, the face toward the room and the reveals of
 * its openings (their sides, sill and head: they carry the baked light, V2, and its contact
 * occlusion where they meet the frames and the floor), and `outer`, everything else (its back, ends
 * and top, seen from the dollhouse and lit live). Geometry must be non-indexed, in world space.
 */
export function splitFacing(
  g: THREE.BufferGeometry,
  wall: WallData,
): { inner: THREE.BufferGeometry; outer: THREE.BufferGeometry } {
  const { normal, dir } = wallFrame(wall);
  const pos = g.getAttribute("position");
  const names = Object.keys(g.attributes);
  const parts = { inner: [] as number[], outer: [] as number[] };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const e = 0.02;
  // A face across the wall (no part of its room face or back) inside an opening's frame.
  const reveal = (n: THREE.Vector3, at: THREE.Vector3) => {
    if (Math.abs(n.x * normal[0] + n.z * normal[1]) > 0.1) return false;
    const s = (at.x - wall.from[0]) * dir[0] + (at.z - wall.from[1]) * dir[1];
    return wall.openings.some(
      (o) => s > o.start - e && s < o.end + e && at.y > o.sill - e && at.y < o.head + e,
    );
  };
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    mid.copy(a).add(b).add(c).divideScalar(3);
    const n = c.sub(b).cross(a.sub(b)).normalize();
    const facing = n.x * normal[0] + n.z * normal[1] > 0.9 || reveal(n, mid);
    (facing ? parts.inner : parts.outer).push(i, i + 1, i + 2);
  }
  const pick = (list: number[]) => {
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const src = g.getAttribute(name);
      const arr = new Float32Array(list.length * src.itemSize);
      list.forEach((v, k) => {
        for (let j = 0; j < src.itemSize; j++) arr[k * src.itemSize + j] = src.getComponent(v, j);
      });
      out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
    }
    return out;
  };
  return { inner: pick(parts.inner), outer: pick(parts.outer) };
}
