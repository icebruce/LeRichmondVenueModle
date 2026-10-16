import { FLORAL_PALETTES, type Part, type Slot } from "./decor";
import { seededRandom } from "../random";

/**
 * Step-3 library pieces (LIB-01, LIB-06..10): plants, lights, floral installations, signs and event
 * pieces, built from the same unit primitives as table décor (see decor.ts), in the item's frame
 * with y = 0 on the floor it stands on. The scene draws every piece in the room with one instanced
 * mesh per primitive and material, so a room full of them stays inside the draw-call budget.
 */
export type Piece = {
  /** Footprint (m) in the item's frame; a hanging piece's is the area under it. */
  width: number;
  depth: number;
  height: number;
  parts: Part[];
  /** Words drawn as a texture (neon, a sign board, a projected monogram), if any. */
  text?: PieceText;
};

export type PieceText = {
  value: string;
  look: "neon" | "board" | "projection";
  /** Centre and size of the text panel (m), and its rotation about x (radians; −π/2 lies flat, facing up). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  tilt: number;
  colour: string;
};

type Values = Record<string, number | string | boolean>;
/** The entry's catalogue size (`sizeM`, m): pieces are built to it, so the data sets the size. */
export type Size = { w: number; d: number; h: number };

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

const cyl = (slot: Slot, x: number, y: number, z: number, r: number, h: number, colour?: string): Part => ({
  prim: "cylinder",
  slot,
  x,
  y,
  z,
  sx: r,
  sy: h,
  sz: r,
  ...(colour ? { colour } : {}),
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
const box = (
  slot: Slot,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour?: string,
): Part => ({ prim: "box", slot, x, y, z, sx, sy, sz, ...(colour ? { colour } : {}) });

/** A thin rod from a to b (x, y in the item's xy plane at depth z): wires, stems, frames. */
function rod(slot: Slot, a: [number, number], b: [number, number], z: number, r: number): Part {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return { ...cyl(slot, a[0], a[1], z, r, Math.hypot(dx, dy)), rz: Math.atan2(-dx, dy) };
}

const palette = (id: unknown) => FLORAL_PALETTES[str(id, "white")]?.colours ?? ["#ffffff"];

/** A loose cloud of blooms and leaves filling an ellipsoid (installations, crowns, walls). */
function cloud(
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  n: number,
  colours: readonly string[],
  rand: () => number,
  leafShare = 0.35,
  bloom = 0.05,
): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < n; i++) {
    // Uniform-ish points on the surface, pulled in a little for depth.
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const k = 0.75 + rand() * 0.25;
    const s = Math.sqrt(1 - u * u);
    const x = cx + Math.cos(a) * s * rx * k;
    const y = cy + u * ry * k;
    const z = cz + Math.sin(a) * s * rz * k;
    if (rand() < leafShare) parts.push({ ...ball("leaf", x, y, z, bloom * 1.1), sy: bloom * 0.5 });
    else parts.push(ball("flower", x, y, z, bloom * (0.8 + rand() * 0.5), colours[i % colours.length]));
  }
  return parts;
}

/** Uplight colours (LIB-08). */
export const LIGHT_COLOURS: Record<string, string> = {
  amber: "#ffb35c",
  blush: "#ff9fb2",
  lavender: "#b9a2ff",
  blue: "#7fb2ff",
  white: "#fff4e0",
};

/** Phone weight (LIB-11): fewer leaves and blooms for the `quality: "low"` model. */
const share = (p: Values) => (p.quality === "low" ? 0.5 : 1);

/**
 * A potted plant (LIB-07) filling its catalogue size: the crown spans the footprint and reaches
 * the full height. Species proportions are data (`params`): pot diameter, crown share of the
 * height, leaf count and size, colour, and look (leaves, palm fronds or blossom).
 */
function plant(p: Values, size: Size, rand: () => number): Piece {
  const pot = num(p.pot, 0.4);
  const potH = pot * 0.9;
  const leaf = num(p.leaf, 0.05);
  const r = size.w / 2;
  const crownH = num(p.crown, 0.4) * size.h;
  const base = size.h - crownH;
  const parts: Part[] = [
    cyl("ceramic", 0, 0, 0, pot / 2, potH),
    cyl("black", 0, potH - 0.02, 0, pot / 2 - 0.02, 0.02),
  ];
  const look = str(p.look, "leaves");
  const n = Math.round(num(p.leaves, 40) * (look === "fronds" ? 1 : share(p)));
  if (look === "fronds") {
    // Palm: fronds arching out from the top of the stem to the edge of the footprint.
    if (base > potH) parts.push(cyl("wood", 0, potH, 0, 0.03, base - potH));
    const reach = r - 0.01;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.3;
      const tipY = base + crownH * (0.2 + rand() * 0.3);
      parts.push({ ...rod("leaf", [0, base], [reach, tipY], 0, 0.012), ry: -a });
      // Paired leaflets along each frond, longest mid-way, so it reads as a palm, not spokes.
      const pairs = p.quality === "low" ? 5 : 8;
      for (let j = 1; j <= pairs; j++) {
        const f = j / (pairs + 1);
        const y = base + (tipY - base) * f + crownH * 0.45 * Math.sin(f * Math.PI);
        const along = leaf * (0.5 + Math.sin(f * Math.PI));
        parts.push({
          ...ball("leaf", Math.cos(a) * reach * f, y, Math.sin(a) * reach * f, leaf),
          sx: along,
          sy: 0.012,
          sz: leaf * 0.7,
          ry: -a,
        });
      }
    }
    return { width: size.w, depth: size.d, height: size.h, parts };
  }
  // Leaves (or blossom) on an ellipsoid crown that fits inside the footprint and height.
  if (base > potH + 0.1) parts.push(cyl("wood", 0, potH, 0, 0.03, base - potH + crownH * 0.3));
  const rx = r - leaf;
  const rz = size.d / 2 - leaf;
  const ry = crownH / 2 - leaf;
  const cy = base + crownH / 2;
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const k = 0.6 + rand() * 0.4;
    const x = Math.cos(a) * Math.sqrt(1 - u * u) * rx * k;
    const z = Math.sin(a) * Math.sqrt(1 - u * u) * rz * k;
    const y = cy + u * ry * k;
    parts.push(
      look === "blossom" && i % 3 !== 0
        ? ball("flower", x, y, z, leaf, i % 2 ? "#ef9fb8" : "#f7c3d2")
        : {
            ...ball("leaf", x, y, z, leaf, p.colour === undefined ? undefined : String(p.colour)),
            sy: leaf * 0.45,
          },
    );
  }
  return { width: size.w, depth: size.d, height: size.h, parts };
}

/** Bulbs hanging on a sagging wire across `span` (string and Edison lights). */
function strand(span: number, hang: number, sag: number, bulbs: number, bulb: number, drop: number): Part[] {
  const parts: Part[] = [];
  const at = (t: number): [number, number] => [-span / 2 + span * t, hang - sag * (1 - (2 * t - 1) ** 2)];
  const segs = 16;
  for (let i = 0; i < segs; i++) parts.push(rod("black", at(i / segs), at((i + 1) / segs), 0, 0.004));
  for (let i = 0; i < bulbs; i++) {
    const [x, y] = at((i + 0.5) / bulbs);
    if (drop > 0) parts.push(cyl("black", x, y - drop, 0, 0.004, drop));
    parts.push(ball("bulb", x, y - drop - bulb, 0, bulb));
  }
  return parts;
}

function light(p: Values, o: Values, size: Size, rand: () => number): Piece {
  const kind = str(p.kind, "");
  const colour = LIGHT_COLOURS[str(o.colour, str(p.colour, "amber"))] ?? "#ffb35c";
  const hang = num(o.hang, num(p.hang, 2.8));
  switch (kind) {
    case "string":
    case "edison": {
      const span = num(o.span, num(p.span, 4));
      const edison = kind === "edison";
      return {
        width: span,
        depth: 0.2,
        height: hang,
        parts: strand(
          span,
          hang,
          edison ? 0.45 : 0.25,
          Math.round(span * (edison ? 3 : 8)),
          edison ? 0.035 : 0.02,
          edison ? 0.12 : 0,
        ),
      };
    }
    case "uplight":
      // A small floor can by a wall (behind it, local −z): a fading beam and a soft wash on the wall.
      return {
        width: size.w,
        depth: size.d,
        height: size.h,
        parts: [
          box("black", 0, 0, 0, size.w * 0.8, size.h * 0.7, size.d * 0.8),
          { prim: "bowl", slot: "beam", x: 0, y: 0.14, z: -0.05, sx: 0.35, sy: 1.6, sz: 0.2, colour },
          { prim: "plane", slot: "glow", x: 0, y: 0.1, z: -0.14, sx: 1.4, sy: 3.2, sz: 1, colour },
        ],
      };
    case "pinSpot":
      // A ceiling can with a narrow beam down onto a table's centrepiece.
      return {
        width: size.w,
        depth: size.d,
        height: hang,
        parts: [
          cyl("black", 0, hang, 0, 0.05, 0.14),
          {
            prim: "cone",
            slot: "beam",
            x: 0,
            y: 0.8,
            z: 0,
            sx: 0.25,
            sy: hang - 0.8,
            sz: 0.25,
            colour: "#fff4e0",
          },
        ],
      };
    case "chandelier": {
      // Crystal chandelier as wide as its footprint: tiers of drops around warm bulbs, on a chain.
      const parts: Part[] = [
        cyl("brass", 0, hang + 0.9, 0, 0.008, 1.5),
        cyl("brass", 0, hang + 0.55, 0, 0.05, 0.35),
      ];
      const outer = size.w / 2 - 0.025;
      [1, 0.7, 0.42].forEach((share, t) => {
        const r = outer * share;
        const y = hang + 0.2 + t * 0.2;
        const n = Math.round(r * 40);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          parts.push(ball("glass", Math.cos(a) * r, y - 0.08, Math.sin(a) * r, 0.025));
          if (i % 3 === 0)
            parts.push(ball("bulb", Math.cos(a) * r * 0.85, y + 0.04, Math.sin(a) * r * 0.85, 0.022));
        }
      });
      return { width: size.w, depth: size.d, height: hang + 1, parts };
    }
    case "disco": {
      // A faceted mirror ball, and spots of light scattered over the floor around it.
      const parts: Part[] = [
        cyl("black", 0, hang + 0.25, 0, 0.005, 1.5),
        ball("mirror", 0, hang, 0, size.w / 2 - 0.05),
      ];
      for (let i = 0; i < 64; i++) {
        const a = rand() * Math.PI * 2;
        const d = 0.6 + rand() * 3;
        const r = 0.08 + rand() * 0.06;
        parts.push({
          prim: "plane",
          slot: "glow",
          x: Math.cos(a) * d,
          y: 0.012,
          z: Math.sin(a) * d + r,
          sx: r * 2,
          sy: r * 2,
          sz: 1,
          rx: -Math.PI / 2,
          colour: "#ffffff",
        });
      }
      return { width: size.w, depth: size.d, height: hang + 0.3, parts };
    }
    case "djLights": {
      // A T-bar on a tripod with four coloured cans aimed out over the floor.
      const parts: Part[] = [
        rod("black", [0, 0], [0, 2.1], 0, 0.015),
        rod("black", [-0.6, 2.1], [0.6, 2.1], 0, 0.015),
        rod("black", [0, 0.6], [-0.35, 0], 0, 0.01),
        rod("black", [0, 0.6], [0.35, 0], 0, 0.01),
      ];
      const colours = ["#ff5fa2", "#5fb8ff", "#b46bff", "#ffcf5f"];
      colours.forEach((c, i) => {
        const x = -0.45 + i * 0.3;
        parts.push(cyl("black", x, 2.0, 0, 0.06, 0.1));
        // A beam widening away from its can (bowl: narrow end at the fixture), aimed down and out.
        parts.push({
          prim: "bowl",
          slot: "beam",
          x,
          y: 2.0,
          z: 0,
          sx: 0.5,
          sy: 2.4,
          sz: 0.5,
          rx: Math.PI * 0.72,
          colour: c,
        });
      });
      return { width: size.w, depth: size.d, height: size.h, parts };
    }
    case "monogram":
      // Monogram projection: the couple's initials in light on the dance floor.
      return {
        width: size.w,
        depth: size.d,
        height: size.h,
        parts: [],
        text: {
          value: str(o.text, ""),
          look: "projection",
          x: 0,
          y: 0.03,
          z: 0,
          w: size.w,
          h: size.d * 0.85,
          tilt: -Math.PI / 2,
          colour: "#fff4e0",
        },
      };
    default:
      throw new Error(`Unknown light kind ${kind}`);
  }
}

function floral(p: Values, o: Values, size: Size, rand: () => number): Piece {
  const colours = palette(o.palette ?? p.palette);
  const kind = str(p.kind, "");
  switch (kind) {
    case "arch": {
      // A slim metal hoop with flowers clustered up one side and over the top.
      const w = num(o.width, size.w - 0.3);
      // The hoop stops 10 cm short of the top, where the flowers on it stand proud.
      const h = size.h - 0.1;
      const parts: Part[] = [];
      const r = w / 2;
      const at = (t: number): [number, number] =>
        t < 0.33
          ? [-r, (t / 0.33) * (h - r)]
          : t > 0.67
            ? [r, ((1 - t) / 0.33) * (h - r)]
            : [
                -Math.cos(((t - 0.33) / 0.34) * Math.PI) * r,
                h - r + Math.sin(((t - 0.33) / 0.34) * Math.PI) * r,
              ];
      for (let i = 0; i < 24; i++) parts.push(rod("brass", at(i / 24), at((i + 1) / 24), 0, 0.012));
      for (let i = 0; i < Math.round(110 * share(p)); i++) {
        const t = 0.15 + rand() * 0.55;
        const [x, y] = at(t);
        const z = (rand() - 0.5) * 0.25;
        parts.push(
          rand() < 0.3
            ? { ...ball("leaf", x + (rand() - 0.5) * 0.15, y, z, 0.07), sy: 0.03 }
            : ball(
                "flower",
                x + (rand() - 0.5) * 0.15,
                y + (rand() - 0.5) * 0.1,
                z,
                0.045 + rand() * 0.03,
                colours[i % colours.length],
              ),
        );
      }
      return { width: w + 0.3, depth: size.d, height: h + 0.1, parts };
    }
    case "wall": {
      // Flower wall: a board faced with blooms on a grid (fewer and larger on phones).
      const w = num(o.width, size.w);
      const h = size.h;
      const step = p.quality === "low" ? 0.3 : 0.2;
      const parts: Part[] = [box("black", 0, 0, -0.06, w, h, 0.08)];
      for (let y = step / 2; y < h; y += step)
        for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
          const c = colours[Math.floor(rand() * colours.length)];
          // Jittered and varied, so it reads as massed flowers rather than a grid.
          const jx = x + (rand() - 0.5) * step * 0.5;
          const jy = y + (rand() - 0.5) * step * 0.5;
          const r = step * (0.45 + rand() * 0.2);
          // Kept on the board, so the wall is no wider or taller than its size.
          const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
          const cx = clamp(jx, -w / 2 + r * 1.2, w / 2 - r * 1.2);
          const cy = clamp(jy, r * 1.2, h - r * 1.2);
          parts.push(
            rand() < 0.2
              ? { ...ball("leaf", cx, cy, 0, r * 1.2), sz: step * 0.3 }
              : ball("flower", cx, cy, 0, r, c),
          );
        }
      return { width: w, depth: size.d, height: h, parts };
    }
    case "pedestal": {
      // A column vase with a round arrangement on top, the flowers spanning the footprint.
      const r = size.w / 2 - 0.05;
      const column = size.h * 0.67;
      return {
        width: size.w,
        depth: size.d,
        height: size.h,
        parts: [
          cyl("ceramic", 0, 0, 0, 0.18, column),
          cyl("ceramic", 0, column, 0, 0.22, 0.04),
          ...cloud(0, size.h - 0.3, 0, r, 0.25, r, Math.round(70 * share(p)), colours, rand),
        ],
      };
    }
    case "hanging": {
      // Hanging installation: a cloud of flowers and greenery above a table or the dance floor.
      const hang = num(o.hang, 2.6);
      const w = num(o.width, size.w);
      const n = Math.round(w * 55 * share(p));
      const parts: Part[] = [
        cyl("black", -w / 3, hang + 0.3, 0, 0.004, 1.5),
        cyl("black", w / 3, hang + 0.3, 0, 0.004, 1.5),
        ...cloud(0, hang + 0.25, 0, w / 2 - 0.05, 0.25, size.d / 2 - 0.05, n, colours, rand, 0.45),
      ];
      return { width: w, depth: size.d, height: hang + 0.5, parts };
    }
    default:
      throw new Error(`Unknown floral kind ${kind}`);
  }
}

function sign(p: Values, o: Values, size: Size): Piece {
  const kind = str(p.kind, "");
  if (kind === "neon") {
    const text = str(o.text, "");
    const colour = LIGHT_COLOURS[str(o.colour, "blush")] ?? "#ff9fb2";
    const hang = num(o.hang, 1.6);
    const w = size.w;
    return {
      width: w,
      depth: size.d,
      height: hang + 0.25,
      // Clear acrylic backer, with the tube colour glowing softly on the wall behind it.
      parts: [
        box("glass", 0, hang - 0.25, 0, w, 0.5, 0.01),
        { prim: "plane", slot: "glow", x: 0, y: hang - 0.5, z: -0.02, sx: w * 1.5, sy: 1.0, sz: 1, colour },
      ],
      text: { value: text, look: "neon", x: 0, y: hang, z: 0.012, w: w - 0.05, h: 0.45, tilt: 0, colour },
    };
  }
  if (kind !== "welcome" && kind !== "chart") throw new Error(`Unknown sign kind ${kind}`);
  // Welcome sign or seating chart on a wooden easel, the board 10 cm narrower than the footprint.
  const w = size.w - 0.1;
  const h = kind === "chart" ? 1.2 : 0.8;
  const text = str(o.text, "");
  const lean = 0.18;
  const back = -size.d / 2 + 0.03;
  const parts: Part[] = [
    rod("wood", [-0.3, 0], [-0.2, size.h - 0.05], 0.05, 0.015),
    rod("wood", [0.3, 0], [0.2, size.h - 0.05], 0.05, 0.015),
    rod("wood", [0, 0], [0, size.h - 0.15], back, 0.012),
    box("wood", 0, 0.62, 0.08, w + 0.08, 0.03, 0.06),
    { ...box("paper", 0, 0.65, 0.06, w, h, 0.012), rx: -lean },
  ];
  return {
    width: size.w,
    depth: size.d,
    height: size.h,
    parts,
    text: {
      value: text,
      look: "board",
      x: 0,
      // The board's centre, just in front of its face (it leans back by `lean` about its base).
      y: 0.65 + (h / 2) * Math.cos(lean) + 0.008 * Math.sin(lean),
      z: 0.06 - (h / 2) * Math.sin(lean) + 0.008 * Math.cos(lean),
      w: w * 0.9,
      h: h * 0.9,
      tilt: -lean,
      colour: "#2b2620",
    },
  };
}

function event(p: Values, o: Values, size: Size, rand: () => number): Piece {
  const kind = str(p.kind, "");
  switch (kind) {
    case "stage": {
      const w = num(o.width, size.w);
      const d = num(o.depth, size.d);
      const h = num(o.height, size.h);
      return {
        width: w,
        depth: d,
        height: h,
        parts: [box("black", 0, 0, 0, w, h - 0.02, d), box("wood", 0, h - 0.02, 0, w, 0.02, d)],
      };
    }
    case "photoBooth": {
      // A backdrop frame, a ring light and a camera on a tripod in front of it.
      const parts: Part[] = [
        rod("black", [-1, 0], [-1, 2.2], -0.6, 0.015),
        rod("black", [1, 0], [1, 2.2], -0.6, 0.015),
        rod("black", [-1, 2.2], [1, 2.2], -0.6, 0.015),
        box("fabric", 0, 0.02, -0.62, 2, 2.15, 0.02, str(o.colour, "#e9dfd0")),
        rod("black", [0, 0], [0, 1.4], 0.9, 0.012),
        box("black", 0, 1.4, 0.9, 0.18, 0.12, 0.12),
      ];
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        parts.push(ball("bulb", Math.cos(a) * 0.22, 1.47 + Math.sin(a) * 0.22, 0.83, 0.02));
      }
      return { width: size.w, depth: size.d, height: size.h, parts };
    }
    case "station": {
      // Food or dessert station: a draped counter with trays, domes or tiered stands.
      const w = num(o.width, size.w);
      const sweets = str(p.food, "food") === "dessert";
      const parts: Part[] = [box("fabric", 0, 0, 0, w, 0.9, size.d, "#f2ece0")];
      const n = Math.max(2, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        if (sweets) {
          parts.push(
            cyl("ceramic", x, 0.9, 0, 0.16, 0.012),
            cyl("ceramic", x, 0.9, 0, 0.012, 0.25),
            cyl("ceramic", x, 1.15, 0, 0.11, 0.012),
          );
          for (let k = 0; k < 5; k++)
            parts.push(
              ball("flower", x + (rand() - 0.5) * 0.2, 0.93, (rand() - 0.5) * 0.2, 0.025, "#e8c7a6"),
            );
        } else {
          parts.push(box("silver", x, 0.9, 0, 0.45, 0.08, 0.3), {
            prim: "sphere",
            slot: "silver",
            x,
            y: 0.98,
            z: 0,
            sx: 0.2,
            sy: 0.1,
            sz: 0.13,
          });
        }
      }
      return { width: w, depth: size.d, height: 1.2, parts };
    }
    case "bar": {
      // Portable bar module: white front, dark top, back shelf with bottles.
      const w = num(o.width, size.w - 0.05);
      const parts: Part[] = [
        box("ceramic", 0, 0, 0, w, 1.05, size.d - 0.05),
        box("black", 0, 1.05, 0, w + 0.05, 0.04, size.d),
      ];
      for (let i = 0; i < Math.round(w * 6); i++)
        parts.push(cyl("glass", -w / 2 + 0.1 + i * 0.16, 1.09, -0.15, 0.035, 0.28));
      return { width: w + 0.05, depth: size.d, height: 1.37, parts };
    }
    case "cake": {
      // A round table in champagne cloth with a white three-tier cake, a ring of flowers on each tier.
      const parts: Part[] = [
        cyl("fabric", 0, 0, 0, size.w / 2 - 0.025, 0.76, "#e3d2b0"),
        cyl("brass", 0, 0.76, 0, 0.24, 0.02),
      ];
      [0.2, 0.15, 0.1].forEach((r, i) => {
        const y = 0.78 + i * 0.15;
        parts.push(cyl("ceramic", 0, y, 0, r, 0.15));
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          parts.push(ball("flower", Math.cos(a) * r, y + 0.15, Math.sin(a) * r, 0.022, "#efd2d8"));
        }
      });
      return { width: size.w, depth: size.d, height: 1.25, parts };
    }
    case "gift": {
      // Gift and card table: a draped table with a card box and a few wrapped gifts.
      const parts: Part[] = [
        box("fabric", 0, 0, 0, size.w, 0.76, size.d, "#f4efe4"),
        box("paper", -0.4, 0.76, 0, 0.25, 0.25, 0.25),
      ];
      for (let i = 0; i < 4; i++) {
        const s = 0.12 + rand() * 0.1;
        parts.push(
          box(
            "fabric",
            0.05 + i * 0.18,
            0.76,
            (rand() - 0.5) * 0.25,
            s,
            s,
            s,
            ["#d9c3a5", "#b9c7c0", "#e6cfd2", "#c7b8a3"][i],
          ),
        );
      }
      return { width: size.w, depth: size.d, height: 1.05, parts };
    }
    case "lounge": {
      // Lounge armchair or loveseat (LIB-02): upholstered base, seat cushions, back and arms on short legs.
      const colour = str(o.colour, "#3f5a4a");
      const arm = 0.14;
      const inner = size.w - arm * 2;
      const seats = Math.max(1, Math.round(num(p.seats, 1)));
      const parts: Part[] = [box("fabric", 0, 0.1, 0, size.w, 0.3, size.d, colour)];
      for (let i = 0; i < seats; i++)
        parts.push(
          box(
            "fabric",
            -inner / 2 + (inner / seats) * (i + 0.5),
            0.4,
            0.06,
            inner / seats - 0.02,
            0.1,
            size.d - 0.2,
            colour,
          ),
        );
      parts.push(
        box("fabric", 0, 0.4, -size.d / 2 + 0.09, inner, size.h - 0.4, 0.18, colour),
        box("fabric", -size.w / 2 + arm / 2, 0.4, 0, arm, 0.25, size.d, colour),
        box("fabric", size.w / 2 - arm / 2, 0.4, 0, arm, 0.25, size.d, colour),
      );
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        parts.push(cyl("wood", x * (size.w / 2 - 0.06), 0, z * (size.d / 2 - 0.06), 0.025, 0.1));
      return { width: size.w, depth: size.d, height: size.h, parts };
    }
    default:
      throw new Error(`Unknown event piece kind ${kind}`);
  }
}

const PIECES: Record<string, (p: Values, o: Values, size: Size, rand: () => number) => Piece> = {
  plant: (p, _o, size, rand) => plant(p, size, rand),
  light,
  floralPiece: floral,
  sign,
  eventPiece: event,
};

/** Generators that make a library piece (keys of the catalogue's `model.generator`). */
export const PIECE_GENERATORS: readonly string[] = Object.keys(PIECES);

/**
 * One library piece from its generator, the entry's fixed params, its catalogue size and the
 * item's options. The seed keeps a plant's leaves or a wall's flowers the same every time.
 */
export function makePiece(generator: string, params: Values, options: Values, size: Size, seed = 1): Piece {
  const key = `${generator}|${seed}|${JSON.stringify([params, options, size])}`;
  let piece = made.get(key);
  if (!piece) {
    const gen = PIECES[generator];
    if (!gen) throw new Error(`Unknown piece generator ${generator}`);
    piece = gen(params, options, size, seededRandom(seed));
    // Shapes are asked for often (placement, checks, counts); a piece is the same every time.
    if (made.size > 500) made.clear();
    made.set(key, piece);
  }
  return piece;
}

const made = new Map<string, Piece>();
