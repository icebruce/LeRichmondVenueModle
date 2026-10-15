import type { Catalog } from "../library/catalog";
import { type Item, seatsOf, shapeOf } from "./items";

export type Counts = {
  tables: number;
  seats: number;
  guests: number;
  withoutSeat: number;
  danceFloorM2: number;
};

export function countLayout(items: readonly Item[], guests: number, catalog: Catalog): Counts {
  let tables = 0;
  let seats = 0;
  let danceFloorM2 = 0;
  for (const item of items) {
    const shape = shapeOf(item, catalog);
    const s = seatsOf(shape);
    if (s > 0) {
      tables += 1;
      seats += s;
    }
    if (shape.kind === "danceFloor") danceFloorM2 += shape.width * shape.depth;
  }
  return { tables, seats, guests, withoutSeat: Math.max(0, guests - seats), danceFloorM2 };
}

/**
 * Table labels (LAY-10): own label if set, the sweetheart table is "♥", other seated tables are
 * numbered 1, 2, 3… in list order, skipping numbers already used by own labels.
 */
export function tableLabels(items: readonly Item[], catalog: Catalog): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Set(items.map((i) => i.label).filter((l): l is string => !!l));
  let n = 1;
  for (const item of items) {
    if (item.label) {
      labels.set(item.id, item.label);
      continue;
    }
    if (item.libraryId === "table-sweetheart") {
      labels.set(item.id, "♥");
      continue;
    }
    if (seatsOf(shapeOf(item, catalog)) === 0) continue;
    while (used.has(String(n))) n++;
    labels.set(item.id, String(n));
    n++;
  }
  return labels;
}
