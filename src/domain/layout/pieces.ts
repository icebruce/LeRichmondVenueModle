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
  /** Whether it takes floor space: hanging and ceiling pieces never block anything. */
  blocks: boolean;
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

/** Plant species (LIB-07): pot, trunk and foliage proportions. */
const SPECIES: Record<
  string,
  {
    pot: number;
    trunk: number;
    crown: [number, number, number];
    leaves: number;
    leaf: number;
    colour?: string;
  }
> = {
  fiddleLeaf: { pot: 0.42, trunk: 1.0, crown: [0.35, 0.55, 0.35], leaves: 40, leaf: 0.1 },
  olive: { pot: 0.45, trunk: 1.1, crown: [0.45, 0.4, 0.45], leaves: 90, leaf: 0.045, colour: "#a3ae94" },
  kentia: { pot: 0.45, trunk: 0.5, crown: [0.6, 0.6, 0.6], leaves: 0, leaf: 0 },
  monstera: { pot: 0.4, trunk: 0.15, crown: [0.45, 0.35, 0.45], leaves: 26, leaf: 0.12 },
  fern: { pot: 0.35, trunk: 0.1, crown: [0.4, 0.25, 0.4], leaves: 70, leaf: 0.05, colour: "#6f8f4e" },
  blossom: { pot: 0.5, trunk: 1.4, crown: [0.6, 0.45, 0.6], leaves: 120, leaf: 0.04 },
};

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

function plant(p: Values, rand: () => number): Piece {
  const s = SPECIES[str(p.species, "olive")] ?? (SPECIES.olive as NonNullable<(typeof SPECIES)[string]>);
  const potH = s.pot * 0.9;
  const parts: Part[] = [
    cyl("ceramic", 0, 0, 0, s.pot / 2, potH),
    cyl("black", 0, potH - 0.02, 0, s.pot / 2 - 0.02, 0.02),
  ];
  const top = potH + s.trunk;
  if (s.trunk > 0.2) parts.push(cyl("wood", 0, potH, 0, 0.03, s.trunk));
  const [rx, ry, rz] = s.crown;
  if (str(p.species, "olive") === "kentia") {
    // Palm: long fronds arching out from the crown.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
      const tip: [number, number] = [Math.cos(a) * rx, top + 0.3 + rand() * 0.4];
      parts.push({ ...rod("leaf", [0, top], tip, 0, 0.012), ry: a });
      for (let j = 1; j <= 5; j++) {
        const f = j / 6;
        parts.push({
          ...ball(
            "leaf",
            Math.cos(a) * rx * f,
            top + (tip[1] - top) * f + 0.15 * Math.sin(f * Math.PI),
            Math.sin(a) * rx * f,
            0.09,
          ),
          sy: 0.012,
        });
      }
    }
    return { width: rx * 1.6, depth: rx * 1.6, height: top + 1, blocks: true, parts };
  }
  const blossom = str(p.species, "") === "blossom";
  const cy = top + ry * 0.6;
  for (let i = 0; i < Math.round(s.leaves * share(p)); i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const k = 0.6 + rand() * 0.4;
    const x = Math.cos(a) * Math.sqrt(1 - u * u) * rx * k;
    const z = Math.sin(a) * Math.sqrt(1 - u * u) * rz * k;
    const y = cy + u * ry * k;
    parts.push(
      blossom && i % 3 !== 0
        ? ball("flower", x, y, z, s.leaf, i % 2 ? "#f6c9d6" : "#fbe3ea")
        : { ...ball("leaf", x, y, z, s.leaf, s.colour), sy: s.leaf * 0.45 },
    );
  }
  return { width: rx * 1.6, depth: rz * 1.6, height: cy + ry, blocks: true, parts };
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

function light(p: Values, o: Values, rand: () => number): Piece {
  const kind = str(p.kind, "string");
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
        blocks: false,
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
      // A small floor can washing the wall above it in colour.
      return {
        width: 0.25,
        depth: 0.25,
        height: 0.2,
        blocks: true,
        parts: [
          box("black", 0, 0, 0, 0.2, 0.14, 0.2),
          { prim: "bowl", slot: "beam", x: 0, y: 0.14, z: 0, sx: 0.6, sy: 2.8, sz: 0.6, colour },
        ],
      };
    case "pinSpot":
      // A ceiling can with a narrow beam down onto a table's centrepiece.
      return {
        width: 0.3,
        depth: 0.3,
        height: hang,
        blocks: false,
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
      // Crystal chandelier: tiers of drops around warm bulbs, on a chain from the ceiling.
      const parts: Part[] = [
        cyl("brass", 0, hang + 0.9, 0, 0.008, 1.5),
        cyl("brass", 0, hang + 0.55, 0, 0.05, 0.35),
      ];
      [0.42, 0.3, 0.18].forEach((r, t) => {
        const y = hang + 0.2 + t * 0.2;
        const n = Math.round(r * 40);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          parts.push(ball("glass", Math.cos(a) * r, y - 0.08, Math.sin(a) * r, 0.025));
          if (i % 3 === 0)
            parts.push(ball("bulb", Math.cos(a) * r * 0.85, y + 0.04, Math.sin(a) * r * 0.85, 0.022));
        }
      });
      return { width: 1, depth: 1, height: hang + 1, blocks: false, parts };
    }
    case "disco": {
      const parts: Part[] = [cyl("black", 0, hang + 0.25, 0, 0.005, 1.5), ball("silver", 0, hang, 0, 0.25)];
      // Glints scattered on the floor around it.
      for (let i = 0; i < 24; i++) {
        const a = rand() * Math.PI * 2;
        const d = 1 + rand() * 2.5;
        parts.push({ ...ball("beam", Math.cos(a) * d, 0.01, Math.sin(a) * d, 0.06, "#ffffff"), sy: 0.005 });
      }
      return { width: 0.6, depth: 0.6, height: hang + 0.3, blocks: false, parts };
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
        parts.push({
          prim: "cone",
          slot: "beam",
          x,
          y: 2.0,
          z: 0,
          sx: 0.6,
          sy: 2.0,
          sz: 0.6,
          rx: Math.PI * 0.75,
          colour: c,
        });
      });
      return { width: 1.3, depth: 0.7, height: 2.2, blocks: true, parts };
    }
    default: {
      // Monogram projection: the couple's initials in light on the dance floor.
      const text = str(o.text, str(p.text, "A & B")).slice(0, 24);
      return {
        width: 2.4,
        depth: 1.4,
        height: 0.02,
        blocks: false,
        parts: [],
        text: {
          value: text,
          look: "projection",
          x: 0,
          y: 0.03,
          z: 0,
          w: 2.4,
          h: 1.2,
          tilt: -Math.PI / 2,
          colour: "#fff4e0",
        },
      };
    }
  }
}

function floral(p: Values, o: Values, rand: () => number): Piece {
  const colours = palette(o.palette ?? p.palette);
  switch (str(p.kind, "arch")) {
    case "arch": {
      // A slim metal hoop with flowers clustered up one side and over the top.
      const w = num(o.width, 2.0);
      const h = 2.4;
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
      return { width: w + 0.3, depth: 0.5, height: h, blocks: true, parts };
    }
    case "wall": {
      // Flower wall: a board faced with blooms on a grid (fewer and larger on phones).
      const w = num(o.width, 2.4);
      const h = 2.4;
      const step = p.quality === "low" ? 0.3 : 0.2;
      const parts: Part[] = [box("black", 0, 0, -0.06, w, h, 0.08)];
      for (let y = step / 2; y < h; y += step)
        for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
          const c = colours[Math.floor(rand() * colours.length)];
          // Jittered and varied, so it reads as massed flowers rather than a grid.
          const jx = x + (rand() - 0.5) * step * 0.5;
          const jy = y + (rand() - 0.5) * step * 0.5;
          const r = step * (0.45 + rand() * 0.2);
          parts.push(
            rand() < 0.2
              ? { ...ball("leaf", jx, jy, 0, r * 1.2), sz: step * 0.3 }
              : ball("flower", jx, jy, 0, r, c),
          );
        }
      return { width: w, depth: 0.35, height: h, blocks: true, parts };
    }
    case "pedestal":
      return {
        width: 0.6,
        depth: 0.6,
        height: 1.5,
        blocks: true,
        parts: [
          cyl("ceramic", 0, 0, 0, 0.18, 1.0),
          cyl("ceramic", 0, 1.0, 0, 0.22, 0.04),
          ...cloud(0, 1.25, 0, 0.32, 0.25, 0.32, Math.round(70 * share(p)), colours, rand),
        ],
      };
    default: {
      // Hanging installation: a cloud of flowers and greenery above a table or the dance floor.
      const hang = num(o.hang, 2.6);
      const w = num(o.width, 2.0);
      const parts: Part[] = [
        cyl("black", -w / 3, hang + 0.3, 0, 0.004, 1.5),
        cyl("black", w / 3, hang + 0.3, 0, 0.004, 1.5),
        ...cloud(0, hang + 0.25, 0, w / 2, 0.25, 0.45, Math.round(w * 55 * share(p)), colours, rand, 0.45),
      ];
      return { width: w, depth: 1, height: hang + 0.5, blocks: false, parts };
    }
  }
}

function sign(p: Values, o: Values): Piece {
  const kind = str(p.kind, "welcome");
  if (kind === "neon") {
    const text = str(o.text, "Better together").slice(0, 24);
    const colour = LIGHT_COLOURS[str(o.colour, "blush")] ?? "#ff9fb2";
    const hang = num(o.hang, 1.6);
    return {
      width: 1.2,
      depth: 0.15,
      height: hang + 0.5,
      blocks: false,
      parts: [box("glass", 0, hang - 0.25, 0, 1.2, 0.5, 0.01)],
      text: { value: text, look: "neon", x: 0, y: hang, z: 0.012, w: 1.15, h: 0.45, tilt: 0, colour },
    };
  }
  // Welcome sign or seating chart on a wooden easel.
  const chart = kind === "chart";
  const w = chart ? 0.9 : 0.6;
  const h = chart ? 1.2 : 0.8;
  const text = str(o.text, chart ? "Find your seat" : "Welcome").slice(0, 32);
  const lean = 0.18;
  const parts: Part[] = [
    rod("wood", [-0.3, 0], [-0.2, 1.7], 0.05, 0.015),
    rod("wood", [0.3, 0], [0.2, 1.7], 0.05, 0.015),
    rod("wood", [0, 0], [0, 1.6], -0.35, 0.012),
    box("wood", 0, 0.62, 0.08, w + 0.08, 0.03, 0.06),
    { ...box("paper", 0, 0.65, 0.06, w, h, 0.012), rx: -lean },
  ];
  return {
    width: Math.max(0.7, w + 0.1),
    depth: 0.6,
    height: 1.75,
    blocks: true,
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

function event(p: Values, o: Values, rand: () => number): Piece {
  switch (str(p.kind, "stage")) {
    case "stage": {
      const w = num(o.width, 3);
      const d = num(o.depth, 2);
      const h = num(o.height, 0.4);
      return {
        width: w,
        depth: d,
        height: h,
        blocks: true,
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
      return { width: 2.2, depth: 2.2, height: 2.25, blocks: true, parts };
    }
    case "station": {
      // Food or dessert station: a draped counter with trays, domes or tiered stands.
      const w = num(o.width, 2.4);
      const sweets = str(p.food, "food") === "dessert";
      const parts: Part[] = [box("fabric", 0, 0, 0, w, 0.9, 0.75, "#f2ece0")];
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
      return { width: w, depth: 0.75, height: 1.2, blocks: true, parts };
    }
    case "bar": {
      // Portable bar module: white front, dark top, back shelf with bottles.
      const w = num(o.width, 2);
      const parts: Part[] = [
        box("ceramic", 0, 0, 0, w, 1.05, 0.6),
        box("black", 0, 1.05, 0, w + 0.05, 0.04, 0.65),
      ];
      for (let i = 0; i < Math.round(w * 6); i++)
        parts.push(cyl("glass", -w / 2 + 0.1 + i * 0.16, 1.09, -0.15, 0.035, 0.28));
      return { width: w + 0.05, depth: 0.65, height: 1.37, blocks: true, parts };
    }
    case "cake": {
      // Cake table: a round draped table with a three-tier cake.
      const parts: Part[] = [cyl("fabric", 0, 0, 0, 0.45, 0.76, "#f4efe4")];
      [0.16, 0.12, 0.08].forEach((r, i) => parts.push(cyl("ceramic", 0, 0.76 + i * 0.12, 0, r, 0.12)));
      parts.push(cyl("ceramic", 0, 0.76, 0, 0.2, 0.01));
      return { width: 0.95, depth: 0.95, height: 1.12, blocks: true, parts };
    }
    default: {
      // Gift and card table: a draped table with a card box and a few wrapped gifts.
      const parts: Part[] = [
        box("fabric", 0, 0, 0, 1.5, 0.76, 0.6, "#f4efe4"),
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
      return { width: 1.5, depth: 0.6, height: 1.05, blocks: true, parts };
    }
  }
}

const PIECES: Record<string, (p: Values, o: Values, rand: () => number) => Piece> = {
  plant: (p, _o, rand) => plant(p, rand),
  light,
  floralPiece: floral,
  sign: (p, o) => sign(p, o),
  eventPiece: event,
};

/** Generators that make a library piece (keys of the catalogue's `model.generator`). */
export const PIECE_GENERATORS: readonly string[] = Object.keys(PIECES);

/**
 * One library piece from its generator, the entry's fixed params and the item's options. The
 * seed keeps a plant's leaves or a wall's flowers the same every time it is drawn.
 */
export function makePiece(generator: string, params: Values, options: Values, seed = 1): Piece {
  const key = `${generator}|${seed}|${JSON.stringify(params)}|${JSON.stringify(options)}`;
  let piece = made.get(key);
  if (!piece) {
    const gen = PIECES[generator];
    if (!gen) throw new Error(`Unknown piece generator ${generator}`);
    piece = gen(params, options, seededRandom(seed));
    // Shapes are asked for often (placement, checks, counts); a piece is the same every time.
    if (made.size > 500) made.clear();
    made.set(key, piece);
  }
  return piece;
}

const made = new Map<string, Piece>();
