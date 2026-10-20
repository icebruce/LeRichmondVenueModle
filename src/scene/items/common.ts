import type { Item, Shape } from "../../domain/layout/items";
import type { Drag } from "../../state/view";

export { TABLE_TOP as TOP } from "../../domain/layout/cloth";
/** Picked-up items float this much, so the drag reads as lifting (DESIGN_GUIDE §5). */
export const LIFT = 0.02;

/** An item as drawn: its resolved shape, floor level height and whether its place is valid. */
export type Placed = { item: Item; shape: Shape; y: number; ok: boolean };

/** The item where the live drag currently has it. */
export function moved(item: Item, d: Drag | null): Item {
  return d?.ids.includes(item.id)
    ? { ...item, x: item.x + d.dx, z: item.z + d.dz, rotY: item.rotY + d.dRot }
    : item;
}
