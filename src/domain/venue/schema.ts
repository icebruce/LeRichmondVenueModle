import { z } from "zod";

const confidence = z.enum(["H", "M", "L"]);
const estimate = z.object({
  value: z.number(),
  min: z.number(),
  max: z.number(),
  confidence,
  sources: z.array(z.string()),
});
const vec2 = z.tuple([z.number(), z.number()]);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const rect4 = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const opening = z.object({
  id: z.string(),
  kind: z.enum(["garageDoor", "tallWindow", "door", "opening", "pass"]),
  start: z.number(),
  end: z.number(),
  sill: z.number(),
  head: z.number(),
});
const panel = z.object({
  start: z.number(),
  end: z.number(),
  finish: z.enum(["greenPanel"]),
  height: z.number(),
  from: z.number().optional(),
});
const wall = z.object({
  id: z.enum(["north", "west", "east", "south"]),
  from: vec2,
  to: vec2,
  finish: z.enum(["brick"]),
  height: z.number().optional(),
  /** Height of a red brick band at the base of the wall, where the photos show one. */
  dado: z.number().optional(),
  openings: z.array(opening),
  panels: z.array(panel).optional(),
  confidence,
  sources: z.array(z.string()),
});
const spot = z.object({
  x: z.number(),
  z: z.number(),
  rotY: z.number(),
  level: z.enum(["main", "raised", "mezzanine"]),
  label: z.string(),
});
const camera = z.object({
  position: vec3,
  target: vec3,
  fov: z.number(),
  reference: z.string().optional(),
});

export const venueSchema = z.object({
  schemaVersion: z.literal(1),
  room: z.object({ width: estimate, depth: estimate, ceiling: estimate, wallThickness: estimate }),
  levels: z.object({
    raised: z.object({
      height: estimate,
      outline: z.object({ value: z.array(vec2), confidence, sources: z.array(z.string()) }),
      steps: z.object({
        value: z.array(z.object({ from: vec2, to: vec2 })),
        confidence,
        sources: z.array(z.string()),
      }),
    }),
  }),
  walls: z.array(wall).length(4),
  bar: z.object({
    outer: z.object({ value: rect4, confidence, sources: z.array(z.string()) }),
    legWidth: z.number(),
    frontDepth: z.number(),
    counterHeight: estimate,
    openSide: z.literal("north"),
  }),
  backBar: z.object({
    rect: z.object({ value: rect4, confidence, sources: z.array(z.string()) }),
    height: z.number(),
    canopyHeight: z.number(),
    rearCounter: rect4,
  }),
  mezzanine: z.object({
    edgeZ: z.number(),
    xFrom: z.number(),
    xTo: z.number(),
    depth: z.number(),
    /** Height of the dark fascia band along the mezzanine edge. */
    fasciaDepth: z.number(),
    floorHeight: estimate,
    confidence,
    sources: z.array(z.string()),
  }),
  stair: z.object({
    landing: rect4,
    /** Lower flight from the entrance landing east to the east-wall landing, rising `rise`. */
    flight: z.object({ from: vec2, to: vec2, rise: z.number(), treads: z.number().int().positive() }),
    /** Turn landing against the east wall, at the lower flight's top. */
    upperLanding: rect4,
    /** Second flight back west from the turn landing up to the mezzanine floor. */
    upperFlight: z.object({ from: vec2, to: vec2, treads: z.number().int().positive() }),
    /** Head of the second flight at mezzanine height, joining the mezzanine edge. */
    topLanding: rect4,
    confidence,
    sources: z.array(z.string()),
  }),
  spots: z.record(z.string(), spot),
  fixtures: z.object({
    banquettes: z.array(
      z.object({
        x0: z.number().optional(),
        x1: z.number().optional(),
        z: z.number().optional(),
        wall: z.string().optional(),
        z0: z.number().optional(),
        z1: z.number().optional(),
        x: z.number().optional(),
        depth: z.number(),
        backHeight: z.number(),
        disabled: z.boolean().optional(),
      }),
    ),
    paintings: z.array(
      z.object({
        id: z.string(),
        /** How the couple refers to it ("Horseman painting"). */
        label: z.string(),
        wall: z.literal("north"),
        x0: z.number(),
        x1: z.number(),
        y0: z.number(),
        y1: z.number(),
        palette: z.array(z.string()).min(3),
      }),
    ),
    wineWall: z.object({ rect: rect4, height: z.number() }),
    chandeliers: z.array(
      z.object({
        kind: z.enum(["brassCluster", "birdcage"]),
        x: z.number(),
        z: z.number(),
        bottom: z.number(),
        top: z.number().optional(),
        height: z.number().optional(),
        radius: z.number(),
      }),
    ),
    pendantRows: z.array(
      z.object({
        z: z.number(),
        x0: z.number(),
        x1: z.number(),
        count: z.number().int(),
        height: z.number(),
      }),
    ),
    timberBeams: z.object({
      axis: z.literal("z"),
      positions: z.array(z.number()),
      width: z.number(),
      depth: z.number(),
    }),
    steelGirders: z.object({
      axis: z.literal("x"),
      positions: z.array(z.number()),
      width: z.number(),
      depth: z.number(),
    }),
    /** Round ducts along x under the deck: z positions, radius and drop below the ceiling. */
    ducts: z.object({ positions: z.array(z.number()), radius: z.number(), drop: z.number() }),
    skylight: z.object({ x: z.number(), z: z.number(), size: z.number() }),
    venueFurniture: z.object({
      barStools: z.object({ count: z.number().int() }),
    }),
  }),
  cameraPresets: z.record(z.string(), camera),
});

export type VenueData = z.infer<typeof venueSchema>;
export type WallData = VenueData["walls"][number];
export type OpeningData = WallData["openings"][number];
export type CameraPreset = z.infer<typeof camera>;
export type Spot = z.infer<typeof spot>;
