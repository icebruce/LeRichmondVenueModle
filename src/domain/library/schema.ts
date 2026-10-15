import { z } from "zod";

export const families = [
  "table",
  "chair",
  "linen",
  "eventPiece",
  "tableware",
  "candle",
  "floral",
  "plant",
  "light",
  "sign",
] as const;
export type Family = (typeof families)[number];

export const placements = ["floor", "table", "wall", "ceiling", "hanging", "material"] as const;

const optionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("number"),
    key: z.string(),
    label: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    default: z.number(),
  }),
  z.object({
    type: z.literal("choice"),
    key: z.string(),
    label: z.string(),
    choices: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
    default: z.string(),
  }),
  z.object({ type: z.literal("boolean"), key: z.string(), label: z.string(), default: z.boolean() }),
]);
export type ItemOption = z.infer<typeof optionSchema>;

export const libraryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  family: z.enum(families),
  placement: z.enum(placements),
  /** Nominal size in metres for the default options. */
  sizeM: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().nonnegative() }),
  sizePresets: z.array(z.object({ label: z.string(), options: z.record(z.string(), z.unknown()) })),
  model: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("parametric"), generator: z.string() }),
    z.object({ kind: z.literal("glb"), file: z.string() }),
  ]),
  options: z.array(optionSchema),
  /** Seats only for tables; DJ booths etc. are 0. */
  seats: z.boolean(),
  thumbnail: z.string(),
  source: z.object({
    type: z.enum(["built", "cc0", "custom"]),
    origin: z.string(),
    licence: z.string().min(2),
  }),
  budget: z.object({ triangles: z.number().int().positive(), drawCalls: z.number().int().positive() }),
  requestId: z.string().optional(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryFileSchema = z.object({ family: z.enum(families), items: z.array(libraryEntrySchema) });
