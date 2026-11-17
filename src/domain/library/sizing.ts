// Table sizes from seat counts. Assumptions (not venue-confirmed): 0.70 m of table edge per guest
// (owner, 2026-10-17), rectangle width 0.9 m (1.0 m from 12 seats), round diameters follow common
// rental sizes.

export const SEAT_PITCH = 0.7;
/** How far a chair zone extends beyond a table edge, for collision footprints. */
export const CHAIR_ZONE = 0.55;

export type RectTable = { shape: "rect"; length: number; width: number; perSide: number };
export type RoundTable = { shape: "round"; diameter: number };

/** A rectangle for `sideSeats` along its sides and `endSeats` (0–2) at its ends (LAY-03). */
export function rectTable(sideSeats: number, endSeats: number): RectTable {
  const perSide = Math.ceil(sideSeats / 2);
  const length = Math.max(1.2, Math.round(perSide * SEAT_PITCH * 10) / 10);
  const width = sideSeats + endSeats >= 12 ? 1.0 : 0.9;
  return { shape: "rect", length, width, perSide };
}

const ROUND_DIAMETERS: Record<number, number> = { 4: 0.9, 6: 1.2, 8: 1.5, 10: 1.8 };

export function roundTable(seats: number): RoundTable {
  const even = Math.min(10, Math.max(4, seats - (seats % 2)));
  return { shape: "round", diameter: ROUND_DIAMETERS[even] ?? 1.5 };
}
