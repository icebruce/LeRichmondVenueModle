import type { Catalog } from "../library/catalog";
import type { TableStyle } from "../scenario/schema";
import type { Chair, Shape } from "./items";

/**
 * Table décor as simple parts (DEC-02..03, LIB-04..06). Every part is a unit primitive scaled and
 * placed in the table's local frame (y = 0 at the table top), so the scene draws all décor in the
 * room with one instanced mesh per primitive and material.
 *
 * Primitives: `cylinder` radius 1, height 1, base at y 0 · `sphere` radius 1, centred · `box` 1 m
 * cube, base at y 0 · `cone` radius 1, height 1, base at y 0, point up · `bowl` the same cone
 * point down (vase bowls).
 */
export type Prim = "cylinder" | "sphere" | "box" | "cone" | "bowl";
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
  | "leaf";
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

/** Flower colours per palette (LIB-06: colours chosen per arrangement). */
export const FLORAL_PALETTES: Record<string, { label: string; colours: string[] }> = {
  white: { label: "White", colours: ["#f6f3ec", "#ebe6da", "#f2efe4", "#e2e9d6"] },
  blush: { label: "Blush", colours: ["#f3d6d0", "#e9b8b0", "#f8e8e2", "#f0e4d4"] },
  burgundy: { label: "Burgundy", colours: ["#6d1f2b", "#93303f", "#c9868a", "#ead9cf"] },
  garden: { label: "Garden", colours: ["#f1d27a", "#f2a65e", "#e9e2d0", "#c97c8f"] },
};

const CHARGERS: Record<string, Slot> = { gold: "brass", silver: "silver", glass: "glass" };

type Gen = (p: Record<string, number | string | boolean>, ctx: Ctx) => Part[];
type Ctx = { colours: string[]; rand: () => number; scale: number };

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

/** A mound of flowers and leaves, `r` wide and `h` high, sitting on y. */
function mound(x: number, y: number, z: number, r: number, h: number, ctx: Ctx, n: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const k = Math.sqrt((i + 0.5) / n);
    const px = x + Math.cos(a) * r * k;
    const pz = z + Math.sin(a) * r * k;
    const py = y + h * (1 - k * k) * 0.75 + 0.02;
    const flower = i % 3 !== 2;
    const colour = ctx.colours[Math.floor(ctx.rand() * ctx.colours.length)] ?? "#ffffff";
    parts.push(
      flower
        ? ball("flower", px, py, pz, 0.035 + ctx.rand() * 0.02, colour)
        : { ...ball("leaf", px, py - 0.01, pz, 0.04), sy: 0.02 },
    );
  }
  return parts;
}

/** Centrepiece generators, keyed by library `model.generator` (candles and florals). */
const centrepieces: Record<string, Gen> = {
  votives: () => [-0.12, 0, 0.12].flatMap((x, i) => [...candle(x, 0, (i % 2) * 0.06 - 0.03, 0.03, 0.06)]),
  pillars: () => [
    ...candle(-0.07, 0, 0.02, 0.04, 0.1),
    ...candle(0.03, 0, -0.03, 0.04, 0.16),
    ...candle(0.1, 0, 0.04, 0.04, 0.22),
  ],
  tapers: () =>
    [-0.12, 0.12].flatMap((x) => [
      cyl("brass", x, 0, 0, 0.045, 0.012),
      cyl("brass", x, 0.012, 0, 0.012, 0.16),
      cyl("brass", x, 0.172, 0, 0.022, 0.015),
      ...candle(x, 0.187, 0, 0.011, 0.28),
    ]),
  floatingGlass: () =>
    [
      [-0.1, 0.38],
      [0.08, 0.28],
    ].flatMap(([x = 0, h = 0.3]) => [
      cyl("glass", x, 0, 0, 0.06, h),
      cyl("water", x, 0.005, 0, 0.055, h * 0.8),
      ...candle(x, h * 0.8, 0, 0.035, 0.02),
    ]),
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
const runners: Record<string, (length: number, ctx: Ctx) => Part[]> = {
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

export const DECOR_GENERATORS: readonly string[] = [...Object.keys(centrepieces), ...Object.keys(runners)];

/** Centre spots along a table: one per ~0.9 m on long tables, one on round and small ones. */
function spots(shape: Shape): [number, number][] {
  if (shape.kind === "rectTable") {
    if (shape.seats <= 2) return [[0, 0.08]];
    const n = Math.max(2, Math.round(shape.length / 1.0));
    return Array.from({ length: n }, (_, i) => [-shape.length / 2 + (shape.length / n) * (i + 0.5), 0]);
  }
  return [[0, 0]];
}

function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** One place setting in front of a chair: charger, plate, two glasses, fork, knife. */
function setting(ch: Chair, edge: number, charger: string): Part[] {
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
  return parts;
}

/**
 * All décor for one table, in its local frame: centrepieces (candles, florals) and, when on, a place
 * setting per seat. `seed` keeps the flower mix stable for the same table (PPL-02 spirit).
 */
export function tableDecor(
  shape: Shape,
  style: TableStyle,
  catalog: Catalog,
  settings: boolean,
  seed: number,
): Part[] {
  if (shape.kind !== "rectTable" && shape.kind !== "roundTable" && shape.kind !== "cocktail") return [];
  const rand = seeded(seed);
  const ctx: Ctx = {
    colours: FLORAL_PALETTES[style.floralColour]?.colours ?? FLORAL_PALETTES.white?.colours ?? ["#ffffff"],
    rand,
    scale: shape.kind === "cocktail" ? 0.6 : 1,
  };
  const parts: Part[] = [];
  const pieces = [style.florals, style.candles];
  const at = spots(shape);
  for (const id of pieces) {
    const e = catalog.get(id);
    if (!e || e.model.kind !== "parametric") continue;
    const g = e.model.generator;
    const runner = runners[g];
    if (runner && shape.kind === "rectTable") {
      parts.push(...runner(shape.length, ctx));
      continue;
    }
    const gen = centrepieces[g];
    if (!gen) continue;
    // Florals take the centre spots; candles sit beside them when both are chosen.
    const shift = id === style.candles && style.florals !== "none" ? 0.22 : 0;
    const places = shape.kind === "cocktail" ? [[0, 0] as [number, number]] : at;
    for (const [sx, sz] of places) {
      for (const p of gen(e.model.params, ctx)) parts.push({ ...p, x: p.x + sx + shift, z: p.z + sz });
    }
  }
  if (settings && shape.kind !== "cocktail") {
    const edge = shape.kind === "rectTable" ? 0.32 + 0.2 : 0.3 + 0.22;
    for (const ch of shape.chairs) parts.push(...setting(ch, edge, style.charger));
  }
  return parts;
}

/** Highest point of a set of parts above the table top (m), for realistic-height checks (DEC-03). */
export function heightOf(parts: readonly Part[]): number {
  return parts.reduce((m, p) => Math.max(m, p.y + p.sy), 0);
}
