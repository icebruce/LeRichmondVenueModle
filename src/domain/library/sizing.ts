// Table sizes from seat counts. Assumptions (not venue-confirmed): 0.70 m of table edge per guest
// (owner, 2026-10-17), rectangle width 0.9 m (1.0 m from 12 seats), round diameters follow common
// rental sizes.

export const SEAT_PITCH = 0.7;
/** How far a chair zone extends beyond a table edge, for collision footprints. */
export const CHAIR_ZONE = 0.55;

export type RectTable = { shape: "rect"; length: number; width: number; perSide: number; ends: boolean };
export type RoundTable = { shape: "round"; diameter: number };

export function rectTable(seats: number, ends: boolean): RectTable {
  const sideSeats = ends ? Math.max(seats - 2, 2) : seats;
  const perSide = Math.ceil(sideSeats / 2);
  const length = Math.max(1.2, Math.round(perSide * SEAT_PITCH * 10) / 10);
  const width = seats >= 12 ? 1.0 : 0.9;
  return { shape: "rect", length, width, perSide, ends };
}

const ROUND_DIAMETERS: Record<number, number> = { 4: 0.9, 6: 1.2, 8: 1.5, 10: 1.8 };

export function roundTable(seats: number): RoundTable {
  const even = Math.min(10, Math.max(4, seats - (seats % 2)));
  return { shape: "round", diameter: ROUND_DIAMETERS[even] ?? 1.5 };
}
