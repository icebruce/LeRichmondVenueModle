import { countLayout } from "../layout/counts";
import type { Catalog } from "../library/catalog";
import type { Scenario } from "./schema";

const STYLE_LABELS: Partial<Record<keyof Scenario["style"], string>> = {
  linen: "Linen",
  linenLength: "Tablecloth length",
  chair: "Chairs",
  candles: "Candles",
  candleOrder: "Candle order",
  candleTurn: "Candle rotation",
  florals: "Florals",
  floralColour: "Flower colours",
  flowerType: "Flowers",
  charger: "Chargers",
  runner: "Runner",
  napkin: "Napkins",
  settings: "Place settings",
  menus: "Menu cards",
  tableNumbers: "Table numbers",
  lighting: "Lighting",
};

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
  const changed = mine.items.filter((i) => {
    const t = theirsById.get(i.id);
    return t && JSON.stringify(t.options) !== JSON.stringify(i.options);
  }).length;
  if (changed) out.push(`${changed} ${changed === 1 ? "item" : "items"} resized or reseated differently`);
  // Every style setting, by its label: library ids read as names, switches as on/off, a candle mix
  // as its kinds with their counts.
  const one = (id: string) => catalog.get(id)?.name ?? id;
  const name = (v: unknown): string =>
    Array.isArray(v)
      ? v.length
        ? (v as { id: string; n: number }[]).map((m) => `${m.n} × ${one(m.id)}`).join(" + ")
        : "none"
      : typeof v === "boolean"
        ? v
          ? "on"
          : "off"
        : v === "none"
          ? "none"
          : one(String(v));
  const keys = [
    ...new Set([...Object.keys(mine.style), ...Object.keys(theirs.style)]),
  ] as (keyof Scenario["style"])[];
  const shown = (k: keyof Scenario["style"], v: unknown) =>
    k === "candleOrder"
      ? v
        ? "shuffled"
        : "tallest in the middle"
      : k === "candleTurn"
        ? `${String(v)}°`
        : name(v);
  for (const k of keys) pair(STYLE_LABELS[k] ?? k, shown(k, mine.style[k]), shown(k, theirs.style[k]));
  // The same candles at other sizes read alike above.
  if (
    name(mine.style.candles) === name(theirs.style.candles) &&
    JSON.stringify(mine.style.candles) !== JSON.stringify(theirs.style.candles)
  )
    out.push("Candle sizes differ");
  const dressing = (s: Scenario) => JSON.stringify(s.items.map((i) => [i.id, i.style ?? null]));
  if (dressing(mine) !== dressing(theirs)) out.push("Some tables are dressed differently");
  if (JSON.stringify(mine.thresholds) !== JSON.stringify(theirs.thresholds))
    out.push("Check settings differ");
  if (JSON.stringify(mine.venueToggles) !== JSON.stringify(theirs.venueToggles))
    out.push("Venue furniture or paintings differ");
  pair("Moment", mine.phase ?? "dinner", theirs.phase ?? "dinner");
  if (mine.name !== theirs.name) out.push(`Name: “${mine.name}” here, “${theirs.name}” in theirs`);
  // Never claim they match when something else differs (notes merge on their own).
  const rest = (s: Scenario) =>
    JSON.stringify({ ...s, revision: 0, updatedAt: "", updatedBy: "", notes: [] });
  if (!out.length && rest(mine) !== rest(theirs)) out.push("They differ in settings not listed here");
  return out;
}
