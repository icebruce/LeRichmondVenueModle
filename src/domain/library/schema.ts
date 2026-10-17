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
  /** Photo previews of imported things with no fitting model (IMP-05). */
  "photo",
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
  /** A lit piece (a glow, light-coloured words) whose thumbnail is drawn on a dark ground (LIB-11). */
  thumbnailGround: z.literal("dark").optional(),
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
  /** Set on items the couple imported from a photo (IMP-05): what the result is, honestly labelled. */
  imported: z
    .object({
      result: z.enum(["material", "approximate", "photo"]),
      imageId: z.string(),
      link: z.string().optional(),
      /** Removed from the library lists; scenarios that use it still show it. */
      archived: z.boolean().optional(),
    })
    .optional(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryFileSchema = z.object({ family: z.enum(families), items: z.array(libraryEntrySchema) });

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
/** Images the couple added (imports, request photos): `img-` + random id, stored privately (§6.3). */
export const imageIdSchema = z.string().regex(/^img-[a-z0-9]{6,16}$/);
/** Only web links are kept, as the item's source; the app never fetches them (IMP-07). */
const link = z
  .string()
  .max(500)
  .regex(/^https?:\/\/[^\s]+$/i, "That is not a web link");

/** What the couple says the photo shows (IMP-02). */
export const importTypes = [
  "fabric",
  "candle",
  "centrepiece",
  "florals",
  "chair",
  "table",
  "plant",
  "light",
  "print",
  "other",
] as const;
export type ImportType = (typeof importTypes)[number];

/**
 * An item imported from a photo (IMP-01..07): a library model (`baseId`) adjusted from the photo
 * (`params` over the model's own), its real size, colours and the cropped photo. Shared by both
 * partners; never edited after saving except to remove it from the library or put it back (`archived`).
 */
export const importedSchema = z.object({
  id: z.string().regex(/^imp-[a-z0-9]{6,16}$/),
  name: z.string().trim().min(1).max(60),
  type: z.enum(importTypes),
  result: z.enum(["material", "approximate", "photo"]),
  baseId: z.string().regex(/^[a-z0-9-]+$/),
  params: z.record(z.string(), paramValue),
  sizeCm: z.object({ w: z.number().min(1).max(2000), h: z.number().min(1).max(1000) }),
  colours: z.array(hex).max(4),
  imageId: imageIdSchema,
  /** A small JPEG of the crop for library lists (data URL). */
  thumb: z
    .string()
    .regex(/^data:image\/(jpeg|webp|png);base64,/)
    .max(60_000),
  link: link.optional(),
  createdAt: z.iso.datetime(),
  createdBy: z.enum(["A", "B"]).nullable(),
  archived: z.boolean(),
  /** When `archived` last changed (removed, or put back with Undo); the later change wins. */
  updatedAt: z.iso.datetime().optional(),
});
export type Imported = z.infer<typeof importedSchema>;

/**
 * A custom model request (REQ-01, REQ-02): kept privately in the app, never in Git (REQ-04).
 * Its status is not stored: it shows "Ready" once a library entry carries this request's id.
 */
export const customRequestSchema = z.object({
  id: z.string().regex(/^req-[a-z0-9]{6,16}$/),
  /** The library or imported item it starts from; none for a request started from scratch (LIB-13). */
  itemId: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().trim().min(1).max(60),
  sizeCm: z.object({
    w: z.number().min(1).max(2000),
    d: z.number().min(1).max(2000).optional(),
    h: z.number().min(1).max(1000),
  }),
  placement: z.enum(["floor", "table", "wall", "ceiling", "hanging"]),
  notes: z.string().max(1000),
  imageIds: z.array(imageIdSchema).max(6),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: z.enum(["A", "B"]).nullable(),
});
export type CustomRequest = z.infer<typeof customRequestSchema>;
