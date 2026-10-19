import type { Item } from "../layout/items";
import {
  MAX_CANDLES_PER_KIND,
  SCHEMA_VERSION,
  type Scenario,
  type TableStyle,
  scenarioSchema,
} from "./schema";

export const DEFAULT_STYLE: Scenario["style"] = {
  linen: "linen-ivory",
  linenLength: "floor",
  chair: "chair-oval",
  candles: [{ id: "candle-votives", n: 3 }],
  candleOrder: 0,
  candleTurn: 0,
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

/**
 * Where the bar flowers stand (VEN-06), as shares of the bar top's length: from the north end of
 * its west side, round the front, to the north end of its east side: one on the west side near the
 * front, one along the front, as in R02.
 */
export const DEFAULT_BAR_FLOWERS: Scenario["venueToggles"]["barFlowers"] = { shown: true, at: [0.32, 0.56] };

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
    venueToggles: { barStools: false, paintings: {}, barFlowers: { ...DEFAULT_BAR_FLOWERS } },
    notes: [],
    updatedAt: now,
  };
}

/**
 * The venue's sample plan F01 (LAY-09), re-fitted to the owner's corrections (2026-10-17): three tables
 * of 12 by the garage doors (6 a side, across the room, ≈ 1.2 m from the doors and ≈ 1 m from the bar),
 * 1×10 and 3×8 on the raised floor, sweetheart, DJ option 1. The dance area sits in front of the bar,
 * clear of the kitchen pass and the entrance, since the south wall moved north (owner, 2026-10-17).
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
    { id: "sweetheart", libraryId: "table-sweetheart", x: 3.0, z: 11.8, rotY: Math.PI, options: {} },
    {
      id: "dance",
      libraryId: "dance-floor",
      x: 7.7,
      z: 10.15,
      rotY: 0,
      options: { width: 3.9, depth: 3.1 },
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
  // v5 (step 4G): candle sizes, order and turn; the 3- and 5-arm candelabra become one with arms.
  4: (raw) => {
    const mix = (v: unknown) => {
      if (!Array.isArray(v)) return v;
      const out: Record<string, unknown>[] = [];
      for (const m of v as Record<string, unknown>[]) {
        const arms = CANDELABRA_ARMS[String(m.id)];
        const kind = arms ? { ...m, id: "candelabra", arms } : m;
        const same = out.find((o) => o.id === kind.id);
        if (same) same.n = Math.min(MAX_CANDLES_PER_KIND, Number(same.n) + Number(kind.n));
        else out.push(kind);
      }
      return out;
    };
    const style = raw.style as Record<string, unknown> | undefined;
    const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
    return {
      ...raw,
      schemaVersion: 5,
      style: style && { candleOrder: 0, candleTurn: 0, ...style, candles: mix(style.candles) },
      items: items.map((i) => {
        const s = i.style as Record<string, unknown> | undefined;
        return s && "candles" in s ? { ...i, style: { ...s, candles: mix(s.candles) } } : i;
      }),
    };
  },
  // v6 (visual stage V3): the bar flowers, shown where the photos have them.
  5: (raw) => ({
    ...raw,
    schemaVersion: 6,
    venueToggles: { barFlowers: { ...DEFAULT_BAR_FLOWERS }, ...(raw.venueToggles as object) },
  }),
};

/** The two candelabra of v4 and their arms. */
const CANDELABRA_ARMS: Record<string, number> = { "candelabra-3": 3, "candelabra-5": 5 };

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
  const { linen, chair, candles, candleOrder, candleTurn, florals, floralColour } = style;
  const { charger, runner, napkin, flowerType } = style;
  return {
    linen,
    chair,
    candles,
    candleOrder,
    candleTurn,
    florals,
    floralColour,
    charger,
    runner,
    napkin,
    flowerType,
    ...item.style,
  };
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
