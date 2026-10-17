import { FLORAL_PALETTES, centrepieceHeight } from "../layout/decor";
import { PIECE_GENERATORS, makePiece } from "../layout/pieces";
import { type Catalog, placeholderEntry } from "./catalog";
import type { CustomRequest, ImportType, Imported, ItemOption, LibraryEntry } from "./schema";

type Values = Record<string, number | string | boolean>;

/**
 * What a photo can become (IMP-02, IMP-05), honestly labelled: fabric is a *Material*, things with
 * a fitting library model are *Approximate 3D*, anything else a *Photo preview* at real size.
 */
export type ImportKind = {
  id: ImportType;
  name: string;
  result: Imported["result"];
  /** Built-in library models this kind of thing can start from. */
  fits: (e: LibraryEntry) => boolean;
};

const generatorOf = (e: LibraryEntry) => (e.model.kind === "parametric" ? e.model.generator : "");
const photoKind = (e: LibraryEntry) => (e.model.kind === "parametric" ? e.model.params.kind : undefined);

export const IMPORT_TYPES: readonly ImportKind[] = [
  {
    id: "fabric",
    name: "Fabric or linen",
    result: "material",
    fits: (e) =>
      ["linen", "runner", "napkin"].includes(generatorOf(e)) &&
      !(e.model.kind === "parametric" && e.model.params.bare === true),
  },
  { id: "candle", name: "Candle or holder", result: "approximate", fits: (e) => e.family === "candle" },
  {
    id: "centrepiece",
    name: "Vase or centrepiece",
    result: "approximate",
    fits: (e) => e.family === "floral" && e.placement === "table" && generatorOf(e) !== "garland",
  },
  { id: "florals", name: "Florals", result: "approximate", fits: (e) => e.family === "floral" },
  { id: "chair", name: "Chair", result: "approximate", fits: (e) => e.family === "chair" },
  { id: "table", name: "Table", result: "approximate", fits: (e) => e.family === "table" },
  { id: "plant", name: "Plant", result: "approximate", fits: (e) => e.family === "plant" },
  { id: "light", name: "Light", result: "approximate", fits: (e) => e.family === "light" },
  {
    id: "print",
    name: "Sign or print",
    result: "approximate",
    fits: (e) => generatorOf(e) === "photo" && photoKind(e) === "print",
  },
  {
    id: "other",
    name: "Something else",
    result: "photo",
    fits: (e) => generatorOf(e) === "photo" && photoKind(e) === "standee",
  },
];

export const importKind = (id: ImportType): ImportKind =>
  IMPORT_TYPES.find((k) => k.id === id) ?? (IMPORT_TYPES[IMPORT_TYPES.length - 1] as ImportKind);

/** Short label shown on every imported item (DESIGN_GUIDE §1.6); a photo preview is never "3D". */
export const RESULT_LABELS: Record<Imported["result"], string> = {
  material: "Material",
  approximate: "Approximate 3D",
  photo: "Photo preview",
};

// ---- Colours ------------------------------------------------------------------------------------

type Rgb = [number, number, number];
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
export const fromHex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
/** 0 (same) … 1 (black vs white). */
export const colourDistance = (a: string, b: string) => {
  const [p, q] = [fromHex(a), fromHex(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / (255 * Math.sqrt(3));
};

/**
 * The photo's main colours (IMP-05), most common first: k-means over the crop's pixels (RGBA rows,
 * `width` × `height`). A cluster that matches the crop's border is taken as background and dropped
 * when the object has colours of its own.
 */
export function dominantColours(rgba: ArrayLike<number>, width: number, height: number, k = 4): string[] {
  const pixels: Rgb[] = [];
  const border: Rgb[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4000)));
  for (let y = 0; y < height; y += step)
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if ((rgba[i + 3] ?? 255) < 128) continue;
      const px: Rgb = [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0];
      pixels.push(px);
      if (x < step || y < step || x >= width - step || y >= height - step) border.push(px);
    }
  if (!pixels.length) return [];
  // Start from pixels spread across the brightness range, so the result is the same every time.
  const sorted = [...pixels].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centres: Rgb[] = Array.from(
    { length: Math.min(k, sorted.length) },
    (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)] as Rgb,
  );
  let counts: number[] = [];
  for (let round = 0; round < 10; round++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) [best, bestD] = [j, d];
      });
      const s = sums[best] as number[];
      s[0] = (s[0] ?? 0) + p[0];
      s[1] = (s[1] ?? 0) + p[1];
      s[2] = (s[2] ?? 0) + p[2];
      s[3] = (s[3] ?? 0) + 1;
    }
    centres = centres.map((c, j) => {
      const [r, g, b, n] = sums[j] as [number, number, number, number];
      return n ? [r / n, g / n, b / n] : c;
    });
    counts = sums.map((s) => s[3] ?? 0);
  }
  const found = centres
    .map((c, j) => ({ hex: toHex(c), n: counts[j] ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const bg = border.length
    ? toHex(
        border.reduce<Rgb>(
          (s, p) => [s[0] + p[0] / border.length, s[1] + p[1] / border.length, s[2] + p[2] / border.length],
          [0, 0, 0],
        ),
      )
    : null;
  const object = bg ? found.filter((c) => colourDistance(c.hex, bg) > 0.12) : found;
  // Near-duplicates add nothing.
  const out: string[] = [];
  for (const c of object.length ? object : found)
    if (out.every((o) => colourDistance(o, c.hex) > 0.08)) out.push(c.hex);
  return out.slice(0, 3);
}

/** A library model's own colour, if it has one, to compare with the photo. */
function colourOf(e: LibraryEntry): string | null {
  if (e.model.kind !== "parametric") return null;
  const p = e.model.params;
  const c = p.colour ?? p.frame;
  if (typeof c === "string" && c.startsWith("#")) return c;
  const pal = FLORAL_PALETTES[String(p.palette ?? "")];
  return pal?.colours[0] ?? null;
}

// ---- Suggestion ---------------------------------------------------------------------------------

/**
 * The closest library models for the photo (IMP-05), best first: by proportions (the real size's
 * height to width against the model's), by real height, and by colour where the model has one.
 */
export function suggest(
  type: ImportType,
  photo: { sizeCm: { w: number; h: number }; colours: readonly string[] },
  catalog: Catalog,
): LibraryEntry[] {
  const kind = importKind(type);
  const aspect = photo.sizeCm.h / photo.sizeCm.w;
  const score = (e: LibraryEntry) => {
    const own = colourOf(e);
    const colour = own && photo.colours[0] ? colourDistance(own, photo.colours[0]) : 0.25;
    // Fabric is judged on colour only; a tablecloth is the likelier meaning.
    if (kind.id === "fabric") return colour + (generatorOf(e) === "linen" ? 0 : 0.05);
    const base = e.sizeM.h > 0 && e.sizeM.w > 0 ? e.sizeM.h / e.sizeM.w : 1;
    // Shape first, then how big it really is (a 60 cm candelabra is not a 33 cm lantern), then colour.
    const tall = e.sizeM.h > 0 ? Math.abs(Math.log(photo.sizeCm.h / 100 / e.sizeM.h)) * 0.5 : 0;
    return Math.abs(Math.log(aspect / base)) + tall + colour * 1.5;
  };
  return [...catalog.values()]
    .filter((e) => !e.imported && !e.retired && kind.fits(e))
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => a.s - b.s)
    .map((x) => x.e);
}

/** A leaf-green among the photo's colours, for a plant's foliage. */
function leafy(colours: readonly string[]): string | null {
  return (
    colours.find((c) => {
      const [r, g, b] = fromHex(c);
      return g > r && g >= b * 0.9 && g > 40;
    }) ?? null
  );
}

/** What the photo changes on the chosen model (IMP-05); the rest stays the model's own. */
export function importParams(
  base: LibraryEntry,
  photo: { sizeCm: { w: number; h: number }; colours: readonly string[]; imageId: string },
): Values {
  if (base.model.kind !== "parametric") return {};
  const g = base.model.generator;
  const [c0, c1] = photo.colours;
  if (g === "photo") return { image: photo.imageId, w: photo.sizeCm.w / 100, h: photo.sizeCm.h / 100 };
  if (!c0) return {};
  if (["linen", "runner", "napkin"].includes(g)) return { colour: c0 };
  if (g === "chair") return { frame: c0, seat: c1 ?? c0 };
  if (g === "plant") {
    const leaf = leafy(photo.colours);
    return leaf ? { colour: leaf } : {};
  }
  if (g === "floralPiece") return { colours: photo.colours.join(",") };
  const natural = centrepieceHeight(g, base.model.params);
  if (natural) {
    const scale = Math.min(3, Math.max(0.3, photo.sizeCm.h / 100 / natural));
    return {
      scale: Math.round(scale * 100) / 100,
      ...(base.family === "floral" ? { colours: photo.colours.join(",") } : {}),
    };
  }
  return {};
}

/**
 * What the photo really changes on a model (IMP-05 honesty): its size (pieces take the real size,
 * table-top pieces a scale) and its colours. Tables, for example, keep the model's own of both.
 */
export function importAdjusts(base: LibraryEntry, params: Values): { size: boolean; colour: boolean } {
  const g = base.model.kind === "parametric" ? base.model.generator : "";
  return {
    size: params.scale !== undefined || PIECE_GENERATORS.includes(g),
    colour: ["colour", "frame", "seat", "colours"].some((k) => params[k] !== undefined),
  };
}

// ---- Library entries ----------------------------------------------------------------------------

/** Options of the model, with the photo's colour first where the model offers colours. */
function ownOptions(base: LibraryEntry, imp: Imported, widthM: number): ItemOption[] {
  const colour = imp.colours[0];
  return base.options
    .filter((o) => !(o.key === "palette" && typeof imp.params.colours === "string"))
    .map((o) => {
      if (o.type === "choice" && colour && o.choices.every((c) => /^#[0-9a-f]{6}$/i.test(c.value)))
        return {
          ...o,
          choices: [
            { value: colour, label: "From your photo" },
            ...o.choices.filter((c) => c.value !== colour),
          ],
          default: colour,
        };
      if (o.type === "number" && (o.key === "width" || o.key === "span"))
        return { ...o, default: Math.min(o.max, Math.max(o.min, Math.round(widthM / o.step) * o.step)) };
      return o;
    });
}

/**
 * The library entry for an imported item (IMP-06): its model with the photo's changes, its real
 * size where the model takes one, the crop as its thumbnail, and its label.
 */
export function importedEntry(imp: Imported, catalog: Catalog): LibraryEntry {
  const base = catalog.get(imp.baseId);
  if (!base || base.model.kind !== "parametric") return placeholderEntry(imp.id, imp.name);
  const params = { ...base.model.params, ...imp.params };
  const low = base.lowModel.kind === "parametric" ? { ...base.lowModel.params, ...imp.params } : params;
  const w = imp.sizeCm.w / 100;
  const options = ownOptions(base, imp, w);
  const g = base.model.generator;
  let sizeM = base.sizeM;
  if (g === "photo") {
    const p = makePiece(g, params, {}, base.sizeM);
    sizeM = { w: p.width, d: p.depth, h: p.height };
  } else if (PIECE_GENERATORS.includes(g)) {
    const d = base.sizeM.d * (w / base.sizeM.w);
    sizeM = { w, d, h: base.placement === "floor" ? imp.sizeCm.h / 100 : base.sizeM.h };
  }
  return {
    ...base,
    id: imp.id,
    name: imp.name,
    model: { kind: "parametric", generator: g, params },
    lowModel: { kind: "parametric", generator: g, params: low },
    options,
    sizeM,
    sizePresets: [],
    thumbnail: imp.thumb,
    source: { type: "custom", origin: imp.link ?? "The couple's photo", licence: "The couple's own photo" },
    imported: {
      result: imp.result,
      imageId: imp.imageId,
      ...(imp.link ? { link: imp.link } : {}),
      ...(imp.archived ? { archived: true } : {}),
    },
  };
}

/** The catalogue with the couple's imported items (IMP-06), built-in entries first. */
export function withImported(builtIn: Catalog, imports: readonly Imported[]): Map<string, LibraryEntry> {
  const map = new Map<string, LibraryEntry>([...builtIn].filter(([id]) => !id.startsWith("imp-")));
  for (const imp of imports) map.set(imp.id, importedEntry(imp, builtIn));
  return map;
}

/**
 * Where a custom request stands (REQ-02): "Ready" once a catalogue entry carries its id in
 * `requestId` (Claude ships it in an update), otherwise "Requested". Nobody sets it by hand.
 */
export function requestStatus(
  r: CustomRequest,
  catalog: Catalog,
): { status: "requested" | "ready"; label: string; entry?: LibraryEntry } {
  const entry = [...catalog.values()].find((e) => e.requestId === r.id);
  return entry ? { status: "ready", label: "Ready", entry } : { status: "requested", label: "Requested" };
}
