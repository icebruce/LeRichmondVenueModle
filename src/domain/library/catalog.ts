import { type LibraryEntry, libraryFileSchema } from "./schema";

export type Catalog = ReadonlyMap<string, LibraryEntry>;

export function buildCatalog(files: unknown[]): Catalog {
  const map = new Map<string, LibraryEntry>();
  for (const raw of files) {
    const file = libraryFileSchema.parse(raw);
    for (const item of file.items) {
      if (item.family !== file.family)
        throw new Error(`${item.id}: family ${item.family} in ${file.family} file`);
      if (map.has(item.id)) throw new Error(`Duplicate library id ${item.id}`);
      map.set(item.id, item);
    }
  }
  return map;
}

export function entry(catalog: Catalog, id: string): LibraryEntry {
  const e = catalog.get(id);
  if (e) return e;
  // A partner's import this device has not loaded yet shows as a plain panel until it arrives.
  if (id.startsWith("imp-")) return placeholderEntry(id);
  throw new Error(`Unknown library item ${id}`);
}

/** Whether the library lists an entry: not retired (DEC-02), not an import the couple removed. */
export const listed = (e: LibraryEntry) => !e.retired && !e.imported?.archived;

/** The item's own option values over the entry's defaults. */
export function resolveOptions(e: LibraryEntry, own: Record<string, unknown>): Record<string, unknown> {
  const defaults = Object.fromEntries(e.options.map((o) => [o.key, o.default]));
  const resolved: Record<string, unknown> = { ...defaults, ...own };
  // Words are cut to the option's length here, so every piece gets them within bounds.
  for (const o of e.options)
    if (o.type === "text") resolved[o.key] = String(resolved[o.key] ?? o.default).slice(0, o.maxLength);
  return resolved;
}

/** Stand-in for an imported item this device has not loaded yet: a plain panel, never an error. */
export function placeholderEntry(id: string, name = "Imported item"): LibraryEntry {
  return {
    id,
    name,
    family: "photo",
    placement: "floor",
    sizeM: { w: 0.6, d: 0.25, h: 0.9 },
    sizePresets: [],
    model: { kind: "parametric", generator: "photo", params: { kind: "standee", w: 0.6, h: 0.9 } },
    lowModel: { kind: "parametric", generator: "photo", params: { kind: "standee", w: 0.6, h: 0.9 } },
    options: [],
    seats: false,
    thumbnail: "thumbs/photo-standee.webp",
    source: { type: "custom", origin: "The couple's photo", licence: "The couple's own photo" },
    budget: { triangles: 20, phoneTriangles: 20, drawCalls: 2 },
    imported: { result: "photo", imageId: "" },
  };
}

/** A hanging or ceiling light, its height set by its `hang` option (LIB-08): the 3D height handle's. */
export function hangingLight(e: Pick<LibraryEntry, "family" | "placement" | "options">): boolean {
  return (
    e.family === "light" &&
    (e.placement === "hanging" || e.placement === "ceiling") &&
    e.options.some((o) => o.key === "hang" && o.type === "number")
  );
}

/** Lights, and pieces marked so, get their thumbnail on a dark ground, so glows and words read (LIB-11). */
export function litThumbnail(e: Pick<LibraryEntry, "family" | "thumbnailGround">): boolean {
  return e.family === "light" || e.thumbnailGround === "dark";
}
