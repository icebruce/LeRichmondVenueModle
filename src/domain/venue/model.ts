import { type Polygon, type Vec2, rect } from "../geometry";
import { type VenueData, type WallData, venueSchema } from "./schema";

export type Level = "main" | "raised" | "mezzanine";

/** A fixed thing furniture may not overlap, with the name used in refusal messages. */
export type Obstacle = { id: string; label: string; polygon: Polygon };

export type VenueModel = {
  data: VenueData;
  width: number;
  depth: number;
  ceiling: number;
  room: Polygon;
  raised: { outline: Polygon; height: number };
  mezzanineHeight: number;
  obstacles: Obstacle[];
  /** Railing along the raised floor's open edges, as straight runs that stop at the steps. */
  railing: [Vec2, Vec2][];
};

export function parseVenue(json: unknown): VenueData {
  return venueSchema.parse(json);
}

/** Unit direction and inward normal of a wall. Walls are listed with the room on their left. */
export function wallFrame(wall: WallData): { dir: Vec2; normal: Vec2; length: number } {
  const dx = wall.to[0] - wall.from[0];
  const dz = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dz);
  const dir: Vec2 = [dx / length, dz / length];
  return { dir, normal: [-dir[1], dir[0]], length };
}

/** Point at distance `s` along a wall, offset `inset` into the room. */
export function alongWall(wall: WallData, s: number, inset = 0): Vec2 {
  const { dir, normal } = wallFrame(wall);
  return [wall.from[0] + dir[0] * s + normal[0] * inset, wall.from[1] + dir[1] * s + normal[1] * inset];
}

/**
 * Railing runs: every raised-floor edge not against a wall or the bar, split where a step crosses it
 * and stopped along the stair, whose own balustrade bounds that edge (owner, 2026-10-17).
 * Sampled every 12 cm, the baluster pitch the scene draws.
 */
function railingRuns(d: VenueData, width: number, depth: number): [Vec2, Vec2][] {
  const outline = d.levels.raised.outline.value;
  const bx1 = d.bar.outer.value[2];
  const onBoundary = (p: Vec2, q: Vec2) =>
    (p[0] === q[0] && (p[0] <= 0 || p[0] >= width || p[0] === bx1)) ||
    (p[1] === q[1] && (p[1] <= 0 || p[1] >= depth));
  const [ux0, uz0, ux1, uz1] = d.stair.upperLanding;
  const gaps: { from: Vec2; to: Vec2 }[] = [
    ...d.levels.raised.steps.value,
    d.stair.flight,
    { from: [ux0, uz0], to: [ux1, uz1] },
  ];
  // No post inside the bar or under its top's overhang (the run meets the bar's south-east corner).
  const [bx0, bz0, , bz1] = d.bar.outer.value;
  const atBar = (x: number, z: number) =>
    x >= bx0 - 0.1 && x <= bx1 + 0.1 && z >= bz0 - 0.1 && z <= bz1 + 0.1;
  const inGap = (x: number, z: number) =>
    atBar(x, z) ||
    gaps.some(
      (g) =>
        x >= Math.min(g.from[0], g.to[0]) - 0.05 &&
        x <= Math.max(g.from[0], g.to[0]) + 0.05 &&
        z >= Math.min(g.from[1], g.to[1]) - 0.05 &&
        z <= Math.max(g.from[1], g.to[1]) + 0.05,
    );
  const runs: [Vec2, Vec2][] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] as Vec2;
    if (onBoundary(a, b)) return;
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12));
    const at = (k: number): Vec2 => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    let start: number | null = null;
    for (let k = 0; k <= n; k++) {
      const gap = inGap(...at(k));
      if (!gap) start ??= k;
      if ((gap || k === n) && start !== null) {
        const end = gap ? k - 1 : k;
        if (end > start) runs.push([at(start), at(end)]);
        start = null;
      }
    }
  });
  return runs;
}

/** Where a bar flower stands (VEN-06): the point, which run of the bar top, and metres along it. */
export type BarTopPlace = { point: Vec2; run: "west" | "front" | "east"; along: number };

/** How far from each open end of the bar top a vase can stand, so it never overhangs (VEN-06). */
const BAR_END_INSET = 0.15;

/** The three runs of the bar top's middle line, west side from its north end, front, east side to its north end. */
function barTopRuns(d: VenueData): { run: BarTopPlace["run"]; a: Vec2; b: Vec2; length: number }[] {
  const [x0, z0, x1, z1] = d.bar.outer.value;
  const wx = x0 + d.bar.legWidth / 2;
  const ex = x1 - d.bar.legWidth / 2;
  const fz = z1 - d.bar.frontDepth / 2;
  const nz = z0 + BAR_END_INSET;
  const runs: [BarTopPlace["run"], Vec2, Vec2][] = [
    ["west", [wx, nz], [wx, fz]],
    ["front", [wx, fz], [ex, fz]],
    ["east", [ex, fz], [ex, nz]],
  ];
  return runs.map(([run, a, b]) => ({ run, a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }));
}

/** Length of the bar top's middle line a vase can travel (VEN-06). */
export function barTopLength(d: VenueData): number {
  return barTopRuns(d).reduce((n, r) => n + r.length, 0);
}

/**
 * Where a bar flower stands at `t` from 0 to 1 along the middle of the bar top (VEN-06): from the
 * north end of the west side, round the front, to the north end of the east side.
 */
export function barTopPlace(d: VenueData, t: number): BarTopPlace {
  const runs = barTopRuns(d);
  let s = Math.min(1, Math.max(0, t)) * runs.reduce((n, r) => n + r.length, 0);
  for (const [i, r] of runs.entries()) {
    if (s <= r.length || i === runs.length - 1) {
      const k = r.length ? Math.min(1, s / r.length) : 0;
      return {
        point: [r.a[0] + (r.b[0] - r.a[0]) * k, r.a[1] + (r.b[1] - r.a[1]) * k],
        run: r.run,
        along: Math.min(s, r.length),
      };
    }
    s -= r.length;
  }
  throw new Error("unreachable");
}

function barObstacles(d: VenueData): Obstacle[] {
  const [x0, z0, x1, z1] = d.bar.outer.value;
  const leg = d.bar.legWidth;
  const front = d.bar.frontDepth;
  return [
    { id: "bar-west", label: "the bar", polygon: rect(x0, z0, x0 + leg, z1) },
    { id: "bar-east", label: "the bar", polygon: rect(x1 - leg, z0, x1, z1) },
    { id: "bar-south", label: "the bar", polygon: rect(x0, z1 - front, x1, z1) },
    // The bartenders' well inside the U is not guest floor.
    {
      id: "bar-well",
      label: "the bar",
      polygon: rect(x0 + leg, d.backBar.rearCounter[3], x1 - leg, z1 - front),
    },
  ];
}

export function buildVenue(d: VenueData): VenueModel {
  const width = d.room.width.value;
  const depth = d.room.depth.value;
  const [bx0, bz0, bx1, bz1] = d.backBar.rect.value;
  const rc = d.backBar.rearCounter;
  const [lx0, lz0, lx1, lz1] = d.stair.landing;
  const fl = d.stair.flight;
  const [ux0, uz0, ux1, uz1] = d.stair.upperLanding;
  const f2 = d.stair.upperFlight;
  const [wx0, wz0, wx1, wz1] = d.fixtures.wineWall.rect;

  const obstacles: Obstacle[] = [
    ...barObstacles(d),
    { id: "back-bar", label: "the back bar", polygon: rect(bx0, bz0, bx1, Math.max(bz1, rc[3])) },
    { id: "stair-landing", label: "the stair landing", polygon: rect(lx0, lz0, lx1, lz1) },
    {
      id: "stair",
      label: "the stair",
      polygon: rect(
        Math.min(fl.from[0], fl.to[0]),
        Math.min(fl.from[1], fl.to[1]),
        Math.max(fl.from[0], fl.to[0]),
        Math.max(fl.from[1], fl.to[1]),
      ),
    },
    { id: "stair-upper", label: "the stair", polygon: rect(ux0, uz0, ux1, uz1) },
    {
      id: "stair-second-flight",
      label: "the stair",
      // Only the part inside the room: the rest rises behind the south wall.
      polygon: rect(
        Math.min(f2.from[0], f2.to[0]),
        Math.min(f2.from[1], f2.to[1]),
        Math.max(f2.from[0], f2.to[0]),
        Math.min(depth, Math.max(f2.from[1], f2.to[1])),
      ),
    },
    { id: "wine-wall", label: "the wine wall", polygon: rect(wx0, wz0, wx1, wz1) },
    ...d.fixtures.banquettes
      .filter((b) => !b.disabled && b.x0 !== undefined && b.x1 !== undefined)
      .map((b, i) => ({
        id: `banquette-${i}`,
        label: "the banquette",
        polygon: rect(b.x0 as number, 0, b.x1 as number, b.depth),
      })),
  ];

  return {
    data: d,
    width,
    depth,
    ceiling: d.room.ceiling.value,
    room: rect(0, 0, width, depth),
    raised: { outline: d.levels.raised.outline.value, height: d.levels.raised.height.value },
    mezzanineHeight: d.mezzanine.floorHeight.value,
    obstacles,
    railing: railingRuns(d, width, depth),
  };
}
