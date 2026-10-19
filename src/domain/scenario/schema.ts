import { z } from "zod";

export const MAX_CANDLE_KINDS = 3;
export const MAX_CANDLES_PER_KIND = 8;

export const SCHEMA_VERSION = 6;

/** A share of a length, 0 to 1. */
const unit = z.number().min(0).max(1);

/** A candle size in cm; each kind's own range is applied where the candle is drawn. */
const cm = z.number().positive().max(100);

/**
 * Candles on each table (LIB-05, owner 2026-10-17): up to three kinds, each with how many per table
 * and, once changed, its own sizes in cm (`w` width, `h` heights, one per candle where the kind has
 * one each, a taper's `holder`, a candelabra's `arms`); empty for none. They are arranged for the
 * table, not placed one by one.
 */
export const candleMixSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      n: z.number().int().min(1).max(MAX_CANDLES_PER_KIND),
      w: cm.optional(),
      h: z.array(cm).min(1).max(MAX_CANDLES_PER_KIND).optional(),
      holder: cm.optional(),
      arms: z.number().int().min(1).max(5).optional(),
    }),
  )
  .max(MAX_CANDLE_KINDS)
  .refine((mix) => new Set(mix.map((m) => m.id)).size === mix.length, "Each candle kind once");
export type CandleMix = z.infer<typeof candleMixSchema>;
export type CandleKind = CandleMix[number];

/** Table décor (DEC-01..04, LIB-04..06): library ids, or "none" for florals and chargers. */
const tableStyleSchema = z.object({
  linen: z.string(),
  chair: z.string(),
  candles: candleMixSchema,
  /** The candles' order (owner, 2026-10-17): 0 tallest in the middle, otherwise a shuffle's seed. */
  candleOrder: z.number().int().min(0),
  /** The candle group turned on the table, in degrees (0–180). */
  candleTurn: z.number().min(0).max(180),
  florals: z.string(),
  /** Flower colour palette for the arrangement (LIB-06). */
  floralColour: z.string(),
  /** Charger under each place setting: gold, silver, glass or none (LIB-04). */
  charger: z.string(),
  /** Table runner: a library runner id or "none" (LIB-03). */
  runner: z.string(),
  /** Napkin on each plate: a library napkin id or "none" (LIB-03). */
  napkin: z.string(),
  /** Which flowers the arrangement is made of (LIB-06). */
  flowerType: z.string(),
});
export type TableStyle = z.infer<typeof tableStyleSchema>;

const itemSchema = z.object({
  id: z.string().min(1),
  libraryId: z.string().min(1),
  x: z.number().finite(),
  z: z.number().finite(),
  rotY: z.number().finite(),
  options: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  label: z.string().max(12).optional(),
  /** Per-table décor override (DEC-05); unset keys follow the scenario style. */
  style: tableStyleSchema.partial().optional(),
});

const noteSchema = z.object({
  id: z.string(),
  author: z.enum(["A", "B"]),
  text: z.string().max(2000),
  at: z.string(),
});

export const scenarioSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  /** Also a storage key, so letters, digits, "-" and "_" only. */
  id: z.string().regex(/^[\w-]{1,40}$/),
  name: z.string().min(1).max(80),
  phase: z.enum(["dinner", "party"]).optional(),
  revision: z.number().int().nonnegative(),
  items: z.array(itemSchema),
  style: tableStyleSchema.extend({
    linenLength: z.enum(["lap", "floor"]),
    /** Place settings (chargers, plates, glasses, cutlery) on seated tables (LIB-04). */
    settings: z.boolean(),
    /** A menu card on each plate and a number holder on each table (LIB-04). */
    menus: z.boolean(),
    tableNumbers: z.boolean(),
    lighting: z.enum(["evening", "day"]),
  }),
  guests: z.object({ count: z.number().int().min(0).max(400), seed: z.number().int() }),
  thresholds: z.object({
    aisleM: z.number().positive(),
    clearanceM: z.number().positive(),
    m2PerDancer: z.number().positive(),
    dancingShare: z.number().min(0).max(1),
  }),
  venueToggles: z.object({
    barStools: z.boolean(),
    /** Painting id → "hidden" or a replacement artwork id; absent = the current artwork (VEN-05). */
    paintings: z.record(z.string(), z.string()),
    /** The two vases of blossom on the bar top (VEN-06): shown, and where each stands along the bar. */
    barFlowers: z.object({ shown: z.boolean(), at: z.tuple([unit, unit]) }),
  }),
  notes: z.array(noteSchema),
  updatedAt: z.string(),
  updatedBy: z.enum(["A", "B"]).optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStyle = Scenario["style"];

/** One saved revision in a scenario's history (SCN-04), as the API lists it. */
export type VersionInfo = { revision: number; updatedAt: string; updatedBy?: string; name?: string };
