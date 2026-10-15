import { z } from "zod";

export const SCHEMA_VERSION = 1;

const itemSchema = z.object({
  id: z.string().min(1),
  libraryId: z.string().min(1),
  x: z.number().finite(),
  z: z.number().finite(),
  rotY: z.number().finite(),
  options: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  label: z.string().max(12).optional(),
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
  style: z.object({
    linen: z.string(),
    linenLength: z.enum(["lap", "floor"]),
    chair: z.string(),
    lighting: z.enum(["evening", "day"]),
  }),
  guests: z.object({ count: z.number().int().min(0).max(400), seed: z.number().int() }),
  thresholds: z.object({
    aisleM: z.number().positive(),
    clearanceM: z.number().positive(),
    m2PerDancer: z.number().positive(),
    dancingShare: z.number().min(0).max(1),
  }),
  venueToggles: z.object({ communalTable: z.boolean(), barStools: z.boolean() }),
  notes: z.array(noteSchema),
  updatedAt: z.string(),
  updatedBy: z.enum(["A", "B"]).optional(),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStyle = Scenario["style"];
