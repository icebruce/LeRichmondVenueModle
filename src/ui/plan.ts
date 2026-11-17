import { type Polygon, type Vec2, centredRect, transform } from "../domain/geometry";
import {
  type Ends,
  type Frame,
  LEADING,
  type NamePlan,
  PAGE,
  RING,
  chartTables,
  fitRoom,
  longerTables,
  onPage,
  placeNames,
  seatingStretch,
} from "../domain/layout/chart";
import { tableLabels } from "../domain/layout/counts";
import { DANCE_AREA_COLOUR, seatsOf, shapeOf } from "../domain/layout/items";
import { layoutSeats, seatedNames } from "../domain/layout/seating";
import { spotFor, toggledObstacles } from "../domain/layout/validate";
import type { Catalog } from "../domain/library/catalog";
import type { Scenario } from "../domain/scenario/schema";
import { type VenueModel, alongWall, wallFrame } from "../domain/venue/model";

export { type Frame, seatingStretch };

/** The layout for the venue (EXP-01) or the seating chart with a name on each seat (SEA-04). */
export type PlanKind = "layout" | "seating";

/** Letter landscape at 150 dpi (`PAGE`), drawn at 2× (300 dpi) so print stays sharp. */
export const PLAN_SIZE = { width: PAGE.width, height: PAGE.height } as const;
export const PRINT_SCALE = 2;

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
 * The chart's longer tables and name places, worked out once per plan and frame: panning, zooming
 * and focusing in the Seating view reuse them (scenarios are immutable, so a key).
 */
const chartMemo = new WeakMap<Scenario, Map<string, { ends: Map<string, Ends>; names: NamePlan }>>();

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
  // Across, the seating chart may stretch; type keeps its page size scaled with the drawing.
  const stretch = opts.stretch ?? 1;
  const fit = fitRoom(venue, frame, stretch);
  const { scale, k } = fit;
  const P = (p: Vec2) => onPage(fit, p);
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
      // The seating chart leaves plants off: the restaurant places guests, not décor (owner, 2026-11-16).
      if (opts.seating && entry?.family === "plant") continue;
      // Floor pieces as solid outlines; hanging ones dashed (they are above the floor).
      const fp = transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY);
      poly(fp, shape.blocks ? FILL : null, INK_2, 1.2 * k, shape.blocks ? [] : [6 * k, 5 * k]);
      // Names only on floor pieces: hanging ones would print over the table numbers under them.
      if (shape.blocks) text(entry?.name ?? "", x, y, 17);
    } else if (shape.kind === "backdrop") {
      poly(transform(centredRect(shape.width, 0.12), it.x, it.z, it.rotY), SOFT, ACCENT, 1.5 * k);
      text("Drapery", x, y - 18 * k, 17);
    }
  }

  const labels = tableLabels(scenario.items, catalog);
  if (!opts.seating) {
    // The layout (EXP-01): tables to scale with their chairs, number and seats.
    const tops = chartTables(scenario, catalog, new Map());
    for (const seat of layoutSeats(scenario.items, catalog)) {
      const [cx, cy] = P([seat.x, seat.z]);
      g.beginPath();
      g.arc(cx, cy, 0.2 * scale, 0, Math.PI * 2);
      g.fillStyle = PAPER;
      g.fill();
      g.strokeStyle = INK_2;
      g.lineWidth = 1.2 * k;
      g.stroke();
    }
    for (const [id, t] of tops) {
      poly(t.top, PAPER, INK, 2 * k);
      const name = labels.get(id);
      const it = scenario.items.find((i) => i.id === id);
      const s = it ? seatsOf(shapeOf(it, catalog)) : 0;
      if (!name) continue;
      const [x, y] = P(t.middle);
      text(name, x, y - 10 * k, 24, 700, INK);
      text(`${s} seats`, x, y + 13 * k, 19);
    }
    return { seats: [], tables: [...tops].map(([id, t]) => ({ id, poly: t.top.map(P) })) };
  }

  // Seating chart (SEA-04): tables drawn longer where they can be, the names placed clear of all.
  const memoKey = `${frame.x}:${frame.y}:${frame.w}:${frame.h}:${stretch}`;
  let chart = chartMemo.get(scenario)?.get(memoKey);
  if (!chart) {
    const ends =
      chartMemo.get(scenario)?.values().next().value?.ends ?? longerTables(scenario, venue, catalog);
    const measure = (s: string, px: number, bold: boolean) => {
      g.font = `${bold ? 600 : 400} ${px}px ${UI}`;
      return g.measureText(s).width;
    };
    chart = { ends, names: placeNames(scenario, venue, catalog, fit, ends, measure) };
    chartMemo.set(scenario, new Map([...(chartMemo.get(scenario) ?? []), [memoKey, chart]]));
  }
  const tops = chartTables(scenario, catalog, chart.ends);
  for (const [id, t] of tops) {
    const focus = opts.focusTable === id;
    poly(t.top, FILL, focus ? ACCENT : INK_2, (focus ? 3 : 1.2) * k);
  }
  const { blocks } = chart.names;
  const ring = RING * k;
  const spots: SeatSpot[] = blocks.map((r) => {
    const focused = opts.focusSeat === r.seat.key;
    if (focused) {
      g.fillStyle = SOFT;
      g.beginPath();
      g.roundRect(r.x - 4 * k, r.y - 3 * k, r.w + 8 * k, r.h + 6 * k, 6 * k);
      g.fill();
    }
    if (!r.lines.length) {
      // An empty seat: its number in a small open ring.
      g.beginPath();
      g.arc(r.x + ring, r.y + ring, ring, 0, Math.PI * 2);
      g.strokeStyle = focused ? ACCENT : INK_3;
      g.lineWidth = 1.2 * k;
      g.stroke();
      text(String(r.seat.n), r.x + ring, r.y + ring, 11, 500, focused ? ACCENT : INK_3);
    }
    g.textBaseline = "middle";
    g.textAlign = r.align;
    const ax = r.align === "left" ? r.x : r.align === "right" ? r.x + r.w : r.x + r.w / 2;
    r.lines.forEach((l, j) => {
      g.font = `${l.bold ? 600 : 400} ${r.px}px ${UI}`;
      g.fillStyle = focused ? ACCENT : l.bold ? INK : INK_2;
      g.fillText(l.s, ax, r.y + r.px * LEADING * (j + 0.5));
    });
    return { key: r.seat.key, item: r.seat.item, x: r.x, y: r.y, w: r.w, h: r.h };
  });

  // Table number in the middle of the table, how many are seated there under it.
  for (const [id, t] of tops) {
    const name = labels.get(id);
    if (!name) continue;
    const [x, y] = P(t.middle);
    const named = blocks.filter((b) => b.seat.item === id && b.lines.length).length;
    text(name, x, y - 9 * k, 26, 700, opts.focusTable === id ? ACCENT : INK);
    text(`${named} ${named === 1 ? "guest" : "guests"}`, x, y + 15 * k, 13, 500, INK_2);
  }
  return { seats: spots, tables: [...tops].map(([id, t]) => ({ id, poly: t.top.map(P) })) };
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
  const margin = PAGE.margin;
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
    { x: margin, y: PAGE.top, w: W - margin * 2, h: H - PAGE.top - PAGE.bottom },
    kind === "seating" ? { seating: true, stretch: seatingStretch(venue) } : { seating: false },
  );
  line(H - 62);
  const guests =
    kind === "seating" ? seatedNames(scenario, layoutSeats(scenario.items, catalog)) : scenario.guests.count;
  write(`${guests} ${guests === 1 ? "guest" : "guests"}`, margin, H - 36, `600 20px ${UI}`, INK, "left");
}
