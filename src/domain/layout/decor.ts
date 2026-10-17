import { seededRandom } from "../random";
import type { Catalog } from "../library/catalog";
import type { LibraryEntry } from "../library/schema";
import type { CandleMix, TableStyle } from "../scenario/schema";
import type { Chair, Shape } from "./items";

/** Which table style an item fills when used on every table, if any (DEC-01). */
export function styleKeyOf(e: LibraryEntry): keyof TableStyle | null {
  const g = e.model.kind === "parametric" ? e.model.generator : "";
  if (g === "linen" || g === "runner" || g === "napkin") return g;
  if (g === "chair") return "chair";
  if (e.family === "candle") return "candles";
  if (e.family === "floral" && e.placement === "table") return "florals";
  return null;
}

/**
 * Table décor as simple parts (DEC-02..03, LIB-04..06). Every part is a unit primitive scaled and
 * placed in the table's local frame (y = 0 at the table top), so the scene draws all décor in the
 * room with one instanced mesh per primitive and material.
 *
 * Primitives: `cylinder` radius 1, height 1, base at y 0 · `sphere` radius 1, centred · `box` 1 m
 * cube, base at y 0 · `cone` radius 1, height 1, base at y 0, point up · `bowl` the same cone
 * point down (vase bowls) · `plane` 1 m square facing +z, base at y 0 (glows, washes of light).
 */
export type Prim = "cylinder" | "sphere" | "box" | "cone" | "bowl" | "plane";
export type Slot =
  | "wax"
  | "flame"
  | "glass"
  | "water"
  | "brass"
  | "silver"
  | "black"
  | "ceramic"
  | "paper"
  | "flower"
  | "leaf"
  | "fabric"
  | "sheer"
  | "wood"
  | "bulb"
  | "beam"
  | "glow"
  | "mirror";
export type Part = {
  prim: Prim;
  slot: Slot;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** Rotation (radians, Euler XYZ): arms, stems and cutlery. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Per-part colour (flowers, chargers). */
  colour?: string;
};

/** Floral generators built from a mound of blooms: the ones whose flower type can be chosen. */
export const FLOWER_TYPE_GENERATORS: readonly string[] = ["lowMound", "tallArrangement", "compote"];

/** Flower colours per palette (LIB-06: colours chosen per arrangement). */
export const FLORAL_PALETTES: Record<string, { label: string; colours: string[] }> = {
  white: { label: "White", colours: ["#f6f3ec", "#ebe6da", "#f2efe4", "#e2e9d6"] },
  blush: { label: "Blush", colours: ["#f3d6d0", "#e9b8b0", "#f8e8e2", "#f0e4d4"] },
  burgundy: { label: "Burgundy", colours: ["#6d1f2b", "#93303f", "#c9868a", "#ead9cf"] },
  garden: { label: "Garden", colours: ["#f1d27a", "#f2a65e", "#e9e2d0", "#c97c8f"] },
};

/**
 * Flower types (LIB-06): bloom size, how many blooms an arrangement holds (× the base count), and
 * how often a leaf replaces a bloom. Read at table distance; generic up close is acceptable.
 */
export const FLOWER_TYPES: Record<
  string,
  {
    label: string;
    bloom: [number, number];
    count: number;
    leafEvery: number;
    leaf?: string;
    form?: "plume" | "branch";
  }
> = {
  rose: { label: "Rose", bloom: [0.035, 0.05], count: 1, leafEvery: 3 },
  peony: { label: "Peony", bloom: [0.05, 0.07], count: 0.7, leafEvery: 4 },
  hydrangea: { label: "Hydrangea", bloom: [0.065, 0.085], count: 0.55, leafEvery: 5 },
  ranunculus: { label: "Ranunculus", bloom: [0.03, 0.042], count: 1.2, leafEvery: 3 },
  babysBreath: { label: "Baby’s breath", bloom: [0.012, 0.018], count: 2.6, leafEvery: 7 },
  eucalyptus: { label: "Eucalyptus", bloom: [0.03, 0.04], count: 1, leafEvery: 1.4, leaf: "#9fb5a8" },
  pampas: { label: "Pampas", bloom: [0.03, 0.045], count: 0.6, leafEvery: 4, form: "plume" },
  blossom: { label: "Blossom branches", bloom: [0.016, 0.022], count: 1.6, leafEvery: 8, form: "branch" },
};

const CHARGERS: Record<string, Slot> = { gold: "brass", silver: "silver", glass: "glass" };

type Gen = (p: Record<string, number | string | boolean>, ctx: Ctx) => Part[];
type Ctx = {
  colours: string[];
  rand: () => number;
  scale: number;
  flower: NonNullable<(typeof FLOWER_TYPES)[string]>;
};

const cyl = (slot: Slot, x: number, y: number, z: number, r: number, h: number): Part => ({
  prim: "cylinder",
  slot,
  x,
  y,
  z,
  sx: r,
  sy: h,
  sz: r,
});
const ball = (slot: Slot, x: number, y: number, z: number, r: number, colour?: string): Part => ({
  prim: "sphere",
  slot,
  x,
  y,
  z,
  sx: r,
  sy: r,
  sz: r,
  ...(colour ? { colour } : {}),
});

/** A candle: wax column and its flame. */
const candle = (x: number, y: number, z: number, r: number, h: number): Part[] => [
  cyl("wax", x, y, z, r, h),
  { ...ball("flame", x, y + h + 0.018, z, 0.011), sy: 0.022 },
];

/** A leaf: a flattened ball, tinted for silvery foliage (eucalyptus). */
const leaf = (x: number, y: number, z: number, r: number, ctx: Ctx): Part => ({
  ...ball("leaf", x, y, z, r, ctx.flower.leaf),
  sy: r / 2,
});

/**
 * A mound of flowers and leaves, `r` wide and `h` high, sitting on y. `n` is the bloom count for
 * roses; other flower types scale it (fewer big peonies, many tiny baby's breath).
 */
function mound(x: number, y: number, z: number, r: number, h: number, ctx: Ctx, n: number): Part[] {
  const f = ctx.flower;
  const count = Math.max(6, Math.round(n * f.count));
  const [b0, b1] = f.bloom;
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996;
    const k = Math.sqrt((i + 0.5) / count);
    const px = x + Math.cos(a) * r * k;
    const pz = z + Math.sin(a) * r * k;
    const py = y + h * (1 - k * k) * 0.75 + 0.02;
    const colour = ctx.colours[Math.floor(ctx.rand() * ctx.colours.length)] ?? "#ffffff";
    if (i % f.leafEvery < 1 && i > 0) {
      parts.push(leaf(px, py - 0.01, pz, 0.04, ctx));
    } else if (f.form === "plume" && i % 3 === 0) {
      // Pampas: tall soft plumes rising out of the mound.
      parts.push({ ...ball("flower", px, py + 0.12, pz, 0.03, colour), sy: 0.13 });
    } else if (f.form === "branch" && i % 5 === 0) {
      // Blossom: thin branches leaning out, small flowers along them.
      const lean = (ctx.rand() - 0.5) * 0.9;
      parts.push({ ...cyl("black", px, py, pz, 0.004, 0.22), rz: lean });
      // Flowers along the leaning branch (it tilts about z, so its tip moves in x and y).
      for (let j = 1; j <= 3; j++)
        parts.push(
          ball("flower", px - Math.sin(lean) * 0.07 * j, py + Math.cos(lean) * 0.07 * j, pz, b1, colour),
        );
    } else {
      parts.push(ball("flower", px, py, pz, b0 + ctx.rand() * (b1 - b0), colour));
    }
  }
  return parts;
}

/** Centrepiece generators, keyed by library `model.generator` (candles and florals). */
const centrepieces: Record<string, Gen> = {
  candelabra: (p) => {
    const arms = Number(p.arms ?? 5);
    const parts: Part[] = [
      cyl("brass", 0, 0, 0, 0.07, 0.015),
      cyl("brass", 0, 0.015, 0, 0.014, 0.38),
      ...candle(0, 0.395, 0, 0.011, 0.25),
    ];
    const side = Math.floor((arms - 1) / 2);
    for (let i = 1; i <= side; i++) {
      for (const s of [-1, 1]) {
        const x = s * i * 0.11;
        parts.push(
          {
            prim: "cylinder",
            slot: "brass",
            x: x / 2,
            y: 0.28,
            z: 0,
            sx: 0.008,
            sy: Math.abs(x),
            sz: 0.008,
            rz: (s * Math.PI) / 2,
          },
          cyl("brass", x, 0.28, 0, 0.01, 0.06),
          ...candle(x, 0.34, 0, 0.011, 0.25),
        );
      }
    }
    return parts;
  },
  // Three glass cylinders (20 / 25 / 30 cm) of white candle sand, a wick burning on top, on a ring
  // of eucalyptus with baby's breath (REQ req-f6462824).
  sandCylinders: () => {
    const parts = (
      [
        [0.05, -0.035, 0.3],
        [-0.065, -0.03, 0.25],
        [-0.005, 0.06, 0.2],
      ] as const
    ).flatMap(([x, z, h]) => [
      cyl("glass", x, 0, z, 0.045, h),
      cyl("wax", x, 0.004, z, 0.041, h - 0.035),
      { ...ball("flame", x, h - 0.035 + 0.018, z, 0.011), sy: 0.022 },
    ]);
    // Eucalyptus: round, slightly domed leaves (flat cones, light on phones) tilted every way,
    // mounded around the glass; baby's breath as small white florets among them.
    for (let i = 0; i < 30; i++) {
      const a = i * 2.39996;
      const r = 0.09 + (i % 5) * 0.014;
      parts.push({
        prim: "cone",
        slot: "leaf",
        x: Math.cos(a) * r,
        y: 0.008 + (i % 4) * 0.016,
        z: Math.sin(a) * r,
        sx: 0.028,
        sy: 0.006,
        sz: 0.028,
        rx: ((i % 7) - 3) * 0.3,
        rz: ((i % 5) - 2) * 0.35,
        colour: "#7f9c86",
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.4;
      const r = 0.115 + (i % 3) * 0.014;
      parts.push(ball("flower", Math.cos(a) * r, 0.055 + (i % 2) * 0.012, Math.sin(a) * r, 0.012, "#f6f3ec"));
    }
    return parts;
  },
  hurricane: () => [cyl("glass", 0, 0, 0, 0.08, 0.34), ...candle(0, 0, 0, 0.04, 0.14)],
  lantern: () => [
    { prim: "box", slot: "black", x: 0, y: 0, z: 0, sx: 0.16, sy: 0.015, sz: 0.16 },
    { prim: "box", slot: "glass", x: 0, y: 0.015, z: 0, sx: 0.15, sy: 0.24, sz: 0.15 },
    { prim: "cone", slot: "black", x: 0, y: 0.255, z: 0, sx: 0.11, sy: 0.07, sz: 0.11 },
    ...candle(0, 0.015, 0, 0.03, 0.1),
  ],
  lowMound: (_p, ctx) => mound(0, 0, 0, 0.16 * ctx.scale, 0.16, ctx, 34),
  budVases: (_p, ctx) =>
    [-0.16, 0, 0.16].flatMap((x, i) => {
      const h = 0.1 + (i % 2) * 0.04;
      const colour = ctx.colours[i % ctx.colours.length] ?? "#ffffff";
      return [
        cyl("glass", x, 0, 0.02 * (i - 1), 0.022, h),
        {
          prim: "cylinder" as const,
          slot: "leaf" as const,
          x,
          y: h,
          z: 0.02 * (i - 1),
          sx: 0.003,
          sy: 0.08,
          sz: 0.003,
        },
        ball("flower", x, h + 0.09, 0.02 * (i - 1), 0.03, colour),
      ];
    }),
  tallArrangement: (_p, ctx) => [
    cyl("brass", 0, 0, 0, 0.09, 0.012),
    cyl("brass", 0, 0.012, 0, 0.018, 0.62),
    { prim: "bowl", slot: "brass", x: 0, y: 0.6, z: 0, sx: 0.12, sy: 0.08, sz: 0.12 },
    ...mound(0, 0.66, 0, 0.26, 0.42, ctx, 60),
  ],
  compote: (_p, ctx) => [
    cyl("brass", 0, 0, 0, 0.06, 0.012),
    cyl("brass", 0, 0.012, 0, 0.015, 0.1),
    { prim: "bowl", slot: "brass", x: 0, y: 0.1, z: 0, sx: 0.11, sy: 0.06, sz: 0.11 },
    ...mound(0, 0.15, 0, 0.17, 0.16, ctx, 36),
  ],
};

/** Generators that run the table's length instead of sitting at centre spots. */
const runners: Record<
  string,
  (length: number, ctx: Ctx, p: Record<string, number | string | boolean>, overhang: number) => Part[]
> = {
  // Velvet lies flat and drops over both ends, outside the tablecloth; chiffon is wider, sheer and
  // hangs longer (LIB-03).
  runner: (length, _ctx, p, overhang) => {
    const sheer = p.fabric === "chiffon";
    const slot: Slot = sheer ? "sheer" : "fabric";
    const colour = String(p.colour ?? "#ffffff");
    const w = sheer ? 0.5 : 0.36;
    const drop = sheer ? 0.45 : 0.28;
    const parts: Part[] = [
      { prim: "box", slot, x: 0, y: 0.002, z: 0, sx: length + 2 * overhang, sy: 0.004, sz: w, colour },
    ];
    for (const s of [-1, 1])
      parts.push({
        prim: "box",
        slot,
        x: s * (length / 2 + overhang),
        y: -drop,
        z: 0,
        sx: 0.006,
        sy: drop,
        sz: w,
        colour,
      });
    return parts;
  },
  garland: (length, ctx) => {
    const parts: Part[] = [];
    const n = Math.max(8, Math.round(length / 0.07));
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + 0.1 + ((length - 0.2) * i) / (n - 1);
      const z = Math.sin(i * 0.9) * 0.05;
      parts.push({ ...ball("leaf", x, 0.025, z, 0.05 + ctx.rand() * 0.015), sy: 0.025 });
      if (i % 4 === 0)
        parts.push(ball("flower", x, 0.05, z, 0.03, ctx.colours[(i / 4) % ctx.colours.length] ?? "#ffffff"));
    }
    return parts;
  },
};

/**
 * One candle of a kind, the `i`th on the table: a votive, a pillar (three heights in turn), a taper
 * in its holder, a floating candle (two vase heights). Kinds that are one piece already (candelabra,
 * hurricane, lantern, a set in glass) are their own unit.
 */
const candleUnits: Record<string, (i: number) => Part[]> = {
  votives: () => candle(0, 0, 0, 0.03, 0.06),
  pillars: (i) => candle(0, 0, 0, 0.04, [0.16, 0.22, 0.1][i % 3] ?? 0.16),
  tapers: () => [
    cyl("brass", 0, 0, 0, 0.045, 0.012),
    cyl("brass", 0, 0.012, 0, 0.012, 0.16),
    cyl("brass", 0, 0.172, 0, 0.022, 0.015),
    ...candle(0, 0.187, 0, 0.011, 0.28),
  ],
  floatingGlass: (i) => {
    const h = i % 2 ? 0.28 : 0.38;
    return [
      cyl("glass", 0, 0, 0, 0.06, h),
      cyl("water", 0, 0.005, 0, 0.055, h * 0.8),
      ...candle(0, h * 0.8, 0, 0.035, 0.02),
    ];
  },
};

/** Every generator a table-top library entry may name; napkins, menus and numbers are setting parts. */
export const DECOR_GENERATORS: readonly string[] = [
  ...Object.keys(centrepieces),
  ...Object.keys(candleUnits),
  ...Object.keys(runners),
  "napkin",
  "menuCard",
  "tableNumber",
];

/** Centre spots along a table: one per ~0.9 m on long tables, one on round and small ones. */
function spots(shape: Shape): [number, number][] {
  if (shape.kind === "rectTable") {
    if (shape.seats <= 2) return [[0, 0.08]];
    const n = Math.max(2, Math.round(shape.length / 1.0));
    return Array.from({ length: n }, (_, i) => [-shape.length / 2 + (shape.length / n) * (i + 0.5), 0]);
  }
  return [[0, 0]];
}

type Extras = { settings: boolean; menus: boolean; tableNumbers: boolean; linenLength: "lap" | "floor" };

/**
 * One place setting in front of a chair: charger, plate, two glasses, fork, knife; a folded napkin
 * and a menu card on the plate when chosen (LIB-03, LIB-04).
 */
function setting(ch: Chair, edge: number, charger: string, napkin: string | null, menu: boolean): Part[] {
  // Chair front direction (sin rotY, cos rotY); the setting sits on the table edge it faces.
  const fx = Math.sin(ch.rotY);
  const fz = Math.cos(ch.rotY);
  const cx = ch.x + fx * edge;
  const cz = ch.z + fz * edge;
  const rx = Math.cos(ch.rotY);
  const rz = -Math.sin(ch.rotY);
  const parts: Part[] = [];
  const c = CHARGERS[charger];
  if (c) parts.push(cyl(c, cx, 0, cz, 0.165, 0.008));
  parts.push(cyl("ceramic", cx, 0.008, cz, 0.135, 0.012));
  for (const [dx, h] of [
    [0.13, 0.17],
    [0.2, 0.13],
  ] as const) {
    const gx = cx + rx * dx + fx * 0.14;
    const gz = cz + rz * dx + fz * 0.14;
    parts.push(cyl("glass", gx, 0, gz, 0.035, h));
  }
  for (const s of [-1, 1]) {
    parts.push({
      prim: "box",
      slot: "silver",
      x: cx + rx * s * 0.19,
      y: 0,
      z: cz + rz * s * 0.19,
      sx: 0.018,
      sy: 0.005,
      sz: 0.2,
      ry: ch.rotY,
    });
  }
  let top = 0.02;
  if (napkin) {
    parts.push({
      prim: "box",
      slot: "fabric",
      x: cx,
      y: top,
      z: cz,
      sx: 0.11,
      sy: 0.014,
      sz: 0.19,
      ry: ch.rotY,
      colour: napkin,
    });
    top += 0.014;
  }
  if (menu)
    parts.push({
      prim: "box",
      slot: "paper",
      x: cx,
      y: top,
      z: cz,
      sx: 0.1,
      sy: 0.003,
      sz: 0.16,
      ry: ch.rotY,
    });
  return parts;
}

/** Brass table-number holder with its card, standing beside the centrepiece (LIB-04). */
function numberHolder(x: number, z: number): Part[] {
  return [
    cyl("brass", x, 0, z, 0.035, 0.008),
    cyl("brass", x, 0.008, z, 0.004, 0.12),
    { prim: "box", slot: "paper", x, y: 0.1, z, sx: 0.1, sy: 0.07, sz: 0.003 },
  ];
}

/** The style change that puts an item on every table (DEC-01), or null if it is not table dressing. */
export function stylePatch(e: LibraryEntry): Partial<TableStyle> | null {
  const key = styleKeyOf(e);
  if (!key) return null;
  return key === "candles" ? { candles: [{ id: e.id, n: e.defaultCount ?? 1 }] } : { [key]: e.id };
}

/** Whether a piece of table dressing is already the room-wide choice for its part (DEC-01). */
export function isRoomChoice(style: TableStyle, e: LibraryEntry): boolean {
  const key = styleKeyOf(e);
  return !!key && JSON.stringify(style[key]) === JSON.stringify(stylePatch(e)?.[key]);
}

/** How far a part reaches across the table top from its unit's centre: offset plus radius. */
function reach(p: Part): number {
  const r = p.prim === "box" || p.prim === "plane" ? Math.hypot(p.sx, p.sz) / 2 : Math.max(p.sx, p.sz);
  return Math.hypot(p.x, p.z) + r;
}
const radiusOf = (parts: readonly Part[]) => parts.reduce((m, p) => Math.max(m, reach(p)), 0);
/** Up to this height a piece stands among the plates and glasses; above it (candelabra arms) it is clear. */
const TABLE_LEVEL = 0.2;

/** A plate, the table number or a placed candle on the table top. */
type Circle = { x: number; z: number; r: number };
/**
 * A piece's reach in two bands: its base (parts starting below TABLE_LEVEL), up to its top, and
 * whatever starts higher (candelabra arms, a tall arrangement's flowers), with its heights.
 */
type Bands = { base: { r: number; top: number }; upper: { r: number; lo: number; hi: number } | null };
function bandsOf(parts: readonly Part[]): Bands {
  const low = parts.filter((p) => p.y < TABLE_LEVEL);
  const high = parts.filter((p) => p.y >= TABLE_LEVEL);
  return {
    base: { r: radiusOf(low), top: heightOf(low) },
    upper: high.length
      ? { r: radiusOf(high), lo: Math.min(...high.map((p) => p.y)), hi: heightOf(high) }
      : null,
  };
}
/** Heights may graze (a candelabra arm over a low arrangement's edge) by this much (m). */
const GRAZE = 0.05;
/** How far apart two pieces must stand: every pair of their bands that share heights keeps clear. */
function apart(a: Bands, b: Bands): number {
  const meets = (lo1: number, hi1: number, lo2: number, hi2: number) =>
    Math.min(hi1, hi2) - Math.max(lo1, lo2) > GRAZE;
  let d = a.base.r + b.base.r;
  if (a.upper && meets(a.upper.lo, a.upper.hi, 0, b.base.top)) d = Math.max(d, a.upper.r + b.base.r);
  if (b.upper && meets(b.upper.lo, b.upper.hi, 0, a.base.top)) d = Math.max(d, b.upper.r + a.base.r);
  if (a.upper && b.upper && meets(a.upper.lo, a.upper.hi, b.upper.lo, b.upper.hi))
    d = Math.max(d, a.upper.r + b.upper.r);
  return d;
}
type TableTop = Shape & { kind: "rectTable" | "roundTable" | "cocktail" };

/** Room left between a table-top point and the table's edge (negative past it). */
function toEdge(shape: TableTop, x: number, z: number): number {
  return shape.kind === "rectTable"
    ? Math.min(shape.length / 2 - Math.abs(x), shape.width / 2 - Math.abs(z))
    : shape.diameter / 2 - Math.hypot(x, z);
}

/** Candles keep this far from the table edge, from each other and from settings and flowers (m). */
const EDGE = 0.03;
const GAP = 0.012;
/** Grid of table-top spots a candle may move to when its ideal spot is taken (m). */
const STEP = 0.03;

/**
 * The candle mix arranged for the table (DEC-02, owner 2026-10-17): the kinds in turn, tallest in
 * the middle, along the centre line of a long table (beside the centrepieces when there are some),
 * in a ring on a round one, a small group on a cocktail table. Each candle takes the free spot
 * nearest its ideal one, on the table top and clear of the settings, flowers and other candles;
 * those that find none are left off (`placed` < `wanted`), never set in the air or on a plate.
 */
function arrangeCandles(
  shape: TableTop,
  mix: CandleMix,
  plates: readonly Circle[],
  flowers: readonly { x: number; z: number; bands: Bands }[],
  catalog: Catalog,
  ctx: Ctx,
): { parts: Part[]; placed: number; wanted: number } {
  const s = shape.kind === "cocktail" ? 0.6 : 1;
  const kinds = mix.flatMap(({ id, n }) => {
    const e = catalog.get(id);
    if (!e || e.model.kind !== "parametric") return [];
    const { generator: g, params } = e.model;
    const own = ownLook(params, ctx);
    const make = (i: number) =>
      scaled(scaled(candleUnits[g]?.(i) ?? centrepieces[g]?.(params, own.ctx) ?? [], own.scale), s);
    return [{ n, make }];
  });
  const wanted = kinds.reduce((t, k) => t + k.n, 0);
  // Round-robin across kinds, so a mix reads as one arrangement; then tallest in the middle.
  const units: Part[][] = [];
  for (let i = 0; units.length < wanted; i++) for (const k of kinds) if (i < k.n) units.push(k.make(i));
  const order: { parts: Part[]; r: number; bands: Bands }[] = [];
  [...units]
    .sort((a, b) => heightOf(b) - heightOf(a))
    .forEach((parts, i) =>
      order[i % 2 ? "push" : "unshift"]({ parts, r: radiusOf(parts), bands: bandsOf(parts) }),
    );
  const ideal = idealSpots(shape, order, flowers.length > 0);
  // Table-top spots, each with its room to the edge (for all of a candle), to the plates (for its
  // base) and its distance to each flower arrangement (checked band by band).
  const half =
    shape.kind === "rectTable"
      ? [shape.length / 2, shape.width / 2]
      : [shape.diameter / 2, shape.diameter / 2];
  type Cell = { x: number; z: number; edge: number; low: number; flowers: number[] };
  const cells: Cell[] = [];
  for (let x = -(half[0] ?? 0); x <= (half[0] ?? 0); x += STEP)
    for (let z = -(half[1] ?? 0); z <= (half[1] ?? 0); z += STEP) {
      const edge = toEdge(shape, x, z) - EDGE;
      const low = plates.reduce((m, o) => Math.min(m, Math.hypot(x - o.x, z - o.z) - o.r - GAP), Infinity);
      if (edge > 0 && low > 0)
        cells.push({ x, z, edge, low, flowers: flowers.map((f) => Math.hypot(x - f.x, z - f.z) - GAP) });
    }
  const taken: Circle[] = [];
  const parts: Part[] = [];
  order.forEach(({ parts: u, r, bands }, i) => {
    const [ix, iz] = ideal[i] ?? [0, 0];
    const needs = flowers.map((f) => apart(f.bands, bands));
    // The nearest spot to the ideal one with room for it (distance first: it is the cheap test).
    let at: Cell | null = null;
    let best = Infinity;
    for (const c of cells) {
      const d = (c.x - ix) ** 2 + (c.z - iz) ** 2;
      if (d >= best || c.edge < r || c.low < bands.base.r) continue;
      if (c.flowers.some((f, k) => f < (needs[k] ?? 0))) continue;
      if (taken.every((t) => Math.hypot(c.x - t.x, c.z - t.z) >= r + t.r + GAP)) {
        at = c;
        best = d;
      }
    }
    if (!at) return;
    taken.push({ x: at.x, z: at.z, r });
    for (const p of u) parts.push({ ...p, x: p.x + at.x, z: p.z + at.z });
  });
  return { parts, placed: taken.length, wanted };
}

/** Where each candle would ideally stand: a centred line, or a ring sized to the candles. */
function idealSpots(shape: TableTop, order: { r: number }[], crowded: boolean): [number, number][] {
  const widths = order.map((u) => 2 * u.r + GAP);
  const total = widths.reduce((a, w) => a + w, 0);
  let run = -total / 2;
  if (shape.kind === "rectTable")
    return widths.map((w, i) => {
      run += w;
      return [run - w / 2, crowded ? (i % 2 ? 0.16 : -0.16) : 0];
    });
  if (order.length === 1 && !crowded) return [[0, 0]];
  const ring = Math.max(total / (2 * Math.PI), crowded ? 0.22 : 0);
  return widths.map((w) => {
    run += w;
    const a = ((run - w / 2) / total) * Math.PI * 2;
    return [Math.cos(a) * ring, Math.sin(a) * ring];
  });
}

/**
 * All décor for one table, in its local frame: centrepieces (candles, florals) and, when on, a place
 * setting per seat. `seed` keeps the flower mix stable for the same table (PPL-02 spirit).
 */
export function tableDecor(
  shape: Shape,
  style: TableStyle,
  catalog: Catalog,
  extras: Extras,
  seed: number,
): Part[] {
  return dress(shape, style, catalog, extras, seed).parts;
}

/**
 * The table's candles as laid out (DEC-02): their parts, and how many of the mix found room
 * (`placed` of `wanted`), for the Style page's hint.
 */
export function candleLayout(
  shape: Shape,
  style: TableStyle,
  catalog: Catalog,
  extras: Extras,
): { parts: Part[]; placed: number; wanted: number } {
  return dress(shape, style, catalog, extras, 1).candles;
}

type Dressed = { parts: Part[]; candles: { parts: Part[]; placed: number; wanted: number } };

function dress(shape: Shape, style: TableStyle, catalog: Catalog, extras: Extras, seed: number): Dressed {
  if (shape.kind !== "rectTable" && shape.kind !== "roundTable" && shape.kind !== "cocktail")
    return { parts: [], candles: { parts: [], placed: 0, wanted: 0 } };
  const rand = seededRandom(seed);
  const ctx: Ctx = {
    colours: FLORAL_PALETTES[style.floralColour]?.colours ?? FLORAL_PALETTES.white?.colours ?? ["#ffffff"],
    rand,
    scale: shape.kind === "cocktail" ? 0.6 : 1,
    flower: FLOWER_TYPES[style.flowerType] ?? (FLOWER_TYPES.rose as Ctx["flower"]),
  };
  const parts: Part[] = [];
  const pieces = [style.runner, style.florals];
  // How far past the table edge the cloth hangs, so a runner's ends drop outside it (Items.tsx).
  const cloth = catalog.get(style.linen)?.model;
  const bare =
    (shape.kind === "rectTable" && shape.farm) ||
    (cloth?.kind === "parametric" && cloth.params.bare === true);
  const overhang = bare
    ? 0.004
    : shape.kind === "rectTable"
      ? 0.04
      : extras.linenLength === "lap"
        ? 0.065
        : 0.085;
  const at = spots(shape);
  const flowers: { x: number; z: number; parts: Part[] }[] = [];
  for (const id of pieces) {
    const e = catalog.get(id);
    if (!e || e.model.kind !== "parametric") continue;
    const g = e.model.generator;
    const runner = runners[g];
    if (runner) {
      // Along a long table; across a round one; none on a standing cocktail table.
      const length =
        shape.kind === "rectTable" ? shape.length : shape.kind === "roundTable" ? shape.diameter : 0;
      if (length > 0) parts.push(...runner(length, ctx, e.model.params, overhang));
      continue;
    }
    const gen = centrepieces[g];
    if (!gen) continue;
    const places = shape.kind === "cocktail" ? [[0, 0] as [number, number]] : at;
    const own = ownLook(e.model.params, ctx);
    for (const [x, z] of places) {
      const one = scaled(gen(e.model.params, own.ctx), own.scale);
      flowers.push({ x, z, parts: one });
      for (const p of one) parts.push({ ...p, x: p.x + x, z: p.z + z });
    }
  }
  // Settings and the table number first: the candles keep clear of them, and of the flowers.
  const fixed: Part[] = [];
  const plates: Circle[] = [];
  if (extras.settings && shape.kind !== "cocktail") {
    const edge = shape.kind === "rectTable" ? 0.32 + 0.2 : 0.3 + 0.22;
    const n = catalog.get(style.napkin)?.model;
    const napkin = n?.kind === "parametric" ? String(n.params.colour ?? "#ffffff") : null;
    for (const ch of shape.chairs) {
      fixed.push(...setting(ch, edge, style.charger, napkin, extras.menus));
      plates.push({
        x: ch.x + Math.sin(ch.rotY) * edge,
        z: ch.z + Math.cos(ch.rotY) * edge,
        r: CHARGERS[style.charger] ? 0.165 : 0.135,
      });
    }
  }
  if (extras.tableNumbers && shape.kind !== "cocktail") {
    const [x, z] =
      shape.kind === "rectTable" ? [Math.min(0.45, shape.length / 2 - 0.25), -0.18] : [0.24, -0.16];
    fixed.push(...numberHolder(x, z));
    plates.push({ x, z, r: 0.06 });
  }
  // Candles keep their base clear of the plates and the table number (glasses and cutlery tuck in
  // among them, as on a real table), and clear of the flowers wherever they share heights.
  const candles = arrangeCandles(
    shape,
    style.candles,
    plates,
    flowers.map((f) => ({ x: f.x, z: f.z, bands: bandsOf(f.parts) })),
    catalog,
    ctx,
  );
  parts.push(...candles.parts, ...fixed);
  return { parts, candles };
}

/**
 * An imported centrepiece's own look (IMP-05): the photo's colours in place of the table's palette,
 * and a uniform `scale` to its real height.
 */
function ownLook(params: Record<string, number | string | boolean>, ctx: Ctx): { ctx: Ctx; scale: number } {
  const colours = typeof params.colours === "string" ? params.colours.split(",") : null;
  const scale = typeof params.scale === "number" && params.scale > 0 ? params.scale : 1;
  return { ctx: colours ? { ...ctx, colours } : ctx, scale };
}

/** Parts grown or shrunk about the table-top centre, every size and offset alike. */
function scaled(parts: Part[], s: number): Part[] {
  if (s === 1) return parts;
  return parts.map((p) => ({
    ...p,
    x: p.x * s,
    y: p.y * s,
    z: p.z * s,
    sx: p.sx * s,
    sy: p.sy * s,
    sz: p.sz * s,
  }));
}

/** A centrepiece's natural height on the table (m), before any imported scale (IMP-04). */
export function centrepieceHeight(
  generator: string,
  params: Record<string, number | string | boolean>,
): number | null {
  const unit = candleUnits[generator];
  if (unit) return Math.max(...[0, 1, 2].map((i) => heightOf(unit(i))));
  const gen = centrepieces[generator];
  if (!gen) return null;
  const ctx: Ctx = {
    colours: ["#ffffff"],
    rand: seededRandom(1),
    scale: 1,
    flower: FLOWER_TYPES.rose as Ctx["flower"],
  };
  return heightOf(gen(params, ctx));
}

/** Highest point of a set of parts above the table top (m), for realistic-height checks (DEC-03). */
export function heightOf(parts: readonly Part[]): number {
  return parts.reduce((m, p) => Math.max(m, p.y + p.sy), 0);
}

/**
 * The lowest solid point of some parts (a sphere hangs below its centre; light it casts, beams and
 * glows, does not count): where a hanging piece ends.
 */
export function bottomOf(parts: readonly Part[]): number {
  return parts.reduce(
    (m, p) =>
      p.slot === "beam" || p.slot === "glow" ? m : Math.min(m, p.prim === "sphere" ? p.y - p.sy : p.y),
    Infinity,
  );
}
