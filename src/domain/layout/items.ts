import { CHAIR_ZONE, rectTable, roundTable } from "../library/sizing";
import { type Catalog, entry, resolveOptions } from "../library/catalog";
import type { LibraryEntry } from "../library/schema";
import type { TableStyle } from "../scenario/schema";
import { type Polygon, type Vec2, centredRect, circle, transform } from "../geometry";

export type ItemOptions = Record<string, number | string | boolean>;

export type Item = {
  id: string;
  libraryId: string;
  x: number;
  z: number;
  rotY: number;
  options: ItemOptions;
  /** Table number or short name shown in plan view and export. */
  label?: string;
  /** Per-table décor override (DEC-05). */
  style?: Partial<TableStyle>;
};

export type Chair = { x: number; z: number; rotY: number };

/** Resolved shape of an item, in its local frame (centred on the origin, before rotation). */
export type Shape =
  | {
      kind: "rectTable";
      length: number;
      width: number;
      height: number;
      seats: number;
      chairs: Chair[];
      farm: boolean;
    }
  | { kind: "roundTable"; diameter: number; height: number; seats: number; chairs: Chair[] }
  | { kind: "cocktail"; diameter: number; height: number }
  | { kind: "danceFloor"; width: number; depth: number; finish: string }
  | { kind: "djBooth"; width: number; depth: number; height: number }
  /** Fabric panels on a free-standing frame (LIB-03 drapery), e.g. behind the sweetheart table. */
  | { kind: "backdrop"; width: number; height: number; colour: string };

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown) => v === true;

function sideChairs(length: number, count: number, z: number, rotY: number): Chair[] {
  const pitch = length / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => ({ x: -length / 2 + pitch * (i + 0.5), z, rotY }));
}

function rectChairs(length: number, width: number, seats: number, ends: boolean): Chair[] {
  const chairs: Chair[] = [];
  const endSeats = ends ? Math.min(2, seats) : 0;
  const side = seats - endSeats;
  const north = Math.ceil(side / 2);
  const south = side - north;
  const off = width / 2 + 0.32;
  // Chairs face local +z at rotY 0 (front direction = (sin rotY, cos rotY)).
  chairs.push(...sideChairs(length, north, -off, 0), ...sideChairs(length, south, off, Math.PI));
  if (endSeats >= 1) chairs.push({ x: -length / 2 - 0.32, z: 0, rotY: Math.PI / 2 });
  if (endSeats >= 2) chairs.push({ x: length / 2 + 0.32, z: 0, rotY: -Math.PI / 2 });
  return chairs;
}

function roundChairs(diameter: number, seats: number): Chair[] {
  const r = diameter / 2 + 0.3;
  return Array.from({ length: seats }, (_, i) => {
    const a = (i / seats) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Face the centre: chair front points from (x,z) toward (0,0).
    return { x, z, rotY: Math.atan2(-x, -z) };
  });
}

type Params = Record<string, number | string | boolean>;

/**
 * Shape generators, keyed by `model.generator` in the library data (LIB-12). A new item is a
 * catalogue entry that names one of these with its own `sizeM`, `params` and options; sizes come
 * from the data, never from the item id.
 */
const generators: Record<string, (e: LibraryEntry, o: Record<string, unknown>, p: Params) => Shape> = {
  rectTable(e, o, p) {
    const height = e.sizeM.h;
    const farm = p.finish === "wood";
    // Fixed-size tables (no seat option) take their size from sizeM; the rest are sized per seat.
    if (!e.options.some((opt) => opt.key === "seats")) {
      const seats = num(p.seats, 2);
      const length = e.sizeM.w;
      const width = e.sizeM.d;
      const chairs = p.oneSide
        ? sideChairs(length, seats, -(width / 2 + 0.32), 0)
        : rectChairs(length, width, seats, false);
      return { kind: "rectTable", length, width, height, seats, chairs, farm };
    }
    const seats = num(o.seats, 8);
    const t = rectTable(seats, bool(o.ends));
    const width = num(p.width, t.width);
    return {
      kind: "rectTable",
      length: t.length,
      width,
      height,
      seats,
      chairs: rectChairs(t.length, width, seats, t.ends),
      farm,
    };
  },
  roundTable(e, o) {
    const seats = num(o.seats, 8);
    const t = roundTable(seats);
    return {
      kind: "roundTable",
      diameter: t.diameter,
      height: e.sizeM.h,
      seats,
      chairs: roundChairs(t.diameter, seats),
    };
  },
  cocktail: (e) => ({ kind: "cocktail", diameter: e.sizeM.w, height: e.sizeM.h }),
  danceFloor: (e, o) => ({
    kind: "danceFloor",
    width: num(o.width, e.sizeM.w),
    depth: num(o.depth, e.sizeM.d),
    finish: String(o.finish ?? "wood"),
  }),
  djBooth: (e) => ({ kind: "djBooth", width: e.sizeM.w, depth: e.sizeM.d, height: e.sizeM.h }),
  backdrop: (e, o) => ({
    kind: "backdrop",
    width: num(o.width, e.sizeM.w),
    height: e.sizeM.h,
    colour: String(o.colour ?? "#f2ece0"),
  }),
};

/** Generators that produce a floor item; other entries (chairs, linens) are parts or materials. */
export const FLOOR_GENERATORS: readonly string[] = Object.keys(generators);

export function shapeOf(item: Item, catalog: Catalog): Shape {
  const e = entry(catalog, item.libraryId);
  if (e.model.kind !== "parametric") throw new Error(`${e.id}: GLB items have no parametric shape yet`);
  const gen = generators[e.model.generator];
  if (!gen) throw new Error(`${e.id}: unknown generator ${e.model.generator}`);
  return gen(e, resolveOptions(e, item.options), e.model.params);
}

export function seatsOf(shape: Shape): number {
  return shape.kind === "rectTable" || shape.kind === "roundTable" ? shape.seats : 0;
}

/** Local footprint used for collisions: table plus the chair zone around it. */
export function localFootprint(shape: Shape): Polygon {
  switch (shape.kind) {
    case "rectTable": {
      const hasEnds = shape.chairs.some((c) => Math.abs(c.z) < 1e-6);
      const north = shape.chairs.some((c) => c.z < -1e-6);
      const south = shape.chairs.some((c) => c.z > 1e-6);
      const x0 = -shape.length / 2 - (hasEnds ? CHAIR_ZONE : 0);
      const x1 = shape.length / 2 + (hasEnds ? CHAIR_ZONE : 0);
      const z0 = -shape.width / 2 - (north ? CHAIR_ZONE : 0);
      const z1 = shape.width / 2 + (south ? CHAIR_ZONE : 0);
      return [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ];
    }
    case "roundTable":
      return circle(shape.diameter / 2 + CHAIR_ZONE, 20);
    case "cocktail":
      return circle(shape.diameter / 2 + 0.1, 12);
    case "danceFloor":
      return centredRect(shape.width, shape.depth);
    case "djBooth":
      return centredRect(shape.width + 0.2, shape.depth + 0.9);
    case "backdrop":
      return centredRect(shape.width + 0.1, 0.4);
  }
}

export function footprint(item: Item, catalog: Catalog): Polygon {
  return transform(localFootprint(shapeOf(item, catalog)), item.x, item.z, item.rotY);
}

export function chairsWorld(item: Item, shape: Shape): Chair[] {
  if (shape.kind !== "rectTable" && shape.kind !== "roundTable") return [];
  const c = Math.cos(item.rotY);
  const s = Math.sin(item.rotY);
  return shape.chairs.map((ch) => {
    const p: Vec2 = [ch.x * c + ch.z * s, -ch.x * s + ch.z * c];
    return { x: item.x + p[0], z: item.z + p[1], rotY: ch.rotY + item.rotY };
  });
}

export function isTable(item: Item, catalog: Catalog): boolean {
  return catalog.get(item.libraryId)?.family === "table";
}
