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
  if (!e) throw new Error(`Unknown library item ${id}`);
  return e;
}

/** The item's own option values over the entry's defaults. */
export function resolveOptions(e: LibraryEntry, own: Record<string, unknown>): Record<string, unknown> {
  const defaults = Object.fromEntries(e.options.map((o) => [o.key, o.default]));
  const resolved: Record<string, unknown> = { ...defaults, ...own };
  // Words are cut to the option's length here, so every piece gets them within bounds.
  for (const o of e.options)
    if (o.type === "text") resolved[o.key] = String(resolved[o.key] ?? o.default).slice(0, o.maxLength);
  return resolved;
}
