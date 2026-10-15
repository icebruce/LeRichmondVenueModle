import { type Polygon, type Vec2, rect } from "../geometry";
import { type VenueData, type WallData, venueSchema } from "./schema";

export type Level = "main" | "raised" | "mezzanine";

/** A fixed thing furniture may not overlap, with the name used in refusal messages. */
export type Obstacle = { id: string; label: string; polygon: Polygon };

export type VenueModel = {
  data: VenueData;
  width: number;
  depth: number;
  ceiling: number;
  room: Polygon;
  raised: { outline: Polygon; height: number };
  mezzanineHeight: number;
  obstacles: Obstacle[];
};

export function parseVenue(json: unknown): VenueData {
  return venueSchema.parse(json);
}

/** Unit direction and inward normal of a wall. Walls are listed with the room on their left. */
export function wallFrame(wall: WallData): { dir: Vec2; normal: Vec2; length: number } {
  const dx = wall.to[0] - wall.from[0];
  const dz = wall.to[1] - wall.from[1];
  const length = Math.hypot(dx, dz);
  const dir: Vec2 = [dx / length, dz / length];
  return { dir, normal: [-dir[1], dir[0]], length };
}

/** Point at distance `s` along a wall, offset `inset` into the room. */
export function alongWall(wall: WallData, s: number, inset = 0): Vec2 {
  const { dir, normal } = wallFrame(wall);
  return [wall.from[0] + dir[0] * s + normal[0] * inset, wall.from[1] + dir[1] * s + normal[1] * inset];
}

function barObstacles(d: VenueData): Obstacle[] {
  const [x0, z0, x1, z1] = d.bar.outer.value;
  const leg = d.bar.legWidth;
  const front = d.bar.frontDepth;
  return [
    { id: "bar-west", label: "the bar", polygon: rect(x0, z0, x0 + leg, z1) },
    { id: "bar-east", label: "the bar", polygon: rect(x1 - leg, z0, x1, z1) },
    { id: "bar-south", label: "the bar", polygon: rect(x0, z1 - front, x1, z1) },
    // The bartenders' well inside the U is not guest floor.
    {
      id: "bar-well",
      label: "the bar",
      polygon: rect(x0 + leg, d.backBar.rearCounter[3], x1 - leg, z1 - front),
    },
  ];
}

export function buildVenue(d: VenueData): VenueModel {
  const width = d.room.width.value;
  const depth = d.room.depth.value;
  const [bx0, bz0, bx1, bz1] = d.backBar.rect.value;
  const rc = d.backBar.rearCounter;
  const [lx0, lz0, lx1, lz1] = d.stair.landing;
  const fl = d.stair.flight;
  const [ux0, uz0, ux1, uz1] = d.stair.upperLanding;
  const [wx0, wz0, wx1, wz1] = d.fixtures.wineWall.rect;

  const obstacles: Obstacle[] = [
    ...barObstacles(d),
    { id: "back-bar", label: "the back bar", polygon: rect(bx0, bz0, bx1, Math.max(bz1, rc[3])) },
    { id: "stair-landing", label: "the stair landing", polygon: rect(lx0, lz0, lx1, lz1) },
    {
      id: "stair",
      label: "the stair",
      polygon: rect(
        Math.min(fl.from[0], fl.to[0]),
        Math.min(fl.from[1], fl.to[1]),
        Math.max(fl.from[0], fl.to[0]),
        Math.max(fl.from[1], fl.to[1]),
      ),
    },
    { id: "stair-upper", label: "the stair", polygon: rect(ux0, uz0, ux1, uz1) },
    { id: "wine-wall", label: "the wine wall", polygon: rect(wx0, wz0, wx1, wz1) },
    ...d.fixtures.banquettes
      .filter((b) => !b.disabled && b.x0 !== undefined && b.x1 !== undefined)
      .map((b, i) => ({
        id: `banquette-${i}`,
        label: "the banquette",
        polygon: rect(b.x0 as number, 0, b.x1 as number, b.depth),
      })),
  ];

  return {
    data: d,
    width,
    depth,
    ceiling: d.room.ceiling.value,
    room: rect(0, 0, width, depth),
    raised: { outline: d.levels.raised.outline.value, height: d.levels.raised.height.value },
    mezzanineHeight: d.mezzanine.floorHeight.value,
    obstacles,
  };
}
