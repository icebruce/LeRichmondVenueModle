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
    /** Shown after the value, e.g. "m". */
    unit: z.string().optional(),
  }),
  z.object({
    type: z.literal("choice"),
    key: z.string(),
    label: z.string(),
    choices: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
    default: z.string(),
  }),
  z.object({ type: z.literal("boolean"), key: z.string(), label: z.string(), default: z.boolean() }),
  /** Words the couple types (a neon sign, a welcome board, a monogram), kept short. */
  z.object({
    type: z.literal("text"),
    key: z.string(),
    label: z.string(),
    default: z.string(),
    maxLength: z.number().int().positive().max(40),
  }),
]);
export type ItemOption = z.infer<typeof optionSchema>;

const paramValue = z.union([z.number(), z.string(), z.boolean()]);

/** How the item is drawn: a shared generator with fixed parameters, or a model file. */
const modelSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("parametric"),
    generator: z.string(),
    /** Fixed generator inputs for this entry, e.g. `{ "finish": "wood" }` or `{ "colour": "#eee3cb" }`. */
    params: z.record(z.string(), paramValue).default({}),
  }),
  z.object({ kind: z.literal("glb"), file: z.string() }),
]);
export type ModelRef = z.infer<typeof modelSchema>;

export const libraryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  family: z.enum(families),
  placement: z.enum(placements),
  /** Nominal size in metres for the default options. */
  sizeM: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().nonnegative() }),
  sizePresets: z.array(z.object({ label: z.string(), options: z.record(z.string(), z.unknown()) })),
  model: modelSchema,
  /** Phone-weight version (LIB-11, PLT-03): a lighter GLB, or the generator at `quality: "low"`. */
  lowModel: modelSchema,
  options: z.array(optionSchema),
  /** Seats only for tables; DJ booths etc. are 0. */
  seats: z.boolean(),
  thumbnail: z.string(),
  source: z.object({
    type: z.enum(["built", "cc0", "custom"]),
    origin: z.string(),
    licence: z.string().min(2),
  }),
  budget: z.object({
    triangles: z.number().int().positive(),
    phoneTriangles: z.number().int().positive(),
    drawCalls: z.number().int().positive(),
  }),
  requestId: z.string().optional(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryFileSchema = z.object({ family: z.enum(families), items: z.array(libraryEntrySchema) });
