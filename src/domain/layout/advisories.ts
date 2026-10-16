import { type Polygon, type Vec2, distanceToSegment, polygonsOverlap, rect } from "../geometry";
import type { Catalog } from "../library/catalog";
import type { Scenario } from "../scenario/schema";
import { alongWall } from "../venue/model";
import type { VenueModel } from "../venue/model";
import { tableLabels } from "./counts";
import { type Item, footprint, seatsOf, shapeOf } from "./items";
import { itemName } from "./validate";

export type Thresholds = Scenario["thresholds"];

/**
 * A layout advisory (LAY-08): never blocks anything. `area` is what the scene highlights, `items`
 * are the tables involved (shown in their inspector).
 */
export type Advisory = {
  id: string;
  kind: "aisle" | "clearance" | "dance";
  message: string;
  area: Polygon | null;
  items: string[];
};

/** Shortest distance between two polygons (0 if they touch or overlap). */
export function polygonGap(a: Polygon, b: Polygon): number {
  if (polygonsOverlap(a, b)) return 0;
  const edges = (p: Polygon) => p.map((v, i) => [v, p[(i + 1) % p.length] as Vec2] as const);
  let best = Infinity;
  for (const v of a) for (const [s, e] of edges(b)) best = Math.min(best, distanceToSegment(v, s, e));
  for (const v of b) for (const [s, e] of edges(a)) best = Math.min(best, distanceToSegment(v, s, e));
  return best;
}

/** Floor areas to keep clear (m from the opening): entrance and stair landing, kitchen pass, glazed doors. */
export function clearanceZones(venue: VenueModel, depth: number): { name: string; area: Polygon }[] {
  const zones: { name: string; area: Polygon }[] = [];
  const [lx0, lz0, lx1, lz1] = venue.data.stair.landing;
  zones.push({ name: "the entrance and stair landing", area: rect(lx0 - depth, lz0 - depth, lx1, lz0) });
  zones.push({ name: "the entrance and stair landing", area: rect(lx0 - depth, lz0, lx0, lz1) });
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
      zones.push({
        name,
        area: [
          alongWall(wall, o.start, 0),
          alongWall(wall, o.end, 0),
          alongWall(wall, o.end, depth),
          alongWall(wall, o.start, depth),
        ],
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
): Advisory[] {
  const out: Advisory[] = [];
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
      const mid: Vec2 = [(a.it.x + b.it.x) / 2, (a.it.z + b.it.z) / 2];
      out.push({
        id: `aisle:${a.it.id}:${b.it.id}`,
        kind: "aisle",
        message: `Aisle ≈ ${m1(gap)} m between ${itemName(a.it, labels, catalog)} and ${itemName(b.it, labels, catalog)} — below your ${m1(thresholds.aisleM)} m setting`,
        area: rect(mid[0] - 0.35, mid[1] - 0.35, mid[0] + 0.35, mid[1] + 0.35),
        items: [a.it.id, b.it.id],
      });
    }
  }

  // Clearances in front of the entrance, stair, kitchen pass and glazed doors.
  for (const zone of clearanceZones(venue, thresholds.clearanceM)) {
    const inside = items.filter(
      (it) =>
        shapeOf(it, catalog).kind !== "danceFloor" && polygonsOverlap(footprint(it, catalog), zone.area),
    );
    if (!inside.length) continue;
    const first = inside[0] as Item;
    out.push({
      id: `clearance:${zone.name}:${first.id}`,
      kind: "clearance",
      message: `Less than ${m1(thresholds.clearanceM)} m clear in front of ${zone.name} (${itemName(first, labels, catalog)})`,
      area: zone.area,
      items: inside.map((it) => it.id),
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
      items: [],
    });
  }
  return out;
}
