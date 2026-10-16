import type { Catalog } from "../library/catalog";
import { type Item, isTable } from "./items";

/** A line the dragged item snapped to: its centre shares `value` on `axis` with `with`. */
export type AlignGuide = { axis: "x" | "z"; value: number; with: string };

/** How close (m) a centre must come to another table's centre line to snap onto it (LAY-05). */
export const ALIGN_TOLERANCE = 0.15;
/** Only tables this close (m, centre to centre) take part, so far-off rows don't pull. */
const ALIGN_RANGE = 6;

/**
 * Snap a dragged item's centre into line with nearby tables (LAY-05). Each axis takes the closest
 * centre line within tolerance; the returned guides say what it lined up with.
 */
export function alignSnap(
  moving: Pick<Item, "x" | "z">,
  others: readonly Item[],
  catalog: Catalog,
  tolerance = ALIGN_TOLERANCE,
): { x: number; z: number; guides: AlignGuide[] } {
  let best: { x?: [number, number, string]; z?: [number, number, string] } = {};
  for (const o of others) {
    if (!isTable(o, catalog)) continue;
    if (Math.hypot(o.x - moving.x, o.z - moving.z) > ALIGN_RANGE) continue;
    for (const axis of ["x", "z"] as const) {
      const d = Math.abs(o[axis] - moving[axis]);
      const cur = best[axis];
      if (d <= tolerance && (!cur || d < cur[0])) best = { ...best, [axis]: [d, o[axis], o.id] };
    }
  }
  const guides: AlignGuide[] = [];
  if (best.x) guides.push({ axis: "x", value: best.x[1], with: best.x[2] });
  if (best.z) guides.push({ axis: "z", value: best.z[1], with: best.z[2] });
  return { x: best.x?.[1] ?? moving.x, z: best.z?.[1] ?? moving.z, guides };
}
