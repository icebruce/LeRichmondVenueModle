import { type Polygon, type Vec2, centredRect, circle, transform } from "../domain/geometry";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { DANCE_AREA_COLOUR, chairsWorld, seatsOf, shapeOf } from "../domain/layout/items";
import { spotFor, toggledObstacles } from "../domain/layout/validate";
import type { Catalog } from "../domain/library/catalog";
import type { Scenario } from "../domain/scenario/schema";
import { type VenueModel, alongWall, wallFrame } from "../domain/venue/model";

/** Letter landscape, laid out at 150 dpi and drawn at 2× (300 dpi) so print stays sharp. */
export const PLAN_SIZE = { width: 1650, height: 1275 } as const;
export const PLAN_PIXELS = { width: PLAN_SIZE.width * 2, height: PLAN_SIZE.height * 2 } as const;

/** The plan's colours and faces come from the design tokens (tokens.css). */
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    INK: v("--ink"),
    INK_2: v("--ink-2"),
    LINE: v("--line-2"),
    FILL: v("--sunk"),
    ACCENT: v("--accent"),
    SOFT: v("--accent-soft"),
    PAPER: v("--surface"),
    GROUND: v("--bg"),
    SOLID: v("--line-2"),
    GLASS: v("--ink-3"),
    UI: v("--font-ui"),
    DISPLAY: v("--font-display"),
  };
}

/**
 * The layout for the venue (EXP-01): top-down plan with table numbers and seats, a table list,
 * totals, legend, date and the "approximate" note. Drawn on a 2D canvas, readable on Letter paper.
 */
export function drawPlan(
  canvas: HTMLCanvasElement,
  scenario: Scenario,
  venue: VenueModel,
  catalog: Catalog,
  event: string,
  exportedOn: string,
): void {
  const { width: W, height: H } = PLAN_SIZE;
  const { INK, INK_2, LINE, FILL, ACCENT, SOFT, PAPER, GROUND, SOLID, GLASS, UI, DISPLAY } = tokens();
  canvas.width = PLAN_PIXELS.width;
  canvas.height = PLAN_PIXELS.height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Canvas 2D is not available");
  g.scale(PLAN_PIXELS.width / W, PLAN_PIXELS.height / H);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  const margin = 60;
  const listW = 470;
  const top = 150;
  const plan = { x: margin, y: top, w: W - margin * 3 - listW, h: H - top - 150 };
  const scale = Math.min(plan.w / (venue.width + 1.2), plan.h / (venue.depth + 1.2));
  const ox = plan.x + (plan.w - venue.width * scale) / 2;
  const oy = plan.y + (plan.h - venue.depth * scale) / 2;
  const P = (p: Vec2): [number, number] => [ox + p[0] * scale, oy + p[1] * scale];
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
    font: string,
    colour = INK,
    align: CanvasTextAlign = "left",
  ) => {
    g.font = font;
    g.fillStyle = colour;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(s, x, y);
  };

  // Header.
  text(`Reception layout · ${scenario.name}`, margin, 70, `600 34px ${DISPLAY}`);
  text(event, W - margin, 70, `500 20px ${UI}`, INK_2, "right");
  g.fillStyle = LINE;
  g.fillRect(margin, 108, W - margin * 2, 1);

  // Raised floor, bar, back bar, stair.
  poly(venue.raised.outline, GROUND, INK_2, 1.2, [10, 7]);
  // Label in the raised floor's open south-west corner, clear of the tables.
  const raisedBottom = Math.max(...venue.raised.outline.map((p) => p[1]));
  const raisedLeft = Math.min(...venue.raised.outline.filter((p) => p[1] === raisedBottom).map((p) => p[0]));
  const [rx, ry] = P([raisedLeft + 0.15, raisedBottom - 0.3]);
  text(`Raised floor (≈ +${venue.raised.height.toFixed(1)} m)`, rx, ry, `500 17px ${UI}`, INK_2);
  for (const o of venue.obstacles) {
    if (o.id.startsWith("banquette")) poly(o.polygon, FILL, LINE, 1);
    else if (o.id.startsWith("bar") || o.id === "back-bar" || o.id === "wine-wall")
      poly(o.polygon, SOLID, INK_2, 1);
    else if (o.id.startsWith("stair")) poly(o.polygon, FILL, INK_2, 1);
  }
  for (const o of toggledObstacles(venue, scenario.venueToggles)) poly(o.polygon, SOLID, INK_2, 1, [4, 4]);
  const [bx0, bz0, bx1, bz1] = venue.data.bar.outer.value;
  text("Bar", ...P([(bx0 + bx1) / 2, (bz0 + bz1) / 2]), `600 18px ${UI}`, INK_2, "center");
  // The entrance label sits where the corridor opens into the room.
  const south = venue.data.walls.find((w) => w.openings.some((o) => o.id === "corridor"));
  const corridor = south?.openings.find((o) => o.id === "corridor");
  if (south && corridor) {
    const [ex, ez] = alongWall(south, (corridor.start + corridor.end) / 2, 0.6);
    text("Entrance", ...P([ex, ez]), `600 17px ${UI}`, INK_2, "center");
  }
  const { from, to } = venue.data.stair.flight;
  text("Stair", ...P([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), `500 17px ${UI}`, INK_2, "center");

  // Walls with their openings.
  for (const w of venue.data.walls) {
    const { length } = wallFrame(w);
    const out = (s: number, inset: number) => alongWall(w, s, inset);
    const cuts = [...w.openings].sort((a, b) => a.start - b.start);
    let s0 = 0;
    const drawWall = (a: number, b: number) => {
      if (b - a < 0.01) return;
      g.beginPath();
      g.moveTo(...P(out(a, -0.12)));
      g.lineTo(...P(out(b, -0.12)));
      g.strokeStyle = INK;
      g.lineWidth = 0.24 * scale;
      g.stroke();
    };
    for (const o of cuts) {
      drawWall(s0, o.start);
      g.beginPath();
      g.moveTo(...P(out(o.start, -0.12)));
      g.lineTo(...P(out(o.end, -0.12)));
      const open = o.kind === "opening" || o.kind === "pass" || o.kind === "stairway";
      g.strokeStyle = open ? PAPER : GLASS;
      g.lineWidth = open ? 0.24 * scale : 0.08 * scale;
      g.stroke();
      s0 = o.end;
    }
    drawWall(s0, length);
  }
  const label = (s: string, p: Vec2, rot = 0) => {
    const [x, y] = P(p);
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    text(s, 0, 0, `500 17px ${UI}`, INK_2, "center");
    g.restore();
  };
  label("Glass doors to the terrace", [-0.55, venue.depth / 2], -Math.PI / 2);
  label("Street windows", [venue.width + 0.55, venue.depth / 2], Math.PI / 2);
  label("Kitchen (pass)", [venue.width / 2, venue.depth + 0.5]);
  label("Back-bar wall", [venue.width / 2, -0.5]);

  // Items.
  const labels = tableLabels(scenario.items, catalog);
  const rows: { label: string; type: string; seats: number }[] = [];
  for (const it of scenario.items) {
    const shape = shapeOf(it, catalog);
    const entry = catalog.get(it.libraryId);
    if (shape.kind === "danceFloor") {
      const fp = transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY);
      // The same sand as in the room (LIB-01), over a faint wash of it.
      poly(fp, `${DANCE_AREA_COLOUR}22`, DANCE_AREA_COLOUR, 2.5);
      const [x, y] = P([it.x, it.z]);
      text("Dance area", x, y - 10, `600 18px ${UI}`, INK, "center");
      text(
        `≈ ${shape.width.toFixed(1)} × ${shape.depth.toFixed(1)} m`,
        x,
        y + 14,
        `500 17px ${UI}`,
        INK_2,
        "center",
      );
      continue;
    }
    if (shape.kind === "djBooth") {
      if (spotFor(it, venue)?.level === "mezzanine") {
        const [x, y] = P([it.x, venue.depth - 0.35]);
        text("DJ on the mezzanine edge", x, y, `600 17px ${UI}`, INK, "center");
        continue;
      }
      poly(transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY), INK, null);
      text("DJ", ...P([it.x, it.z]), `700 17px ${UI}`, PAPER, "center");
      continue;
    }
    if (shape.kind === "piece") {
      // Floor pieces as solid outlines; hanging ones dashed (they are above the floor).
      const fp = transform(centredRect(shape.width, shape.depth), it.x, it.z, it.rotY);
      poly(fp, shape.blocks ? FILL : null, INK_2, 1.2, shape.blocks ? [] : [6, 5]);
      // Names only on floor pieces: hanging ones would print over the table numbers under them.
      if (shape.blocks) text(entry?.name ?? "", ...P([it.x, it.z]), `500 17px ${UI}`, INK_2, "center");
      continue;
    }
    if (shape.kind === "backdrop") {
      poly(transform(centredRect(shape.width, 0.12), it.x, it.z, it.rotY), SOFT, ACCENT, 1.5);
      const [x, y] = P([it.x, it.z]);
      text("Drapery", x, y - 18, `500 17px ${UI}`, INK_2, "center");
      continue;
    }
    const topPoly =
      shape.kind === "rectTable"
        ? transform(centredRect(shape.length, shape.width), it.x, it.z, it.rotY)
        : transform(circle(shape.diameter / 2, 36), it.x, it.z, 0);
    for (const ch of chairsWorld(it, shape)) {
      const [cx, cy] = P([ch.x, ch.z]);
      g.beginPath();
      g.arc(cx, cy, 0.2 * scale, 0, Math.PI * 2);
      g.fillStyle = PAPER;
      g.fill();
      g.strokeStyle = INK_2;
      g.lineWidth = 1.2;
      g.stroke();
    }
    poly(topPoly, PAPER, INK, 2);
    const seats = seatsOf(shape);
    const name = labels.get(it.id);
    const [x, y] = P([it.x, it.z]);
    if (name) text(name, x, seats ? y - 10 : y, `700 24px ${UI}`, INK, "center");
    if (seats) text(`${seats} seats`, x, y + 13, `500 19px ${UI}`, INK_2, "center");
    if (seats) rows.push({ label: name ?? "", type: entry?.name ?? "Table", seats });
  }

  // North arrow and scale bar.
  const nx = plan.x + 20;
  const ny = plan.y + 10;
  g.beginPath();
  g.moveTo(nx, ny);
  g.lineTo(nx - 9, ny + 26);
  g.lineTo(nx + 9, ny + 26);
  g.closePath();
  g.fillStyle = INK;
  g.fill();
  text("N", nx, ny + 42, `700 17px ${UI}`, INK, "center");
  const sbx = ox;
  const sby = oy + venue.depth * scale + 70;
  for (let m = 0; m < 5; m++) {
    g.fillStyle = m % 2 ? PAPER : INK;
    g.fillRect(sbx + m * scale, sby, scale, 8);
  }
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.strokeRect(sbx, sby, 5 * scale, 8);
  text("0", sbx, sby + 22, `500 17px ${UI}`, INK_2, "center");
  text("5 m (approx.)", sbx + 5 * scale, sby + 22, `500 17px ${UI}`, INK_2, "center");

  // Table list and totals.
  const lx = W - margin - listW;
  let ly = top + 10;
  text("Tables", lx, ly, `600 22px ${UI}`);
  ly += 40;
  const col = [lx, lx + 90, lx + listW];
  text("Table", col[0] ?? lx, ly, `600 17px ${UI}`, INK_2);
  text("Type", col[1] ?? lx, ly, `600 17px ${UI}`, INK_2);
  text("Seats", col[2] ?? lx, ly, `600 17px ${UI}`, INK_2, "right");
  ly += 12;
  g.fillStyle = LINE;
  g.fillRect(lx, ly, listW, 1);
  for (const r of rows) {
    ly += 30;
    text(r.label, col[0] ?? lx, ly, `600 17px ${UI}`);
    text(r.type, col[1] ?? lx, ly, `400 17px ${UI}`);
    text(String(r.seats), col[2] ?? lx, ly, `500 17px ${UI}`, INK, "right");
  }
  const c = countLayout(scenario.items, scenario.guests.count, catalog);
  ly += 18;
  g.fillStyle = LINE;
  g.fillRect(lx, ly, listW, 1);
  ly += 26;
  text("Total seats", lx, ly, `600 17px ${UI}`);
  text(String(c.seats), lx + listW, ly, `700 17px ${UI}`, INK, "right");
  ly += 50;
  const facts = [
    `Guests: ${c.guests}${c.withoutSeat ? ` (${c.withoutSeat} without a seat)` : ""}`,
    `Dance area ≈ ${Math.round(c.danceFloorM2)} m²`,
    ...djLine(scenario, venue, catalog),
    `Tablecloths: ${(catalog.get(scenario.style.linen)?.name ?? "").replace(" tablecloth", "").toLowerCase()}, ${scenario.style.linenLength === "lap" ? "lap length" : "to the floor"}`,
  ];
  for (const f of facts) {
    text(f, lx, ly, `400 17px ${UI}`);
    ly += 28;
  }

  // Legend and footer.
  const fy = H - 70;
  g.fillStyle = LINE;
  g.fillRect(margin, fy - 30, W - margin * 2, 1);
  text(
    "Approximate dimensions, for discussion with the venue. Room sizes are estimated from photos.",
    margin,
    fy,
    `500 17px ${UI}`,
    INK,
  );
  text(`Exported ${exportedOn} · Richmond Studio`, W - margin, fy, `400 17px ${UI}`, INK_2, "right");
  text(
    "○ chair   ▭ table with number and seats   ‒ ‒ raised floor",
    margin,
    fy + 30,
    `400 17px ${UI}`,
    INK_2,
  );
}

function djLine(scenario: Scenario, venue: VenueModel, catalog: Catalog): string[] {
  const dj = scenario.items.find((i) => shapeOf(i, catalog).kind === "djBooth");
  if (!dj) return [];
  const spot = typeof dj.options.spot === "string" ? venue.data.spots[dj.options.spot] : undefined;
  return [`DJ: ${spot?.label.replace(/^DJ /, "") ?? "placed on the plan"}`];
}
