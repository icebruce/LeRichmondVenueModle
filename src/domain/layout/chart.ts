import {
  type Polygon,
  type Vec2,
  centredRect,
  circle,
  pointInPolygon,
  polygonInside,
  polygonsOverlap,
  rect,
  transform,
} from "../geometry";
import type { Catalog } from "../library/catalog";
import type { Scenario } from "../scenario/schema";
import type { VenueModel } from "../venue/model";
import { seatsOf, shapeOf } from "./items";
import { type Seat, layoutSeats } from "./seating";
import { toggledObstacles } from "./validate";

/**
 * The printed plans (EXP-01, SEA-04): Letter landscape laid out at 150 dpi, the room as the Plan
 * view shows it (the back bar at the top) under a title line and over a footer line.
 */
export const PAGE = { width: 1650, height: 1275, margin: 45, top: 88, bottom: 70 } as const;
/** The walls stand 0.24 m outside the room's interior. */
const WALL_PAD = 0.3;

/** Where the room is drawn, in drawing units. */
export type Frame = { x: number; y: number; w: number; h: number };

/** The room fitted into a frame: metres to drawing units, and `k`, the type scale to the page's. */
export type Fit = { scale: number; sx: number; ox: number; oy: number; k: number };

const pageFrame: Frame = {
  x: PAGE.margin,
  y: PAGE.top,
  w: PAGE.width - 2 * PAGE.margin,
  h: PAGE.height - PAGE.top - PAGE.bottom,
};

function fitScale(venue: VenueModel, frame: Frame, stretch: number): number {
  return Math.min(frame.w / ((venue.width + 2 * WALL_PAD) * stretch), frame.h / (venue.depth + 2 * WALL_PAD));
}

/**
 * The seating chart (SEA-04) draws the room as a diagram, not to scale: stretched across the whole
 * page width, the side margins going to the seats so their guests' names fit on one row.
 */
export function seatingStretch(venue: VenueModel): number {
  const across = pageFrame.w / (venue.width + 2 * WALL_PAD);
  const down = pageFrame.h / (venue.depth + 2 * WALL_PAD);
  return Math.max(1, across / down);
}

/** The room in `frame`, `stretch` times wider than to scale; type keeps its size on the page. */
export function fitRoom(venue: VenueModel, frame: Frame, stretch: number): Fit {
  const scale = fitScale(venue, frame, stretch);
  const sx = scale * stretch;
  return {
    scale,
    sx,
    ox: frame.x + (frame.w - venue.width * sx) / 2,
    oy: frame.y + (frame.h - venue.depth * scale) / 2,
    k: scale / fitScale(venue, pageFrame, stretch),
  };
}

export const onPage = (f: Fit, p: Vec2): [number, number] => [f.ox + p[0] * f.sx, f.oy + p[1] * f.scale];

/** The DJ booth and the dance area: floor pieces names and longer tables keep clear of. */
function floorPieces(scenario: Scenario, catalog: Catalog): Polygon[] {
  return scenario.items.flatMap((it) => {
    const sh = shapeOf(it, catalog);
    return sh.kind === "djBooth" || sh.kind === "danceFloor"
      ? [transform(centredRect(sh.width, sh.depth), it.x, it.z, it.rotY)]
      : [];
  });
}

const LONGER_MAX = 1.3;

/** How far a table is drawn past its real ends on the seating chart, in metres along it. */
export type Ends = { neg: number; pos: number };

/**
 * How much longer each rectangular table may be drawn on the seating chart (SEA-04), at either end:
 * in all up to (LONGER_MAX − 1) × its length, each end as far as its top touches nothing it did not
 * already touch at its real length: walls, the bar, stair or banquettes, the DJ, the dance area,
 * another table, or the raised floor's edge. An end with a chair is not grown, so its guest's name
 * keeps the room it has (LAY-03). Tables alike (same library item and side seats) grow by the same
 * amount, so they still match.
 */
export function longerTables(scenario: Scenario, venue: VenueModel, catalog: Catalog): Map<string, Ends> {
  const fixed: Polygon[] = [
    ...venue.obstacles.map((o) => o.polygon),
    ...toggledObstacles(venue, scenario.venueToggles).map((o) => o.polygon),
    ...floorPieces(scenario, catalog),
  ];
  const raised = venue.raised.outline;
  const tables = scenario.items.filter((it) => seatsOf(shapeOf(it, catalog)) > 0);
  // A table's top with a hand's breadth around it, grown at its ends.
  const top = (it: (typeof tables)[number], e: Ends): Polygon => {
    const sh = shapeOf(it, catalog);
    if (sh.kind !== "rectTable")
      return transform(circle(sh.kind === "roundTable" ? sh.diameter / 2 + 0.15 : 0.5, 24), it.x, it.z, 0);
    const [l, w] = [sh.length / 2 + 0.15, sh.width / 2 + 0.15];
    return transform(rect(-l - e.neg, -w, l + e.pos, w), it.x, it.z, it.rotY);
  };
  const none: Ends = { neg: 0, pos: 0 };
  const touches = (it: (typeof tables)[number], e: Ends): string[] => {
    const fp = top(it, e);
    return [
      ...fixed.flatMap((pg, i) => (polygonsOverlap(fp, pg) ? [`o${i}`] : [])),
      ...tables.flatMap((o) => (o.id !== it.id && polygonsOverlap(fp, top(o, none)) ? [o.id] : [])),
      ...(polygonsOverlap(fp, raised) && !polygonInside(fp, raised) ? ["raised"] : []),
      ...(fp.some(([x, z]) => x < 0 || z < 0 || x > venue.width || z > venue.depth) ? ["walls"] : []),
    ];
  };
  const room = new Map<string, Ends & { cap: number }>();
  for (const it of tables) {
    const sh = shapeOf(it, catalog);
    if (sh.kind !== "rectTable") continue;
    const cap = (LONGER_MAX - 1) * sh.length;
    const before = new Set(touches(it, none));
    const ok = (e: Ends) => touches(it, e).every((t) => before.has(t));
    const seated = (end: keyof Ends) =>
      sh.chairs.some((c) => Math.abs(c.z) < 1e-6 && (end === "pos" ? c.x > 0 : c.x < 0));
    const reach = (end: keyof Ends) => {
      if (seated(end)) return 0;
      let d = cap;
      while (d > 0 && !ok({ ...none, [end]: d })) d = Math.max(0, d - 0.05);
      return d;
    };
    room.set(it.id, { neg: reach("neg"), pos: reach("pos"), cap });
  }
  // Seats along the sides: a table with an end chair still matches its plain twins.
  const kind = (it: (typeof tables)[number]) => {
    const sh = shapeOf(it, catalog);
    const side = sh.kind === "rectTable" ? sh.chairs.filter((c) => Math.abs(c.z) > 1e-6).length : seatsOf(sh);
    return `${it.libraryId}:${side}`;
  };
  const ends = new Map<string, Ends>();
  for (const it of tables) {
    const r = room.get(it.id);
    if (!r) continue;
    // The growth all tables alike can take, shared between the ends, the roomier end taking more.
    const total = Math.min(
      ...tables
        .filter((o) => kind(o) === kind(it))
        .map((o) => {
          const q = room.get(o.id);
          return q ? Math.min(q.cap, q.neg + q.pos) : 0;
        }),
    );
    if (total < 0.05) continue;
    const pos = Math.min(r.pos, Math.max(total / 2, total - r.neg));
    ends.set(it.id, { neg: total - pos, pos });
  }
  return ends;
}

const axis = (rotY: number): Vec2 => [Math.cos(rotY), -Math.sin(rotY)];

/** Each seated table as the chart draws it: its top (grown at its ends) and its middle. */
export function chartTables(
  scenario: Scenario,
  catalog: Catalog,
  ends: ReadonlyMap<string, Ends>,
): Map<string, { top: Polygon; middle: Vec2 }> {
  const out = new Map<string, { top: Polygon; middle: Vec2 }>();
  for (const it of scenario.items) {
    const sh = shapeOf(it, catalog);
    if (sh.kind === "roundTable") {
      out.set(it.id, { top: transform(circle(sh.diameter / 2, 36), it.x, it.z, 0), middle: [it.x, it.z] });
      continue;
    }
    if (sh.kind !== "rectTable") continue;
    const e = ends.get(it.id) ?? { neg: 0, pos: 0 };
    const local = rect(-sh.length / 2 - e.neg, -sh.width / 2, sh.length / 2 + e.pos, sh.width / 2);
    const a = axis(it.rotY);
    const by = (e.pos - e.neg) / 2;
    out.set(it.id, {
      top: transform(local, it.x, it.z, it.rotY),
      middle: [it.x + a[0] * by, it.z + a[1] * by],
    });
  }
  return out;
}

/** The seats as the chart draws them: side chairs spread over a longer table, end chairs out with its ends. */
export function chartSeats(scenario: Scenario, catalog: Catalog, ends: ReadonlyMap<string, Ends>): Seat[] {
  return layoutSeats(scenario.items, catalog).map((seat) => {
    const e = ends.get(seat.item);
    const it = scenario.items.find((i) => i.id === seat.item);
    const sh = it ? shapeOf(it, catalog) : null;
    if (!e || !it || sh?.kind !== "rectTable") return seat;
    const L = sh.length;
    const a = axis(it.rotY);
    const along = (seat.x - it.x) * a[0] + (seat.z - it.z) * a[1];
    const to =
      along < -L / 2
        ? along - e.neg
        : along > L / 2
          ? along + e.pos
          : -L / 2 - e.neg + ((along + L / 2) * (L + e.neg + e.pos)) / L;
    return { ...seat, x: seat.x + a[0] * (to - along), z: seat.z + a[1] * (to - along) };
  });
}

/** A line of text's width at a type size, measured by whoever draws it. */
export type Measure = (text: string, px: number, bold: boolean) => number;

/**
 * Names (SEA-04), in page units at 150 dpi: one size for the whole chart, the largest from 17 (8.2
 * pt) down to 10 (4.8 pt) at which every name stays clear; first name (semibold) over last name.
 */
export const NAME_MAX = 17;
export const NAME_MIN = 10;
export const LEADING = 1.14;
/** An empty seat's numbered ring, its radius. */
export const RING = 9;
const GUTTER = 5;
const CLEAR = 6;

export type NameLine = { s: string; bold: boolean };
export type NameBlock = {
  seat: Seat;
  align: "left" | "right" | "center";
  /** The guest's lines; none for an empty seat (its ring). */
  lines: NameLine[];
  x: number;
  y: number;
  w: number;
  h: number;
};
export type NamePlan = { px: number; blocks: NameBlock[] };

/** A guest's lines: first name over last name; `split` breaks a long one at its hyphen. */
export function nameLines(scenario: Scenario, key: string, split: boolean): NameLine[] {
  const guest = scenario.seating[key];
  if (!guest) return [];
  return [
    { s: guest.first, bold: true },
    { s: guest.last, bold: false },
  ]
    .filter((l) => l.s)
    .flatMap((l) => {
      const at = l.s.indexOf("-", 1);
      return split && at > 0 && at < l.s.length - 1
        ? [
            { s: l.s.slice(0, at + 1), bold: l.bold },
            { s: l.s.slice(at + 1), bold: l.bold },
          ]
        : [l];
    });
}

/**
 * Where each guest's name goes on the seating chart (SEA-04), in drawing units: just outside the
 * table's edge at its seat, beside a table's end or centred over a seat along its side, one row per
 * side; at the one type size, the largest at which no name touches another, a wall, the bar or
 * stair, another table, the DJ or the dance area (banquettes are low; names may cross them). A
 * hyphenated name breaks at its hyphen where it would touch something, rather than shrink every name.
 */
export function placeNames(
  scenario: Scenario,
  venue: VenueModel,
  catalog: Catalog,
  fit: Fit,
  ends: ReadonlyMap<string, Ends>,
  measure: Measure,
): NamePlan {
  const P = (p: Vec2) => onPage(fit, p);
  const { k } = fit;
  const placed = chartSeats(scenario, catalog, ends).map((seat) => {
    const [cx, cy] = P([seat.x, seat.z]);
    // Outward from the table, and the table's edge in front of the chair.
    const u: Vec2 = [-Math.sin(seat.rotY), -Math.cos(seat.rotY)];
    const [ex, ey] = P([seat.x - u[0] * 0.32, seat.z - u[1] * 0.32]);
    const [ax, ay] = P([seat.x + u[0], seat.z + u[1]]);
    const dx = ax - cx;
    const dy = ay - cy;
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      const side = Math.sign(dx);
      return {
        seat,
        x: ex + side * GUTTER * k,
        y: cy,
        align: side > 0 ? "left" : "right",
        below: 0,
      } as const;
    }
    const below = Math.sign(dy);
    return { seat, x: cx, y: ey + below * GUTTER * k, align: "center", below } as const;
  });
  const keepOut: Polygon[] = [
    ...venue.obstacles.filter((o) => !o.id.startsWith("banquette")).map((o) => o.polygon),
    ...toggledObstacles(venue, scenario.venueToggles).map((o) => o.polygon),
    ...floorPieces(scenario, catalog),
  ].map((pg) => pg.map((p) => P(p)));
  const tops = [...chartTables(scenario, catalog, ends)].map(([id, t]) => ({ id, top: t.top.map(P) }));
  const box = {
    x0: fit.ox,
    y0: fit.oy,
    x1: fit.ox + venue.width * fit.sx,
    y1: fit.oy + venue.depth * fit.scale,
  };

  const blocks = (px: number, split: ReadonlySet<number>): NameBlock[] =>
    placed.map((p, i) => {
      const lines = nameLines(scenario, p.seat.key, split.has(i));
      const w = lines.length ? Math.max(...lines.map((l) => measure(l.s, px, l.bold))) : RING * 2 * k;
      const h = lines.length ? px * LEADING * lines.length : RING * 2 * k;
      const x = p.align === "left" ? p.x : p.align === "right" ? p.x - w : p.x - w / 2;
      const y = p.align !== "center" ? p.y - h / 2 : p.below > 0 ? p.y : p.y - h;
      return { seat: p.seat, align: p.align, lines, x, y, w, h };
    });
  const conflicts = (b: NameBlock[]) => {
    const pad = CLEAR * k;
    const bad = new Set<number>();
    b.forEach((r, i) => {
      if (r.x < box.x0 || r.y < box.y0 || r.x + r.w > box.x1 || r.y + r.h > box.y1) bad.add(i);
      for (let j = i + 1; j < b.length; j++) {
        const o = b[j];
        if (
          o &&
          r.x < o.x + o.w + pad &&
          o.x < r.x + r.w + pad &&
          r.y < o.y + o.h + pad &&
          o.y < r.y + r.h + pad
        ) {
          bad.add(i);
          bad.add(j);
        }
      }
      const pts: Vec2[] = [];
      for (let fx = 0; fx <= 1; fx += 0.125)
        for (const fy of [0, 0.5, 1]) pts.push([r.x + r.w * fx, r.y + r.h * fy]);
      const others = [...keepOut, ...tops.filter((t) => t.id !== r.seat.item).map((t) => t.top)];
      if (pts.some((pt) => others.some((pg) => pointInPolygon(pt, pg)))) bad.add(i);
    });
    return bad;
  };
  const hyphenated = (i: number) => {
    const key = placed[i]?.seat.key ?? "";
    return nameLines(scenario, key, true).length > nameLines(scenario, key, false).length;
  };
  for (let size = NAME_MAX; size >= NAME_MIN; size -= 0.5) {
    const tight = new Set([...conflicts(blocks(size * k, new Set()))].filter(hyphenated));
    const out = blocks(size * k, tight);
    if (conflicts(out).size === 0 || size === NAME_MIN) return { px: size * k, blocks: out };
  }
  return { px: NAME_MIN * k, blocks: blocks(NAME_MIN * k, new Set()) };
}
