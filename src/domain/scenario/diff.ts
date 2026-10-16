import { countLayout } from "../layout/counts";
import type { Catalog } from "../library/catalog";
import type { Scenario } from "./schema";

/**
 * What differs between this device's copy and the partner's (SCN-03), as short phrases for the
 * conflict dialog: "Tables: 9 here, 8 in theirs", "2 items placed differently".
 */
export function differences(mine: Scenario, theirs: Scenario, catalog: Catalog): string[] {
  const out: string[] = [];
  const a = countLayout(mine.items, mine.guests.count, catalog);
  const b = countLayout(theirs.items, theirs.guests.count, catalog);
  const pair = (label: string, x: string | number, y: string | number) => {
    if (x !== y) out.push(`${label}: ${x} here, ${y} in theirs`);
  };
  pair("Tables", a.tables, b.tables);
  pair("Seats", a.seats, b.seats);
  pair("Guests", a.guests, b.guests);
  const theirsById = new Map(theirs.items.map((i) => [i.id, i]));
  const mineIds = new Set(mine.items.map((i) => i.id));
  const moved = mine.items.filter((i) => {
    const t = theirsById.get(i.id);
    return (
      t && (Math.abs(t.x - i.x) > 0.01 || Math.abs(t.z - i.z) > 0.01 || Math.abs(t.rotY - i.rotY) > 0.01)
    );
  }).length;
  const onlyHere = mine.items.filter((i) => !theirsById.has(i.id)).length;
  const onlyTheirs = theirs.items.filter((i) => !mineIds.has(i.id)).length;
  if (moved) out.push(`${moved} ${moved === 1 ? "item" : "items"} placed differently`);
  if (onlyHere) out.push(`${onlyHere} ${onlyHere === 1 ? "item" : "items"} only here`);
  if (onlyTheirs) out.push(`${onlyTheirs} ${onlyTheirs === 1 ? "item" : "items"} only in theirs`);
  const name = (id: string) => (id === "none" ? "none" : (catalog.get(id)?.name ?? id));
  const style = (label: string, x: string, y: string) => pair(label, name(x), name(y));
  style("Linen", mine.style.linen, theirs.style.linen);
  style("Chairs", mine.style.chair, theirs.style.chair);
  style("Candles", mine.style.candles, theirs.style.candles);
  style("Florals", mine.style.florals, theirs.style.florals);
  const dressing = (s: Scenario) => JSON.stringify(s.items.map((i) => [i.id, i.style ?? null]));
  if (dressing(mine) !== dressing(theirs)) out.push("Some tables are dressed differently");
  if (mine.name !== theirs.name) out.push(`Name: “${mine.name}” here, “${theirs.name}” in theirs`);
  return out;
}
