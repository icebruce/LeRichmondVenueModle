import type { Catalog } from "../library/catalog";
import type { GuestName, Scenario } from "../scenario/schema";
import { tableLabels } from "./counts";
import { type Item, type Shape, chairsWorld, shapeOf } from "./items";

/** One seat of the layout (SEA-01): its table, its number at that table and where its chair stands. */
export type Seat = {
  key: string;
  item: string;
  /** The table's label (LAY-10): "1", "2"… or "♥". */
  table: string;
  /** 1, 2, 3… around the table. */
  n: number;
  x: number;
  z: number;
  /** The chair's facing (it looks towards the table). */
  rotY: number;
};

export const seatKey = (itemId: string, n: number): string => `${itemId}:${n}`;

/** The table a seat key belongs to. */
export const seatItem = (key: string): string => key.slice(0, key.lastIndexOf(":"));

export const fullName = (g: GuestName): string => [g.first, g.last].filter(Boolean).join(" ");

/**
 * The chairs' indices in seat-number order: clockwise seen from above. A rectangle starts at the
 * left of its first long side, goes along it, round the far end, back along the other side, then
 * the near end; a round table keeps its own order (already clockwise).
 */
export function seatOrder(shape: Shape): number[] {
  return seatPlaces(shape).map(({ i }) => i);
}

/**
 * Each seat in seat-number order with its place at the table: "n0", "n1"… along the first side,
 * "e" the right end, "s0"… back along the other side, "w" the left end; a round table's "r0"….
 */
function seatPlaces(shape: Shape): { i: number; place: string }[] {
  if (shape.kind === "roundTable") return shape.chairs.map((_, i) => ({ i, place: `r${i}` }));
  if (shape.kind !== "rectTable") return [];
  const idx = shape.chairs.map((c, i) => ({ c, i }));
  const north = idx.filter(({ c }) => c.z < -1e-6).sort((a, b) => a.c.x - b.c.x);
  const south = idx.filter(({ c }) => c.z > 1e-6).sort((a, b) => b.c.x - a.c.x);
  const ends = idx.filter(({ c }) => Math.abs(c.z) <= 1e-6);
  const east = ends.filter(({ c }) => c.x > 0);
  const west = ends.filter(({ c }) => c.x < 0);
  const at = (p: string) => (list: typeof idx) => list.map(({ i }, k) => ({ i, place: `${p}${k}` }));
  return [...at("n")(north), ...at("e")(east), ...at("s")(south), ...at("w")(west)];
}

/**
 * A table's names after one of its end chairs is switched on or off (LAY-03, SEA-03): every guest
 * stays on their chair under its new seat number; a guest whose end chair went, and any name the
 * table already had without a seat, is listed without a seat (numbered past the table's seats).
 */
export function namesAfterEnds(
  id: string,
  before: Shape,
  after: Shape,
  seating: Scenario["seating"],
): Scenario["seating"] {
  const was = seatPlaces(before).map((s) => s.place);
  const now = seatPlaces(after).map((s) => s.place);
  const out: Scenario["seating"] = {};
  const lost: [number, GuestName][] = [];
  for (const [key, name] of Object.entries(seating)) {
    if (seatItem(key) !== id) {
      out[key] = name;
      continue;
    }
    const n = Number(key.slice(key.lastIndexOf(":") + 1));
    const to = now.indexOf(was[n - 1] ?? "");
    if (to >= 0) out[seatKey(id, to + 1)] = name;
    else lost.push([n, name]);
  }
  lost.sort((a, b) => a[0] - b[0]).forEach(([, name], k) => (out[seatKey(id, now.length + k + 1)] = name));
  return out;
}

/** Every seat in the layout, table by table in list order, numbered around each table. */
export function layoutSeats(items: readonly Item[], catalog: Catalog): Seat[] {
  const labels = tableLabels(items, catalog);
  const seats: Seat[] = [];
  for (const it of items) {
    const shape = shapeOf(it, catalog);
    const chairs = chairsWorld(it, shape);
    seatOrder(shape).forEach((ci, k) => {
      const ch = chairs[ci];
      if (!ch) return;
      seats.push({
        key: seatKey(it.id, k + 1),
        item: it.id,
        table: labels.get(it.id) ?? "",
        n: k + 1,
        ...ch,
      });
    });
  }
  return seats;
}

/**
 * Names whose seat is gone (SEA-03): its table was deleted or lost seats. They stay in the plan,
 * listed apart, until they are moved to a seat or removed; undoing the change seats them again.
 */
export function unseated(scenario: Scenario, seats: readonly Seat[]): { key: string; name: GuestName }[] {
  const there = new Set(seats.map((s) => s.key));
  return Object.entries(scenario.seating)
    .filter(([k]) => !there.has(k))
    .map(([key, name]) => ({ key, name }));
}

/** How many seats carry a name. */
export function seatedNames(scenario: Scenario, seats: readonly Seat[]): number {
  return seats.filter((s) => scenario.seating[s.key]).length;
}
