import { z } from "zod";

export const SCHEMA_VERSION = 2;

/** Table décor (DEC-01..04, LIB-04..06): library ids, or "none" for candles, florals and chargers. */
const tableStyleSchema = z.object({
  linen: z.string(),
  chair: z.string(),
  candles: z.string(),
  florals: z.string(),
  /** Flower colour palette for the arrangement (LIB-06). */
  floralColour: z.string(),
  /** Charger under each place setting: gold, silver, glass or none (LIB-04). */
  charger: z.string(),
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
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  phase: z.enum(["dinner", "party"]).optional(),
  revision: z.number().int().nonnegative(),
  items: z.array(itemSchema),
  style: tableStyleSchema.extend({
    linenLength: z.enum(["lap", "floor"]),
    /** Place settings (chargers, plates, glasses, cutlery) on seated tables (LIB-04). */
    settings: z.boolean(),
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
    communalTable: z.boolean(),
    barStools: z.boolean(),
    /** Painting id → "hidden" or a replacement artwork id; absent = the current artwork (VEN-05). */
    paintings: z.record(z.string(), z.string()),
  }),
  notes: z.array(noteSchema),
  updatedAt: z.string(),
  updatedBy: z.enum(["A", "B"]).optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStyle = Scenario["style"];
