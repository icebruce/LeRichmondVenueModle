import { CHAIR_ZONE, rectTable, roundTable } from "../library/sizing";
import { type Catalog, entry, resolveOptions } from "../library/catalog";
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
  | { kind: "djBooth"; width: number; depth: number; height: number };

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown) => v === true;

function rectChairs(length: number, width: number, seats: number, ends: boolean): Chair[] {
  const chairs: Chair[] = [];
  const endSeats = ends ? Math.min(2, seats) : 0;
  const side = seats - endSeats;
  const north = Math.ceil(side / 2);
  const south = side - north;
  const off = width / 2 + 0.32;
  const place = (count: number, z: number, rotY: number) => {
    const pitch = length / Math.max(count, 1);
    for (let i = 0; i < count; i++) chairs.push({ x: -length / 2 + pitch * (i + 0.5), z, rotY });
  };
  // Chairs face local +z at rotY 0 (front direction = (sin rotY, cos rotY)).
  place(north, -off, 0);
  place(south, off, Math.PI);
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

export function shapeOf(item: Item, catalog: Catalog): Shape {
  const e = entry(catalog, item.libraryId);
  const o = resolveOptions(e, item.options);
  switch (item.libraryId) {
    case "table-rect":
    case "table-farm": {
      const seats = num(o.seats, 8);
      const t = rectTable(seats, bool(o.ends));
      const farm = item.libraryId === "table-farm";
      const width = farm ? 1.0 : t.width;
      return {
        kind: "rectTable",
        length: t.length,
        width,
        height: 0.75,
        seats,
        chairs: rectChairs(t.length, width, seats, t.ends),
        farm,
      };
    }
    case "table-sweetheart": {
      const length = 1.6;
      const width = 0.75;
      // Couple sits on one side, facing the room (local +z is the room side).
      const chairs = [-0.4, 0.4].map((x) => ({ x, z: -(width / 2 + 0.32), rotY: 0 }));
      return { kind: "rectTable", length, width, height: 0.75, seats: 2, chairs, farm: false };
    }
    case "table-round": {
      const seats = num(o.seats, 8);
      const t = roundTable(seats);
      return {
        kind: "roundTable",
        diameter: t.diameter,
        height: 0.75,
        seats,
        chairs: roundChairs(t.diameter, seats),
      };
    }
    case "table-cocktail":
      return { kind: "cocktail", diameter: 0.75, height: 1.1 };
    case "dance-floor":
      return {
        kind: "danceFloor",
        width: num(o.width, 6),
        depth: num(o.depth, 3.6),
        finish: String(o.finish ?? "wood"),
      };
    case "dj-booth":
      return { kind: "djBooth", width: 1.8, depth: 0.8, height: 1.05 };
    default:
      throw new Error(`No shape for ${item.libraryId}`);
  }
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

export function isTable(item: Item): boolean {
  return item.libraryId.startsWith("table-");
}
