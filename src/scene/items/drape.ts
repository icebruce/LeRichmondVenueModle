import * as THREE from "three";
import {
  CLOTH_FLARE as FLARE,
  CLOTH_FOLD as FOLD,
  CLOTH_GAP as GAP,
  CORNER_GATHER,
} from "../../domain/layout/cloth";

/** One fold every this many metres of edge. */
const FOLD_PITCH = 0.28;

export type Outline = { kind: "round"; radius: number } | { kind: "rect"; length: number; width: number };

/** Rows down the drop, and the extra rows of the eased top edge. */
export const DRAPE_ROWS = 8;
const EDGE_ROWS = 2;

/**
 * A point on a rounded rectangle of half sizes `a`, `b` and corner radius `r`, at share `u` of the
 * way round, with its outward normal and whether it lies on a corner. The walk starts on the east
 * edge and goes east, south-east corner, south, south-west corner, west, north-west, north, north-east.
 */
function roundedRect(
  a: number,
  b: number,
  r: number,
  u: number,
): { p: THREE.Vector2; n: THREE.Vector2; corner: number } {
  const [ca, cb] = [a - r, b - r];
  const quarter = (Math.PI / 2) * r;
  // Straight edges [from, to, normal]; each is followed by the corner turning from its normal.
  const edges: [[number, number], [number, number], [number, number]][] = [
    [
      [a, -cb],
      [a, cb],
      [1, 0],
    ],
    [
      [ca, b],
      [-ca, b],
      [0, 1],
    ],
    [
      [-a, cb],
      [-a, -cb],
      [-1, 0],
    ],
    [
      [-ca, -b],
      [ca, -b],
      [0, -1],
    ],
  ];
  const centres: [number, number][] = [
    [ca, cb],
    [-ca, cb],
    [-ca, -cb],
    [ca, -cb],
  ];
  const lengths = [2 * cb, quarter, 2 * ca, quarter, 2 * cb, quarter, 2 * ca, quarter];
  let s = (((u % 1) + 1) % 1) * lengths.reduce((x, y) => x + y, 0);
  for (let i = 0; i < 8; i++) {
    const l = lengths[i] as number;
    if (s > l && i < 7) {
      s -= l;
      continue;
    }
    const k = l ? Math.min(1, s / l) : 0;
    const side = i >> 1;
    if (i % 2 === 0) {
      const [[fx, fz], [tx, tz], [nx, nz]] = edges[side] as [
        [number, number],
        [number, number],
        [number, number],
      ];
      return {
        p: new THREE.Vector2(fx + (tx - fx) * k, fz + (tz - fz) * k),
        n: new THREE.Vector2(nx, nz),
        corner: 0,
      };
    }
    const [cx, cz] = centres[side] as [number, number];
    const angle = (side + k) * (Math.PI / 2);
    const n = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    return { p: new THREE.Vector2(cx + n.x * r, cz + n.y * r), n, corner: 1 };
  }
  return { p: new THREE.Vector2(a, 0), n: new THREE.Vector2(1, 0), corner: 0 };
}

/**
 * A tablecloth hung on a table of `outline`, its top at `top` and its hem `drop` below (V4, LIB-03):
 * an eased top edge, folds that deepen toward the hem, the corners of a rectangle gathered round, and
 * the hem flaring a little. Columns round the edge and rows down; the top is one fan.
 */
export function drapeGeometry(
  outline: Outline,
  top: number,
  drop: number,
  segments = 64,
): THREE.BufferGeometry {
  const perimeter =
    outline.kind === "round" ? 2 * Math.PI * outline.radius : 2 * (outline.length + outline.width);
  const folds = Math.max(6, Math.round(perimeter / FOLD_PITCH));
  const cols = outline.kind === "round" ? segments : Math.max(segments, Math.round(perimeter / 0.05));
  const rows = EDGE_ROWS + DRAPE_ROWS + 1;
  const ring = (u: number, t: number) => {
    if (outline.kind === "round") {
      const a = u * Math.PI * 2;
      const n = new THREE.Vector2(Math.cos(a), Math.sin(a));
      return { p: n.clone().multiplyScalar(outline.radius), n, corner: 0 };
    }
    // The corner rounds out as it falls: crisp at the top, gathered at the hem.
    const r = 0.02 + 0.13 * Math.pow(t, 1.2);
    return roundedRect(outline.length / 2, outline.width / 2, r, u);
  };
  const pos: number[] = [0, top + 0.003, 0];
  const uv: number[] = [0, 0];
  for (let row = 0; row < rows; row++) {
    // Rows 0 and 1 ease over the top edge; then the drop from the edge to the hem.
    const t = row < EDGE_ROWS ? 0 : (row - EDGE_ROWS) / DRAPE_ROWS;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const { p, n, corner } = ring(u, t);
      const gather = 1 + (CORNER_GATHER - 1) * corner;
      const fold = FOLD * gather * Math.pow(t, 1.5) * 0.5 * Math.sin(u * folds * Math.PI * 2);
      const out = row === 0 ? GAP - 0.012 : GAP + FLARE * Math.pow(t, 1.3) + fold;
      const y = row === 0 ? top + 0.003 : row === 1 ? top - 0.006 : top - 0.006 - (drop - 0.006) * t;
      pos.push(p.x + n.x * out, y, p.y + n.y * out);
      uv.push(u * perimeter, top - y);
    }
  }
  const index: number[] = [];
  const at = (row: number, c: number) => 1 + row * (cols + 1) + c;
  for (let c = 0; c < cols; c++) index.push(0, at(0, c + 1), at(0, c));
  for (let row = 0; row < rows - 1; row++)
    for (let c = 0; c < cols; c++) {
      const [a, b, d, e] = [at(row, c), at(row, c + 1), at(row + 1, c), at(row + 1, c + 1)];
      index.push(a, b, d, b, e, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // The seam's two columns share one normal, so no crease shows where the edge closes.
  const normal = g.getAttribute("normal");
  for (let row = 0; row < rows; row++) {
    const [a, b] = [at(row, 0), at(row, cols)];
    const v = new THREE.Vector3()
      .fromBufferAttribute(normal, a)
      .add(new THREE.Vector3().fromBufferAttribute(normal, b))
      .normalize();
    normal.setXYZ(a, v.x, v.y, v.z);
    normal.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

/** Vertices `drapeGeometry` makes for `outline` (unit tests, budgets). */
export function drapeVertexCount(outline: Outline, segments = 64): number {
  const perimeter =
    outline.kind === "round" ? 2 * Math.PI * outline.radius : 2 * (outline.length + outline.width);
  const cols = outline.kind === "round" ? segments : Math.max(segments, Math.round(perimeter / 0.05));
  return 1 + (EDGE_ROWS + DRAPE_ROWS + 1) * (cols + 1);
}

const shared = new Map<string, THREE.BufferGeometry>();

/**
 * `drapeGeometry`, shared by every table of the same size and length. The cache lives as long as the
 * page: there are only as many entries as table sizes in use.
 */
export function sharedDrape(outline: Outline, top: number, drop: number, segments: number) {
  const size = outline.kind === "round" ? `${outline.radius}` : `${outline.length}x${outline.width}`;
  const key = `${outline.kind}:${size}:${top}:${drop}:${segments}`;
  let g = shared.get(key);
  if (!g) shared.set(key, (g = drapeGeometry(outline, top, drop, segments)));
  return g;
}
