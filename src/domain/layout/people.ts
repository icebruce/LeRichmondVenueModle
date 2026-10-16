import { seededRandom } from "../random";
import { type Vec2, pointInPolygon } from "../geometry";
import type { Catalog } from "../library/catalog";
import type { VenueModel } from "../venue/model";
import { type Item, chairsWorld, footprint, shapeOf } from "./items";
import type { VenueToggles } from "./validate";
import { walkArea } from "./walk";

export type Person = { x: number; z: number; rotY: number };
export type Crowd = { seated: Person[]; standing: Person[]; unplaced: number };

/** Standing guests keep this much room each (m between neighbours). */
const STAND_PITCH = 0.7;
const DANCE_PITCH = 0.6;

function grid(x0: number, z0: number, x1: number, z1: number, pitch: number): Vec2[] {
  const out: Vec2[] = [];
  for (let x = x0 + pitch / 2; x < x1; x += pitch)
    for (let z = z0 + pitch / 2; z < z1; z += pitch) out.push([x, z]);
  return out;
}

/**
 * Where the guests are (PPL-01): seats fill first, in table order; the rest stand in open floor near
 * the bar, never on the dance floor at dinner. At the party the dance floor fills first.
 */
export function placePeople(
  items: readonly Item[],
  count: number,
  phase: "dinner" | "party",
  venue: VenueModel,
  catalog: Catalog,
  toggles: VenueToggles,
  seed: number,
): Crowd {
  const rand = seededRandom(seed);
  const seated: Person[] = [];
  for (const it of items) {
    for (const ch of chairsWorld(it, shapeOf(it, catalog))) {
      if (seated.length >= count) break;
      seated.push({ x: ch.x, z: ch.z, rotY: ch.rotY });
    }
  }
  let left = count - seated.length;
  const standing: Person[] = [];
  if (left <= 0) return { seated, standing, unplaced: 0 };

  const floors = items
    .filter((it) => shapeOf(it, catalog).kind === "danceFloor")
    .map((it) => footprint(it, catalog));
  const onFloor = (p: Vec2) => floors.some((f) => pointInPolygon(p, f));
  const free = walkArea(venue, items, catalog, toggles, 0.3);
  const jitter = (p: Vec2, amount: number): Vec2 => [
    p[0] + (rand() - 0.5) * amount,
    p[1] + (rand() - 0.5) * amount,
  ];

  if (phase === "party") {
    for (const f of floors) {
      const xs = f.map((p) => p[0]);
      const zs = f.map((p) => p[1]);
      const spots = grid(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), DANCE_PITCH)
        .filter((p) => pointInPolygon(p, f))
        .map((p) => ({ p: jitter(p, 0.2), r: rand() }))
        .sort((a, b) => a.r - b.r);
      for (const { p } of spots) {
        if (left <= 0) break;
        standing.push({ x: p[0], z: p[1], rotY: rand() * Math.PI * 2 });
        left--;
      }
    }
  }

  // Everyone else gathers in open floor, nearest the bar first.
  const [bx0, bz0, bx1, bz1] = venue.data.bar.outer.value;
  const bar: Vec2 = [(bx0 + bx1) / 2, (bz0 + bz1) / 2];
  const spots = grid(0, 0, venue.width, venue.depth, STAND_PITCH)
    .map((p) => jitter(p, 0.25))
    .filter((p) => free(p) && !onFloor(p))
    .map((p) => ({ p, d: Math.hypot(p[0] - bar[0], p[1] - bar[1]) + rand() * 1.5 }))
    .sort((a, b) => a.d - b.d);
  for (const { p } of spots) {
    if (left <= 0) break;
    // Facing roughly toward the bar, as people talking near it do.
    const face = Math.atan2(bar[0] - p[0], bar[1] - p[1]) + (rand() - 0.5) * 1.6;
    standing.push({ x: p[0], z: p[1], rotY: face });
    left--;
  }
  return { seated, standing, unplaced: left };
}
