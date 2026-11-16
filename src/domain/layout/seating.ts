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

export const fullName = (g: GuestName): string => [g.first, g.last].filter(Boolean).join(" ");

/**
 * The chairs' indices in seat-number order: clockwise seen from above. A rectangle starts at the
 * left of its first long side, goes along it, round the far end, back along the other side, then
 * the near end; a round table keeps its own order (already clockwise).
 */
export function seatOrder(shape: Shape): number[] {
  if (shape.kind === "roundTable") return shape.chairs.map((_, i) => i);
  if (shape.kind !== "rectTable") return [];
  const idx = shape.chairs.map((c, i) => ({ c, i }));
  const north = idx.filter(({ c }) => c.z < -1e-6).sort((a, b) => a.c.x - b.c.x);
  const south = idx.filter(({ c }) => c.z > 1e-6).sort((a, b) => b.c.x - a.c.x);
  const ends = idx.filter(({ c }) => Math.abs(c.z) <= 1e-6);
  const east = ends.filter(({ c }) => c.x > 0);
  const west = ends.filter(({ c }) => c.x < 0);
  return [...north, ...east, ...south, ...west].map(({ i }) => i);
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
