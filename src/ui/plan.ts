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
} from "../domain/geometry";
import { tableLabels } from "../domain/layout/counts";
import { DANCE_AREA_COLOUR, seatsOf, shapeOf } from "../domain/layout/items";
import { type Seat, layoutSeats, seatedNames } from "../domain/layout/seating";
import { spotFor, toggledObstacles } from "../domain/layout/validate";
import type { Catalog } from "../domain/library/catalog";
import type { Scenario } from "../domain/scenario/schema";
import { type VenueModel, alongWall, wallFrame } from "../domain/venue/model";

/** The layout for the venue (EXP-01) or the seating chart with a name on each seat (SEA-04). */
export type PlanKind = "layout" | "seating";

/**
 * Letter landscape, laid out at 150 dpi and drawn at 2× (300 dpi) so print stays sharp; the room as
 * the Plan view shows it, the back bar at the top.
 */
export const PLAN_SIZE = { width: 1650, height: 1275 } as const;
export const PRINT_SCALE = 2;
const PAGE_MARGIN = 45;
const PAGE_TOP = 88;
const PAGE_BOTTOM = 70;
const WALL_PAD = 0.3;

/**
 * The seating chart (SEA-04) draws the room as a diagram, not to scale: stretched across the whole
 * page width, the side margins going to the seats so their guests' names fit on one row.
 */
export function seatingStretch(venue: VenueModel): number {
  const w = (PLAN_SIZE.width - 2 * PAGE_MARGIN) / (venue.width + 2 * WALL_PAD);
  const h = (PLAN_SIZE.height - PAGE_TOP - PAGE_BOTTOM) / (venue.depth + 2 * WALL_PAD);
  return Math.max(1, w / h);
}

/** Where the room is drawn on the canvas, in canvas units. */
export type Frame = { x: number; y: number; w: number; h: number };

/** A seat as drawn, in canvas units: the area to tap to name it in the Seating view. */
export type SeatSpot = { key: string; item: string; x: number; y: number; w: number; h: number };

export type RoomOptions = {
  /** Seating chart: names on the seats. */
  seating: boolean;
  /** The seating chart's sideways stretch (`seatingStretch`); 1 draws the room to scale. */
  stretch?: number;
  /** Seating view: the seat being named and its table, in accent. */
  focusSeat?: string | null;
  focusTable?: string | null;
};

/**
 * Names (SEA-04): one size for the whole chart, the largest from 8.2 pt down to 4.8 pt at which the
 * longest name fits its place; first name (semibold) over last name.
 */
const NAME_MAX = 17;
const NAME_MIN = 10;
const LEADING = 1.14;
/** The printed plan's scale; type in the Seating view scales from it. */
const PAGE_PX_PER_M = 81;

/** The names' type size found for a plan at a drawing size (scenarios are immutable, so a key). */
const sizeMemo = new WeakMap<Scenario, Map<string, { size: number; split: Set<number> }>>();

/** The plan's colours and faces come from the design tokens (tokens.css). */
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    INK: v("--ink"),
    INK_2: v("--ink-2"),
    INK_3: v("--ink-3"),
    LINE: v("--line-2"),
    FILL: v("--sunk"),
    ACCENT: v("--accent"),
    SOFT: v("--accent-soft"),
    PAPER: v("--surface"),
    GROUND: v("--bg"),
    GLASS: v("--ink-3"),
    UI: v("--font-ui"),
    DISPLAY: v("--font-display"),
  };
}

type Placed = {
  seat: Seat;
  /**
   * Beside the table (left or right aligned): where the name starts, on the seat's row. Above or
   * below it (centred): the seat's x and the table's edge.
   */
  x: number;
  y: number;
  align: CanvasTextAlign;
  /** Centred names: 1 below the table, -1 above. */
  below: number;
};

/**
 * The room from above with its tables and, on the seating chart, the guests' names (EXP-01,
 * SEA-01, SEA-04), fitted into `frame`. Shared by the printed pages and the Seating view, so both
 * show the same thing.
 */
export function drawRoom(
  g: CanvasRenderingContext2D,
  scenario: Scenario,
  venue: VenueModel,
  catalog: Catalog,
  frame: Frame,
  opts: RoomOptions,
): { seats: SeatSpot[]; tables: { id: string; poly: [number, number][] }[] } {
  const { INK, INK_2, INK_3, LINE, FILL, ACCENT, SOFT, PAPER, GROUND, GLASS, UI } = tokens();
  // The walls stand 0.24 m outside the room's interior. Across, the seating chart may stretch.
  const stretch = opts.stretch ?? 1;
  const scale = Math.min(
    frame.w / ((venue.width + 2 * WALL_PAD) * stretch),
    frame.h / (venue.depth + 2 * WALL_PAD),
  );
  const sx = scale * stretch;
  const ox = frame.x + (frame.w - venue.width * sx) / 2;
  const oy = frame.y + (frame.h - venue.depth * scale) / 2;
  const P = (p: Vec2): [number, number] => [ox + p[0] * sx, oy + p[1] * scale];
  const k = scale / PAGE_PX_PER_M;
  const poly = (
    pts: Polygon,
    fill: string | null,
    stroke: string | null,
    width = 1.5,
    dash: number[] = [],
  ) => {
    if (!pts.length) return;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.setLineDash(dash);
      g.strokeStyle = stroke;
      g.lineWidth = width;
      g.stroke();
      g.setLineDash([]);
    }
  };
  const text = (
    s: string,
    x: number,
    y: number,
    px: number,
    weight = 500,
    colour = INK_2,
    align: CanvasTextAlign = "center",
  ) => {
    g.font = `${weight} ${px * k}px ${UI}`;
    g.fillStyle = colour;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(s, x, y);
  };

  // Raised floor, bar, back bar, stair.
  poly(venue.raised.outline, GROUND, INK_3, 1.2 * k, [10 * k, 7 * k]);
  for (const o of venue.obstacles) {
    if (o.id.startsWith("banquette")) poly(o.polygon, FILL, LINE, k);
    else if (o.id.startsWith("bar") || o.id === "back-bar" || o.id === "wine-wall")
      poly(o.polygon, LINE, INK_2, k);
    else if (o.id.startsWith("stair")) poly(o.polygon, FILL, INK_2, k);
  }
  const extra = toggledObstacles(venue, scenario.venueToggles);
  for (const o of extra) poly(o.polygon, LINE, INK_2, k, [4 * k, 4 * k]);
  const [bx0, bz0, bx1, bz1] = venue.data.bar.outer.value;
  text("Bar", ...P([(bx0 + bx1) / 2, (bz0 + bz1) / 2]), 18, 600);
  const south = venue.data.walls.find((w) => w.openings.some((o) => o.id === "corridor"));
  const corridor = south?.openings.find((o) => o.id === "corridor");
  if (south && corridor) {
    const [ex, ez] = alongWall(south, (corridor.start + corridor.end) / 2, 0.6);
    text("Entrance", ...P([ex, ez]), 17, 600);
  }
  const { from, to } = venue.data.stair.flight;
  text("Stair", ...P([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), 17);

  // Walls with their openings.
  for (const w of venue.data.walls) {
    const { length } = wallFrame(w);
    const out = (s: number) => alongWall(w, s, -0.12);
    const cuts = [...w.openings].sort((a, b) => a.start - b.start);
    let s0 = 0;
    const segment = (a: number, b: number, colour: string, width: number) => {
      if (b - a < 0.01) return;
      g.beginPath();
      g.moveTo(...P(out(a)));
      g.lineTo(...P(out(b)));
      g.strokeStyle = colour;
      g.lineWidth = width * scale;
      g.stroke();
    };
    for (const o of cuts) {
      segment(s0, o.start, INK, 0.24);
      const open =
        o.kind === "opening" || o.kind === "pass" || o.kind === "stairway" || o.kind === "corridor";
      segment(o.start, o.end, open ? PAPER : GLASS, open ? 0.24 : 0.08);
      s0 = o.end;
    }
    segment(s0, length, INK, 0.24);
  }

  // Items other than tables.
  const tables: { id: string; poly: [number, number][] }[] = [];
  const tops = new Map<string, { top: Polygon; half: number }>();
  for (const it of scenario.items) {
    const shape = shapeOf(it, catalog);
    const entry = catalog.get(it.libraryId);
    const [x, y] = P([it.x, it.z]);
    if (shape.kind === "danceFloor") {
      // The same sand as in the room (LIB-01), over a faint wash of it.
      poly(
        transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY),
        `${DANCE_AREA_COLOUR}22`,
        DANCE_AREA_COLOUR,
        2.5 * k,
      );
      text("Dance area", x, y, 18, 600, INK);
    } else if (shape.kind === "djBooth") {
      if (spotFor(it, venue)?.level === "mezzanine") {
        text("DJ on the mezzanine edge", ...P([it.x, venue.depth - 0.35]), 17, 600, INK);
        continue;
      }
      poly(transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY), INK, null);
      text("DJ", x, y, 17, 700, PAPER);
    } else if (shape.kind === "piece") {
      // Floor pieces as solid outlines; hanging ones dashed (they are above the floor).
      const fp = transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY);
      poly(fp, shape.blocks ? FILL : null, INK_2, 1.2 * k, shape.blocks ? [] : [6 * k, 5 * k]);
      // Names only on floor pieces: hanging ones would print over the table numbers under them.
      if (shape.blocks) text(entry?.name ?? "", x, y, 17);
    } else if (shape.kind === "backdrop") {
      poly(transform(centredRect(shape.width, 0.12), it.x, it.z, it.rotY), SOFT, ACCENT, 1.5 * k);
      text("Drapery", x, y - 18 * k, 17);
    } else if (shape.kind === "rectTable" || shape.kind === "roundTable") {
      const rect = shape.kind === "rectTable";
      const top = rect
        ? transform(centredRect(shape.length, shape.width), it.x, it.z, it.rotY)
        : transform(circle(shape.diameter / 2, 36), it.x, it.z, 0);
      tops.set(it.id, { top, half: rect ? shape.width / 2 : shape.diameter / 2 });
      tables.push({ id: it.id, poly: top.map(P) });
    }
  }

  // Seating chart: each long table drawn longer at whichever end the room allows, up to 1.3×, so
  // its seats spread out and their names have room (a diagram, not to scale).
  const longer = opts.seating ? longerTables(scenario, venue, catalog, extra) : new Map<string, Ends>();
  const axis = (rotY: number): Vec2 => [Math.cos(rotY), -Math.sin(rotY)];
  for (const [id, e] of longer) {
    const it = scenario.items.find((i) => i.id === id);
    const sh = it && shapeOf(it, catalog);
    if (!it || sh?.kind !== "rectTable") continue;
    const top = transform(
      rect(-sh.length / 2 - e.neg, -sh.width / 2, sh.length / 2 + e.pos, sh.width / 2),
      it.x,
      it.z,
      it.rotY,
    );
    tops.set(id, { top, half: sh.width / 2 });
    const hit = tables.find((t) => t.id === id);
    if (hit) hit.poly = top.map(P);
  }
  /** A table's middle as drawn (moved along it when one end grew more). */
  const middle = (it: { id: string; x: number; z: number; rotY: number }): Vec2 => {
    const e = longer.get(it.id);
    const a = axis(it.rotY);
    const by = e ? (e.pos - e.neg) / 2 : 0;
    return [it.x + a[0] * by, it.z + a[1] * by];
  };

  // Tables: soft on the seating chart, where the names carry the page.
  const labels = tableLabels(scenario.items, catalog);
  for (const [id, { top }] of tops) {
    const focus = opts.focusTable === id;
    if (opts.seating) poly(top, FILL, focus ? ACCENT : LINE, (focus ? 3 : 1.2) * k);
  }
  const seats = layoutSeats(scenario.items, catalog).map((seat) => {
    const e = longer.get(seat.item);
    const it = scenario.items.find((i) => i.id === seat.item);
    const sh = it ? shapeOf(it, catalog) : null;
    if (!e || !it || sh?.kind !== "rectTable") return seat;
    // Along the table: side chairs spread over its new length, end chairs move out with its ends.
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
  if (!opts.seating) {
    for (const it of scenario.items) {
      const s = seatsOf(shapeOf(it, catalog));
      const name = labels.get(it.id);
      if (!name || !s) continue;
      for (const seat of seats.filter((x) => x.item === it.id)) {
        const [cx, cy] = P([seat.x, seat.z]);
        g.beginPath();
        g.arc(cx, cy, 0.2 * scale, 0, Math.PI * 2);
        g.fillStyle = PAPER;
        g.fill();
        g.strokeStyle = INK_2;
        g.lineWidth = 1.2 * k;
        g.stroke();
      }
      poly(tops.get(it.id)?.top ?? [], PAPER, INK, 2 * k);
      const [x, y] = P([it.x, it.z]);
      text(name, x, y - 10 * k, 24, 700, INK);
      text(`${s} seats`, x, y + 13 * k, 19);
    }
    return { seats: [], tables };
  }

  // Seating chart (SEA-04): each name just outside the table's edge at its seat: beside a table's
  // end, or centred over a seat along its side.
  const gutter = 5 * k;
  const placed: Placed[] = [];
  for (const seat of seats) {
    const [cx, cy] = P([seat.x, seat.z]);
    // Outward from the table, and the table's edge in front of the chair.
    const u: Vec2 = [-Math.sin(seat.rotY), -Math.cos(seat.rotY)];
    const [ex, ey] = P([seat.x - u[0] * 0.32, seat.z - u[1] * 0.32]);
    const [ax, ay] = P([seat.x + u[0], seat.z + u[1]]);
    const dx = ax - cx;
    const dy = ay - cy;
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      const side = Math.sign(dx);
      placed.push({
        seat,
        x: ex + side * gutter,
        y: cy,
        align: side > 0 ? "left" : "right",
        below: 0,
      });
    } else {
      const below = Math.sign(dy);
      placed.push({
        seat,
        x: cx,
        y: ey + below * gutter,
        align: "center",
        below,
      });
    }
  }

  // Everything a name must stay clear of, on the page: the walls, the bar and stair, other
  // tables, the DJ and the dance area (not the low banquettes along the walls).
  const keepOut: Polygon[] = [
    ...venue.obstacles.filter((o) => !o.id.startsWith("banquette")).map((o) => o.polygon),
    ...extra.map((o) => o.polygon),
    ...scenario.items.flatMap((it) => {
      const sh = shapeOf(it, catalog);
      return sh.kind === "djBooth" || sh.kind === "danceFloor"
        ? [transform(centredRect(sh.width, sh.depth), it.x, it.z, it.rotY)]
        : [];
    }),
  ].map((pg) => pg.map((p) => P(p)));
  const roomBox = { x0: ox, y0: oy, x1: ox + venue.width * sx, y1: oy + venue.depth * scale };
  const topsOnPage = new Map([...tops].map(([id, t]) => [id, t.top.map((p) => P(p))]));
  /** A guest's lines: first name over last name; `split` breaks a long one at its hyphen. */
  const lines = (key: string, split: boolean) => {
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
  };
  const ring = 9 * k;
  /** Each seat's block at type size `px`: its name on one row with its side's, or an empty seat's ring. */
  const blocks = (px: number, split: ReadonlySet<number>) =>
    placed.map((p, i) => {
      const ls = lines(p.seat.key, split.has(i));
      const w = ls.length
        ? Math.max(
            ...ls.map((l) => {
              g.font = `${l.bold ? 600 : 400} ${px}px ${UI}`;
              return g.measureText(l.s).width;
            }),
          )
        : ring * 2;
      const h = ls.length ? px * LEADING * ls.length : ring * 2;
      const x = p.align === "left" ? p.x : p.align === "right" ? p.x - w : p.x - w / 2;
      const y = p.align !== "center" ? p.y - h / 2 : p.below > 0 ? p.y : p.y - h;
      return { x, y, w, h };
    });
  /** The blocks that touch a wall, an obstacle, another table or another name. */
  const conflicts = (b: { x: number; y: number; w: number; h: number }[]) => {
    const pad = 6 * k;
    const bad = new Set<number>();
    for (let i = 0; i < b.length; i++) {
      const r = b[i];
      const own = placed[i]?.seat.item;
      if (!r) continue;
      if (r.x < roomBox.x0 || r.y < roomBox.y0 || r.x + r.w > roomBox.x1 || r.y + r.h > roomBox.y1)
        bad.add(i);
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
      const others = [...topsOnPage].filter(([id]) => id !== own).map(([, pg]) => pg);
      if (pts.some((pt) => [...keepOut, ...others].some((pg) => pointInPolygon(pt, pg)))) bad.add(i);
    }
    return bad;
  };
  // One type size for every name: the largest, from 8.2 pt down, at which every name stays clear,
  // a long hyphenated name breaking at its hyphen rather than shrinking every name on the page.
  const hyphenated = (i: number) => {
    const p = placed[i];
    return !!p && lines(p.seat.key, true).length > lines(p.seat.key, false).length;
  };
  // The search runs once per plan and drawing size; panning and zooming the Seating view reuse it.
  const memoKey = `${scale.toFixed(4)}:${stretch.toFixed(4)}`;
  let fit = sizeMemo.get(scenario)?.get(memoKey);
  if (!fit) {
    fit = { size: NAME_MIN, split: new Set<number>() };
    for (let size = NAME_MAX; size >= NAME_MIN; size -= 0.5) {
      const tight = new Set([...conflicts(blocks(size * k, new Set()))].filter(hyphenated));
      if (conflicts(blocks(size * k, tight)).size === 0 || size === NAME_MIN) {
        fit = { size, split: tight };
        break;
      }
    }
    sizeMemo.set(scenario, new Map([...(sizeMemo.get(scenario) ?? []), [memoKey, fit]]));
  }
  const px = fit.size * k;
  const split = fit.split;
  const lineH = px * LEADING;

  const spots: SeatSpot[] = [];
  blocks(px, split).forEach((r, i) => {
    const p = placed[i];
    if (!p) return;
    const ls = lines(p.seat.key, split.has(i));
    const focused = opts.focusSeat === p.seat.key;
    // Taps land on the whole row beside the seat (44 pt at least).
    const w = Math.max(r.w, 44 * k);
    const h = Math.max(r.h, 30 * k);
    const x = p.align === "left" ? r.x : p.align === "right" ? r.x + r.w - w : r.x + r.w / 2 - w / 2;
    const y = r.y + r.h / 2 - h / 2;
    spots.push({ key: p.seat.key, item: p.seat.item, x, y, w, h });
    if (focused) {
      g.fillStyle = SOFT;
      g.beginPath();
      g.roundRect(x - 4 * k, y - 3 * k, w + 8 * k, h + 6 * k, 6 * k);
      g.fill();
    }
    if (!ls.length) {
      // An empty seat: its number in a small open ring.
      const cx = r.x + ring;
      const cy = r.y + ring;
      g.beginPath();
      g.arc(cx, cy, ring, 0, Math.PI * 2);
      g.strokeStyle = focused ? ACCENT : INK_3;
      g.lineWidth = 1.2 * k;
      g.stroke();
      text(String(p.seat.n), cx, cy, 11, 500, focused ? ACCENT : INK_3);
      return;
    }
    g.textBaseline = "middle";
    g.textAlign = p.align;
    const ax = p.align === "left" ? r.x : p.align === "right" ? r.x + r.w : r.x + r.w / 2;
    ls.forEach((l, j) => {
      g.font = `${l.bold ? 600 : 400} ${px}px ${UI}`;
      g.fillStyle = focused ? ACCENT : l.bold ? INK : INK_2;
      g.fillText(l.s, ax, r.y + lineH * (j + 0.5));
    });
  });

  // Table number in the middle of the table, how many are seated there under it.
  for (const it of scenario.items) {
    const name = labels.get(it.id);
    if (!tops.has(it.id) || !name) continue;
    const [x, y] = P(middle(it));
    const named = placed.filter((p) => p.seat.item === it.id && scenario.seating[p.seat.key]).length;
    text(name, x, y - 9 * k, 26, 700, opts.focusTable === it.id ? ACCENT : INK);
    text(`${named} ${named === 1 ? "guest" : "guests"}`, x, y + 15 * k, 13, 500, INK_2);
  }
  return { seats: spots, tables };
}

const LONGER_MAX = 1.3;

/** How far a table is drawn past its real ends on the seating chart, in metres along it. */
type Ends = { neg: number; pos: number };

/**
 * How much longer each rectangular table may be drawn on the seating chart (SEA-04), at either end:
 * in all up to (LONGER_MAX − 1) × its length, each end as far as its top touches nothing it did not
 * already touch at its real length: walls, the bar, stair or banquettes, the DJ, the dance area,
 * another table, or the raised floor's edge. Tables alike (same library item and seats) grow by the
 * same amount, so they still match.
 */
function longerTables(
  scenario: Scenario,
  venue: VenueModel,
  catalog: Catalog,
  extra: { polygon: Polygon }[],
): Map<string, Ends> {
  const fixed: Polygon[] = [
    ...venue.obstacles.map((o) => o.polygon),
    ...extra.map((o) => o.polygon),
    ...scenario.items.flatMap((it) => {
      const sh = shapeOf(it, catalog);
      return sh.kind === "djBooth" || sh.kind === "danceFloor"
        ? [transform(centredRect(sh.width, sh.depth), it.x, it.z, it.rotY)]
        : [];
    }),
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
    const reach = (end: keyof Ends) => {
      let d = cap;
      while (d > 0 && !ok({ ...none, [end]: d })) d = Math.max(0, d - 0.05);
      return d;
    };
    room.set(it.id, { neg: reach("neg"), pos: reach("pos"), cap });
  }
  const kind = (it: (typeof tables)[number]) => `${it.libraryId}:${seatsOf(shapeOf(it, catalog))}`;
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

/**
 * One Letter page for the venue (EXP-01, SEA-04): the room as large as the page allows, the
 * plan's name and the event at the top, the guest total at the bottom.
 */
export function drawPlan(
  canvas: HTMLCanvasElement,
  scenario: Scenario,
  venue: VenueModel,
  catalog: Catalog,
  event: string,
  kind: PlanKind,
): void {
  const { width: W, height: H } = PLAN_SIZE;
  const { INK, INK_2, LINE, PAPER, UI, DISPLAY } = tokens();
  canvas.width = W * PRINT_SCALE;
  canvas.height = H * PRINT_SCALE;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not available");
  g.scale(PRINT_SCALE, PRINT_SCALE);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  const margin = PAGE_MARGIN;
  const line = (y: number) => {
    g.fillStyle = LINE;
    g.fillRect(margin, y, W - margin * 2, 1);
  };
  const write = (s: string, x: number, y: number, font: string, colour: string, align: CanvasTextAlign) => {
    g.font = font;
    g.fillStyle = colour;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(s, x, y);
  };
  const title = kind === "seating" ? "Seating chart" : "Reception layout";
  write(`${title} · ${scenario.name}`, margin, 50, `600 30px ${DISPLAY}`, INK, "left");
  write(event, W - margin, 50, `500 18px ${UI}`, INK_2, "right");
  line(80);
  drawRoom(
    g,
    scenario,
    venue,
    catalog,
    { x: margin, y: PAGE_TOP, w: W - margin * 2, h: H - PAGE_TOP - PAGE_BOTTOM },
    kind === "seating" ? { seating: true, stretch: seatingStretch(venue) } : { seating: false },
  );
  line(H - 62);
  const guests =
    kind === "seating" ? seatedNames(scenario, layoutSeats(scenario.items, catalog)) : scenario.guests.count;
  write(`${guests} ${guests === 1 ? "guest" : "guests"}`, margin, H - 36, `600 20px ${UI}`, INK, "left");
}
