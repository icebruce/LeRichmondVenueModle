import { type Polygon, type Vec2, polygonInside, polygonsOverlap, rect } from "../geometry";
import type { Catalog } from "../library/catalog";
import type { Level, Obstacle, VenueModel } from "../venue/model";
import { type Item, footprint, isTable } from "./items";

export type Placement = { ok: true; level: Level } | { ok: false; reason: string };

export type VenueToggles = { communalTable: boolean; barStools: boolean };

/** Fixed venue furniture that the couple may keep or remove per scenario. */
export function toggledObstacles(venue: VenueModel, toggles: VenueToggles): Obstacle[] {
  const out: Obstacle[] = [];
  if (toggles.communalTable) {
    const [x0, z0, x1, z1] = venue.data.fixtures.venueFurniture.communalTable.rect;
    out.push({
      id: "communal-table",
      label: "the communal high table",
      polygon: rect(x0 - 0.45, z0, x1 + 0.45, z1),
    });
  }
  if (toggles.barStools) {
    const [x0, z0, x1, z1] = venue.data.bar.outer.value;
    out.push({ id: "bar-stools-south", label: "the bar stools", polygon: rect(x0, z1, x1, z1 + 0.6) });
    out.push({ id: "bar-stools-west", label: "the bar stools", polygon: rect(x0 - 0.6, z0, x0, z1) });
  }
  return out;
}

export function spotFor(
  item: Item,
  venue: VenueModel,
): { x: number; z: number; rotY: number; level: Level } | null {
  const spot = item.options.spot;
  if (typeof spot !== "string" || spot === "free") return null;
  const s = venue.data.spots[spot];
  return s ? { x: s.x, z: s.z, rotY: s.rotY, level: s.level } : null;
}

export function itemName(item: Item, labels: ReadonlyMap<string, string>, catalog: Catalog): string {
  const label = labels.get(item.id);
  if (isTable(item) && label) return label === "♥" ? "the sweetheart table" : `table ${label}`;
  return `the ${(catalog.get(item.libraryId)?.name ?? "item").toLowerCase()}`;
}

/**
 * Whether `item` may sit where it is (LAY-04, VEN-03, VEN-04). Refusals name what is in the way.
 */
export function checkPlacement(
  item: Item,
  others: readonly Item[],
  venue: VenueModel,
  catalog: Catalog,
  extraObstacles: readonly Obstacle[] = [],
  labels: ReadonlyMap<string, string> = new Map(),
): Placement {
  const spot = spotFor(item, venue);
  if (spot?.level === "mezzanine") return { ok: true, level: "mezzanine" };

  const fp: Polygon = footprint(item, catalog);
  if (!polygonInside(fp, venue.room)) return { ok: false, reason: "Outside the room" };

  for (const o of [...venue.obstacles, ...extraObstacles]) {
    if (polygonsOverlap(fp, o.polygon)) return { ok: false, reason: `Overlaps ${o.label}` };
  }

  const raised = venue.raised.outline;
  const onRaised = polygonInside(fp, raised);
  if (!onRaised && polygonsOverlap(fp, raised))
    return { ok: false, reason: "Straddles the raised floor edge" };

  for (const other of others) {
    if (other.id === item.id || spotFor(other, venue)?.level === "mezzanine") continue;
    if (polygonsOverlap(fp, footprint(other, catalog))) {
      return { ok: false, reason: `Overlaps ${itemName(other, labels, catalog)}` };
    }
  }
  return { ok: true, level: onRaised ? "raised" : "main" };
}

export function levelHeight(level: Level, venue: VenueModel): number {
  if (level === "raised") return venue.raised.height;
  if (level === "mezzanine") return venue.mezzanineHeight;
  return 0;
}

/**
 * Nearest valid position to `preferred` (as placed, or turned 90°), searching outward on a 0.3 m grid.
 * Used by add and duplicate. Returns null when the room has no space for the item.
 */
export function findFreeSpot(
  item: Item,
  preferred: Vec2,
  others: readonly Item[],
  venue: VenueModel,
  catalog: Catalog,
  extraObstacles: readonly Obstacle[] = [],
): { x: number; z: number; rotY: number } | null {
  const step = 0.3;
  const turns = [item.rotY, item.rotY + Math.PI / 2];
  const dist = (p: Vec2) => Math.hypot(p[0] - preferred[0], p[1] - preferred[1]);
  for (let ring = 0; ring <= 50; ring++) {
    const candidates: Vec2[] = [];
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) === ring)
          candidates.push([preferred[0] + i * step, preferred[1] + j * step]);
      }
    }
    candidates.sort((a, b) => dist(a) - dist(b));
    for (const [x, z] of candidates) {
      for (const rotY of turns) {
        if (checkPlacement({ ...item, x, z, rotY }, others, venue, catalog, extraObstacles).ok)
          return { x, z, rotY };
      }
    }
  }
  return null;
}
