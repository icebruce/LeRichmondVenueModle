import type { Item } from "../layout/items";
import { SCHEMA_VERSION, type Scenario, type TableStyle, scenarioSchema } from "./schema";

export const DEFAULT_STYLE: Scenario["style"] = {
  linen: "linen-ivory",
  linenLength: "floor",
  chair: "chair-oval",
  candles: [{ id: "candle-votives", n: 3 }],
  florals: "none",
  floralColour: "white",
  charger: "gold",
  runner: "none",
  napkin: "none",
  flowerType: "rose",
  settings: true,
  menus: false,
  tableNumbers: false,
  lighting: "evening",
};

export const DEFAULT_THRESHOLDS: Scenario["thresholds"] = {
  aisleM: 1.0,
  clearanceM: 1.2,
  m2PerDancer: 0.45,
  dancingShare: 0.35,
};

export function newScenario(id: string, name: string, now: string, items: Item[] = []): Scenario {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    revision: 0,
    items,
    style: { ...DEFAULT_STYLE },
    guests: { count: 75, seed: 1 },
    thresholds: { ...DEFAULT_THRESHOLDS },
    venueToggles: { barStools: false, paintings: {} },
    notes: [],
    updatedAt: now,
  };
}

/**
 * The venue's sample plan F01 (LAY-09), re-fitted to the owner's corrections (2026-10-17): three tables
 * of 12 by the garage doors (6 a side, across the room, ≈ 1.2 m from the doors and ≈ 1 m from the bar),
 * 1×10 and 3×8 on the raised floor, sweetheart, dance area (clear of the entrance), DJ option 1.
 */
export function venueSampleItems(): Item[] {
  const t = (id: string, x: number, z: number, seats: number): Item => ({
    id,
    libraryId: "table-rect",
    x,
    z,
    rotY: 0,
    options: { seats, ends: false },
  });
  return [
    t("t1", 3.32, 2.65, 12),
    t("t2", 3.32, 5.75, 12),
    t("t3", 3.32, 8.85, 12),
    t("t4", 13.6, 1.65, 10),
    t("t5", 13.6, 4.2, 8),
    t("t6", 13.6, 6.6, 8),
    t("t7", 13.6, 9.4, 8),
    { id: "sweetheart", libraryId: "table-sweetheart", x: 2.8, z: 13.2, rotY: Math.PI, options: {} },
    {
      id: "dance",
      libraryId: "dance-floor",
      x: 6.2,
      z: 11.6,
      rotY: 0,
      options: { width: 4.8, depth: 3.0 },
    },
    { id: "dj", libraryId: "dj-booth", x: 1.25, z: 11.5, rotY: Math.PI / 2, options: { spot: "dj1" } },
  ];
}

export function venueSampleScenario(id: string, now: string): Scenario {
  return newScenario(id, "Option A · Venue sample", now, venueSampleItems());
}

/** Older files are upgraded here as the schema evolves (one function per version step). */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v2 (step 2): candles, florals and place settings in the style; per-painting choices.
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    style: {
      candles: "candle-votives",
      florals: "none",
      floralColour: "white",
      charger: "gold",
      settings: true,
      ...(raw.style as object),
    },
    venueToggles: { paintings: {}, ...(raw.venueToggles as object) },
  }),
  // v3 (step 2): runners, napkins, flower types, menu cards and table numbers.
  2: (raw) => ({
    ...raw,
    schemaVersion: 3,
    style: {
      runner: "none",
      napkin: "none",
      flowerType: "rose",
      menus: false,
      tableNumbers: false,
      ...(raw.style as object),
    },
  }),
  // v4 (step 4E): candles become a mix of up to three kinds with a count each (owner, 2026-10-17).
  3: (raw) => {
    const mix = (v: unknown) =>
      typeof v !== "string" ? v : v === "none" ? [] : [{ id: v, n: LEGACY_CANDLE_COUNTS[v] ?? 1 }];
    const style = raw.style as Record<string, unknown> | undefined;
    const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
    return {
      ...raw,
      schemaVersion: 4,
      style: style && { ...style, candles: mix(style.candles) },
      items: items.map((i) => {
        const s = i.style as Record<string, unknown> | undefined;
        return s && "candles" in s ? { ...i, style: { ...s, candles: mix(s.candles) } } : i;
      }),
    };
  },
};

/**
 * How many candles each single-choice candle set of v3 showed per centre spot. A long table had one
 * spot per metre, so it opens with fewer candles than it showed; the kinds and their look stay.
 */
const LEGACY_CANDLE_COUNTS: Record<string, number> = {
  "candle-votives": 3,
  "candle-pillars": 3,
  "candle-tapers": 2,
  "candle-floating": 2,
};

/** A table's décor: its own override over the scenario style (DEC-05). */
export function styleOf(item: Item, style: Scenario["style"]): TableStyle {
  const { linen, chair, candles, florals, floralColour, charger, runner, napkin, flowerType } = style;
  return { linen, chair, candles, florals, floralColour, charger, runner, napkin, flowerType, ...item.style };
}

export function parseScenario(raw: unknown): Scenario {
  let data = raw as Record<string, unknown>;
  let version = typeof data?.schemaVersion === "number" ? data.schemaVersion : SCHEMA_VERSION;
  while (version < SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from scenario version ${version}`);
    data = step(data);
    version += 1;
  }
  return scenarioSchema.parse(data);
}

export function exportScenario(s: Scenario): string {
  return JSON.stringify({ app: "richmond-studio", scenario: s }, null, 2);
}

/** Accepts an exported file (or a bare scenario) and returns a scenario with a fresh id. */
export function importScenario(text: string, newId: string, now: string): Scenario {
  const parsed: unknown = JSON.parse(text);
  const body =
    parsed && typeof parsed === "object" && "scenario" in parsed
      ? (parsed as { scenario: unknown }).scenario
      : parsed;
  const s = parseScenario(body);
  return { ...s, id: newId, revision: 0, updatedAt: now };
}
