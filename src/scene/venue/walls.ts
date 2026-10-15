import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WallData } from "../../domain/venue/schema";
import { wallFrame } from "../../domain/venue/model";
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
function pieceGeo(wall: WallData, p: Piece, thickness: number, inset = 0): THREE.BufferGeometry {
  const { dir, normal } = wallFrame(wall);
  const w = p.s1 - p.s0;
  const g = new THREE.BoxGeometry(w, p.y1 - p.y0, thickness);
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

/** Red brick band height on the north wall (R06, R07). */
const RED_BAND = 1.05;
export const CUT_HEIGHT = 1.15;

export function buildWall(wall: WallData, height: number, thickness: number, cut: boolean): WallMeshes {
  const full = wallPieces(wall, wall.height ?? height);
  const pieces = cut ? clip(full, CUT_HEIGHT) : full;
  const [low, high] = wall.id === "north" ? splitAt(pieces, RED_BAND) : [[], pieces];

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
      if (s1 > s0 && b > a) panels.push(pieceGeo(wall, { s0, s1, y0: a, y1: b }, 0.04, 0.04));
    }
  }

  const caps = cut
    ? pieces
        .filter((p) => p.y1 >= CUT_HEIGHT - 1e-6)
        .map((p) => pieceGeo(wall, { ...p, y0: CUT_HEIGHT, y1: CUT_HEIGHT + 0.02 }, thickness + 0.02, 0.01))
    : [];

  return {
    brick: merged(
      high.map((p) => pieceGeo(wall, p, thickness)),
      TILE.brick,
    ),
    redBrick: merged(
      low.map((p) => pieceGeo(wall, p, thickness)),
      TILE.brick,
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
