import { type Polygon, type Vec2, closestOnSegment, polygonsOverlap, rect } from "../geometry";
import type { Catalog } from "../library/catalog";
import type { Scenario } from "../scenario/schema";
import { alongWall } from "../venue/model";
import type { VenueModel } from "../venue/model";
import { tableLabels } from "./counts";
import { type Item, footprint, seatsOf, shapeOf } from "./items";
import { type VenueToggles, itemName, toggledObstacles } from "./validate";

export type Thresholds = Scenario["thresholds"];

/**
 * A layout advisory (LAY-08): never blocks anything. `area` is what the scene highlights, with a
 * short `label` ("≈ 0.7 m"); `items` are the tables involved (shown in their inspector).
 */
export type Advisory = {
  id: string;
  kind: "aisle" | "clearance" | "dance";
  message: string;
  area: Polygon | null;
  label: { text: string; at: Vec2 } | null;
  items: string[];
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The nearest points of two outlines (a segment counts as a two-point outline): [on a, on b]. */
function closestPair(a: Polygon, b: Polygon): [Vec2, Vec2] {
  const edges = (p: Polygon): (readonly [Vec2, Vec2])[] =>
    p.map((v, i) => [v, p[(i + 1) % p.length] as Vec2] as const).slice(0, p.length === 2 ? 1 : p.length);
  let best: [Vec2, Vec2] = [a[0] as Vec2, b[0] as Vec2];
  const consider = (p: Vec2, q: Vec2) => {
    if (dist(p, q) < dist(...best)) best = [p, q];
  };
  for (const v of a) for (const [s, e] of edges(b)) consider(v, closestOnSegment(v, s, e));
  for (const v of b) for (const [s, e] of edges(a)) consider(closestOnSegment(v, s, e), v);
  return best;
}

/** Shortest distance between two polygons (0 if they touch or overlap). */
export function polygonGap(a: Polygon, b: Polygon): number {
  return polygonsOverlap(a, b) ? 0 : dist(...closestPair(a, b));
}

/**
 * The aisle itself: the strip of floor between two chair zones, as long as the stretch where they
 * face each other (at least 0.6 m, so a corner-to-corner pinch still shows).
 */
function aisleStrip(a: Polygon, b: Polygon): { area: Polygon; centre: Vec2 } {
  const [p, q] = closestPair(a, b);
  const gap = Math.max(dist(p, q), 1e-6);
  const d: Vec2 = [(q[0] - p[0]) / gap, (q[1] - p[1]) / gap];
  const n: Vec2 = [-d[1], d[0]];
  const mid: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const span = (poly: Polygon) => {
    const t = poly.map((v) => (v[0] - mid[0]) * n[0] + (v[1] - mid[1]) * n[1]);
    return [Math.min(...t), Math.max(...t)] as const;
  };
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  let lo = Math.max(a0, b0);
  let hi = Math.min(a1, b1);
  if (hi - lo < 0.6) [lo, hi] = [(lo + hi) / 2 - 0.3, (lo + hi) / 2 + 0.3];
  const at = (t: number, s: number): Vec2 => [
    mid[0] + n[0] * t + d[0] * s * (gap / 2),
    mid[1] + n[1] * t + d[1] * s * (gap / 2),
  ];
  return { area: [at(lo, -1), at(hi, -1), at(hi, 1), at(lo, 1)], centre: at((lo + hi) / 2, 0) };
}

type Zone = { name: string; area: Polygon; from: Polygon };

/**
 * Floor areas to keep clear (`depth` m from the opening, the `from` line): entrance and stair
 * landing, kitchen pass, glazed doors, exit door.
 */
export function clearanceZones(venue: VenueModel, depth: number): Zone[] {
  const zones: Zone[] = [];
  const [lx0, lz0, lx1, lz1] = venue.data.stair.landing;
  const landing = "the entrance and stair landing";
  zones.push({
    name: landing,
    area: rect(lx0 - depth, lz0 - depth, lx1, lz0),
    from: [
      [lx0, lz0],
      [lx1, lz0],
    ],
  });
  zones.push({
    name: landing,
    area: rect(lx0 - depth, lz0, lx0, lz1),
    from: [
      [lx0, lz0],
      [lx0, lz1],
    ],
  });
  for (const wall of venue.data.walls) {
    for (const o of wall.openings) {
      const name =
        o.kind === "pass"
          ? "the kitchen pass"
          : o.kind === "garageDoor"
            ? "the glass doors"
            : o.kind === "door"
              ? "the exit door"
              : null;
      if (!name) continue;
      const from: Polygon = [alongWall(wall, o.start, 0), alongWall(wall, o.end, 0)];
      zones.push({
        name,
        area: [...from, alongWall(wall, o.end, depth), alongWall(wall, o.start, depth)],
        from,
      });
    }
  }
  return zones;
}

const m1 = (v: number) => v.toFixed(1);

/** Advisory checks against the couple's thresholds (LAY-08). Wording follows DESIGN_GUIDE §8. */
export function advise(
  items: readonly Item[],
  guests: number,
  thresholds: Thresholds,
  venue: VenueModel,
  catalog: Catalog,
  toggles: VenueToggles,
): Advisory[] {
  const out: Advisory[] = [];
  const aisles: { gap: number; advisory: Advisory }[] = [];
  // Venue furniture the couple keeps counts too; hidden, it frees its floor (LAY-12).
  const furniture = toggledObstacles(venue, toggles);
  const labels = tableLabels(items, catalog);
  const seated = items
    .map((it) => ({ it, shape: shapeOf(it, catalog) }))
    .filter(({ shape }) => seatsOf(shape) > 0)
    .map(({ it }) => ({ it, fp: footprint(it, catalog) }));

  // Aisles: clear floor between the chair zones of neighbouring tables.
  for (let i = 0; i < seated.length; i++) {
    for (let j = i + 1; j < seated.length; j++) {
      const a = seated[i] as { it: Item; fp: Polygon };
      const b = seated[j] as { it: Item; fp: Polygon };
      const gap = polygonGap(a.fp, b.fp);
      if (gap <= 0 || gap >= thresholds.aisleM) continue;
      const strip = aisleStrip(a.fp, b.fp);
      aisles.push({
        gap,
        advisory: {
          id: `aisle:${a.it.id}:${b.it.id}`,
          kind: "aisle",
          message: `Aisle ≈ ${m1(gap)} m between ${itemName(a.it, labels, catalog)} and ${itemName(b.it, labels, catalog)} — below your ${m1(thresholds.aisleM)} m setting`,
          area: strip.area,
          label: { text: `Aisle ≈ ${m1(gap)} m`, at: strip.centre },
          items: [a.it.id, b.it.id],
        },
      });
    }
  }

  for (const { it, fp } of seated) {
    // One message per piece of furniture (the bar stools are two strips: the nearer one counts).
    const nearest = new Map<string, { o: (typeof furniture)[number]; gap: number }>();
    for (const o of furniture) {
      const gap = polygonGap(fp, o.polygon);
      const seen = nearest.get(o.label);
      if (!seen || gap < seen.gap) nearest.set(o.label, { o, gap });
    }
    for (const { o, gap } of nearest.values()) {
      if (gap <= 0 || gap >= thresholds.aisleM) continue;
      const strip = aisleStrip(fp, o.polygon);
      aisles.push({
        gap,
        advisory: {
          id: `aisle:${it.id}:${o.id}`,
          kind: "aisle",
          message: `Aisle ≈ ${m1(gap)} m between ${itemName(it, labels, catalog)} and ${o.label} — below your ${m1(thresholds.aisleM)} m setting`,
          area: strip.area,
          label: { text: `Aisle ≈ ${m1(gap)} m`, at: strip.centre },
          items: [it.id],
        },
      });
    }
  }

  // Tightest aisles first: what the couple should look at first.
  out.push(...aisles.sort((a, b) => a.gap - b.gap).map((a) => a.advisory));

  // Clearances in front of the entrance, stair, kitchen pass and glazed doors.
  for (const zone of clearanceZones(venue, thresholds.clearanceM)) {
    // Placed items (not the dance floor, which is meant to be walked on) and shown furniture.
    const inside = [
      ...items
        .filter((it) => shapeOf(it, catalog).kind !== "danceFloor")
        .map((it) => ({
          id: it.id,
          item: true,
          name: itemName(it, labels, catalog),
          fp: footprint(it, catalog),
        })),
      ...furniture.map((o) => ({ id: o.id, item: false, name: o.label, fp: o.polygon })),
    ].filter((x) => polygonsOverlap(x.fp, zone.area));
    if (!inside.length) continue;
    // Name what is nearest the opening, with how far it is.
    const near = inside
      .map((x) => {
        const [p, q] = closestPair(x.fp, zone.from);
        return { ...x, p, q, d: polygonsOverlap(x.fp, zone.from) ? 0 : dist(p, q) };
      })
      .reduce((m, x) => (x.d < m.d ? x : m));
    out.push({
      id: `clearance:${zone.name}:${near.id}`,
      kind: "clearance",
      message: `Clearance ≈ ${m1(near.d)} m at ${zone.name} (${near.name}) — below your ${m1(thresholds.clearanceM)} m setting`,
      area: zone.area,
      label: {
        text: `Clear ≈ ${m1(near.d)} m`,
        at: [(near.p[0] + near.q[0]) / 2, (near.p[1] + near.q[1]) / 2],
      },
      items: inside.filter((x) => x.item).map((x) => x.id),
    });
  }

  // Dance floor size for the share of guests dancing.
  const floor = items
    .map((it) => shapeOf(it, catalog))
    .reduce((sum, s) => sum + (s.kind === "danceFloor" ? s.width * s.depth : 0), 0);
  const need = guests * thresholds.dancingShare * thresholds.m2PerDancer;
  if (guests > 0 && floor < need) {
    out.push({
      id: "dance",
      kind: "dance",
      message:
        floor === 0
          ? `No dance floor yet — about ${Math.round(need)} m² suits ${guests} guests`
          : `Dance floor ≈ ${Math.round(floor)} m² — below the ≈ ${Math.round(need)} m² your settings suggest for ${guests} guests`,
      area: null,
      label: null,
      items: [],
    });
  }
  return out;
}

/** A scenario's advisories, optionally for items moved by a drag still in progress (LAY-08, LAY-12). */
export function adviseScenario(
  s: Pick<Scenario, "items" | "guests" | "thresholds" | "venueToggles">,
  venue: VenueModel,
  catalog: Catalog,
  items: readonly Item[] = s.items,
): Advisory[] {
  return advise(items, s.guests.count, s.thresholds, venue, catalog, s.venueToggles);
}
