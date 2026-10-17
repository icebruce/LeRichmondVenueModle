import { type Polygon, type Vec2, distanceToSegment, pointInPolygon } from "../geometry";
import type { Catalog } from "../library/catalog";
import type { VenueModel } from "../venue/model";
import { type Item, blocksFloor, footprint, shapeOf } from "./items";
import { type VenueToggles, toggledObstacles } from "./validate";

/** Body radius of the walking guest (CAM-03). */
export const WALK_RADIUS = 0.28;

/**
 * Where a guest at eye level may stand: inside the room (the entrance landing included), clear of
 * the bar, stair flights, fixtures, the
 * venue furniture that is switched on, the raised-floor railing (steps stay open) and every placed
 * item except the dance area, which is walked on.
 */
export function walkArea(
  venue: VenueModel,
  items: readonly Item[],
  catalog: Catalog,
  toggles: VenueToggles,
  radius = WALK_RADIUS,
): (p: Vec2) => boolean {
  const blockers: Polygon[] = [
    // The entrance landing is floor a guest arrives on; it only blocks furniture.
    ...venue.obstacles.filter((o) => o.id !== "stair-landing").map((o) => o.polygon),
    ...toggledObstacles(venue, toggles).map((o) => o.polygon),
    ...items
      .filter((it) => {
        const shape = shapeOf(it, catalog);
        return shape.kind !== "danceFloor" && blocksFloor(shape);
      })
      .map((it) => footprint(it, catalog)),
  ];
  const ring: Vec2[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  return (p) => {
    if (p[0] < radius || p[1] < radius || p[0] > venue.width - radius || p[1] > venue.depth - radius)
      return false;
    if (venue.railing.some(([a, b]) => distanceToSegment(p, a, b) < radius)) return false;
    const probes: Vec2[] = [p, ...ring.map(([x, z]): Vec2 => [p[0] + x, p[1] + z])];
    return !blockers.some((b) => probes.some((q) => pointInPolygon(q, b)));
  };
}
