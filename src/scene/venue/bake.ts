import * as THREE from "three";
import type { VenueModel } from "../../domain/venue/model";
import type { Materials } from "../materials";
import { type Atlas, buildAtlas, geometryHash } from "./lightmap";
import { barParts, ceilingParts, floorParts, mezzanineParts, railingParts, stairParts } from "./Architecture";
import { backBarParts, furnishingParts } from "./Fixtures";
import { buildWall, splitFacing } from "./walls";

/**
 * The fixed room's baked light (visual stage V2, ADR-2): which surfaces carry the light map, their
 * light-map UVs, and the check that a bake still matches the room.
 */

/**
 * A surface that carries the light map: its name in the export, its material, its full shape, and
 * whether the bake sees it (`baked: false`: it lies on another receiver and takes that one's light).
 */
export type Receiver = {
  name: string;
  material: keyof Materials;
  geometry: THREE.BufferGeometry;
  baked?: false;
};

/**
 * The receivers, uncut and in a fixed order: walls (with their openings' reveals), floors, ceiling,
 * the mezzanine edge, then the fixed furniture (the raised floor's step, the bar's base and well, the
 * back bar's cabinet, counter, frame and shelves, the banquettes, the wine case, the stair's treads,
 * landings and closed sides). Everything movable, and the furniture's metal, glass and trim, stay
 * live-lit.
 */
export function roomReceivers(venue: VenueModel): Receiver[] {
  const t = venue.data.room.wallThickness.value;
  const out: Receiver[] = [];
  // Walls: only the face toward the room (their backs, ends and tops stay live-lit).
  for (const w of venue.data.walls) {
    const g = buildWall(w, venue.ceiling, t, false);
    const inner = (x: THREE.BufferGeometry) => splitFacing(x, w).inner;
    if (g.brick) out.push({ name: `wall-${w.id}-brick`, material: "brick", geometry: inner(g.brick) });
    if (g.redBrick) out.push({ name: `wall-${w.id}-red`, material: "redBrick", geometry: inner(g.redBrick) });
    if (g.panel) out.push({ name: `wall-${w.id}-panel`, material: "greenPanel", geometry: inner(g.panel) });
  }
  const f = floorParts(venue);
  out.push(
    { name: "floor-tile", material: "tile", geometry: f.tile },
    // The joint strips take the tiles' light: baked themselves, each would shade its crossings.
    { name: "floor-joints", material: "tileJoint", geometry: f.joints, baked: false },
    { name: "raised-top", material: "woodFloor", geometry: f.raisedTop },
    { name: "raised-side", material: "beam", geometry: f.raisedSide },
  );
  const c = ceilingParts(venue);
  out.push(
    { name: "ceiling-deck", material: "ceiling", geometry: c.planks },
    { name: "ceiling-beams", material: "beam", geometry: c.beams },
  );
  const z = mezzanineParts(venue);
  out.push(
    { name: "mezzanine-fascia", material: "greenPanel", geometry: z.fascia },
    { name: "mezzanine-soffit", material: "soffit", geometry: z.soffit },
    { name: "mezzanine-floor", material: "woodFloor", geometry: z.floor },
  );
  // The fixed furniture (owner 2026-10-19): its own creases, and the floor's, in the bake.
  const steps = railingParts(venue).steps;
  if (steps) out.push({ name: "raised-step", material: "woodFloor", geometry: steps });
  const bar = barParts(venue, false);
  const back = backBarParts(venue);
  const furn = furnishingParts(venue);
  const stair = stairParts(venue, false);
  out.push(
    { name: "bar-base", material: "barBase", geometry: bar.base },
    { name: "bar-well", material: "barBase", geometry: bar.wellBase },
    { name: "back-counter", material: "barBase", geometry: back.counter },
    { name: "back-cabinet", material: "backBarWood", geometry: back.cabinet },
    ...(back.frame ? [{ name: "back-frame", material: "backBarWood" as const, geometry: back.frame }] : []),
    ...(furn.seats ? [{ name: "banquette-seats", material: "leather" as const, geometry: furn.seats }] : []),
    ...(furn.backs ? [{ name: "banquette-backs", material: "leather" as const, geometry: furn.backs }] : []),
    { name: "wine-case", material: "wineFrame", geometry: furn.wine },
    { name: "stair-wood", material: "stairWood", geometry: stair.wood },
    { name: "stair-sides", material: "stairWall", geometry: stair.base },
  );
  return out;
}

/**
 * Average colour of each receiver material (its texture's mean times its tint), for the bake's
 * bounced light. Recomputed by hand when a surface's texture or tint changes.
 */
export const ALBEDO: Partial<Record<keyof Materials, string>> = {
  brick: "#9d8367",
  redBrick: "#70301d",
  tile: "#262623",
  tileJoint: "#857a6a",
  woodFloor: "#433225",
  beam: "#602b07",
  ceiling: "#7a5230",
  greenPanel: "#28352e",
  soffit: "#262b28",
  barBase: "#18191a",
  backBarWood: "#3a2b21",
  leather: "#2a2b2d",
  wineFrame: "#5c1717",
  stairWood: "#602b07",
  stairWall: "#262b28",
};

/** FNV-1a of the venue data the bake script reads for its lights and sky. */
export function bakeInputsHash(venue: VenueModel): string {
  const d = venue.data;
  const text = JSON.stringify([
    d.room,
    d.walls,
    d.backBar.rect,
    d.fixtures.chandeliers,
    d.fixtures.pendantRows,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The atlas and the fingerprint of the surfaces it was made from. */
export function roomAtlas(venue: VenueModel): { atlas: Atlas; hash: string } {
  const geos = roomReceivers(venue).map((r) => r.geometry);
  // Nobody sees anything facing up at the ceiling (the deck, the beams' tops) or the underside of a floor.
  const hidden = (n: THREE.Vector3, p: THREE.Vector3) =>
    (n.y > 0.9 && p.y > venue.ceiling - 0.01) || (n.y < -0.9 && p.y < 0.01);
  return { atlas: buildAtlas(geos, hidden), hash: geometryHash(geos) };
}

/** The light-map sets the app knows, in the order they load. */
export const BAKE_SETS = ["evening", "day"] as const;
export type BakeSet = (typeof BAKE_SETS)[number];

/** `data/bake/manifest.json`, written by `npm run bake`. */
export type BakeManifest = {
  geometryHash: string;
  inputsHash: string;
  scriptHash: string;
  samples: number;
  /** The contact occlusion map, shared by both sets (grey, linear, 1K). */
  occlusion: string;
  sets: Record<BakeSet, { scale: number; files: { "2k": string; "1k": string } }>;
};

/** The surfaces' light-map UVs when the bake in `manifest` was made from this room, else null. */
export function bakeAtlas(
  venue: VenueModel,
  manifest: { geometryHash: string; inputsHash: string },
): Atlas | null {
  const { atlas, hash } = roomAtlas(venue);
  return hash === manifest.geometryHash && bakeInputsHash(venue) === manifest.inputsHash ? atlas : null;
}

/**
 * Share of the live ambient (sky) light a baked surface keeps: just enough that faces the bake leaves
 * dark (a cut wall's outer face, seen from the dollhouse) are not black, without flattening the
 * bake's own falloff (V2b).
 */
const BAKED_AMBIENT = 0.08;
/**
 * Share of the live lights' direct light a baked surface keeps (V2b): live shadows and the couple's
 * placed lights show on the floor and walls, and the graphics tiers' shadows show there too.
 */
const LIVE_SHARE = 0.25;

/**
 * A receiver's material with the light map: its diffuse light comes mostly from the map, with
 * `LIVE_SHARE` of the live lights' and `BAKED_AMBIENT` of the sky's; live highlights and reflections
 * stay. The baked contact occlusion (`occlusion`, also in the map) dims what the map does not hold
 * (the live lights, highlights and reflections), so a glossy floor stays dark where it meets a wall, the
 * bar or the raised floor (owner 2026-10-19). Any shader patch the source has (`vary`) is kept.
 */
export function bakedMaterial(
  src: THREE.MeshStandardMaterial,
  lightMap: THREE.Texture,
  occlusion: THREE.Texture,
): THREE.MeshStandardMaterial {
  const b = src.clone();
  b.lightMap = lightMap;
  b.lightMap.channel = 1;
  // Sampled by the patch below; three's own ambient occlusion is off (the map already holds it).
  b.aoMap = occlusion;
  b.aoMapIntensity = 0;
  const key = src.customProgramCacheKey();
  b.customProgramCacheKey = () => `${key}|baked`;
  // Any shader patch the source has, without its floor darkening (`grounded`): the bake has it.
  const patch = (src.userData.ungrounded as typeof src.onBeforeCompile | undefined) ?? src.onBeforeCompile;
  b.onBeforeCompile = (s, r) => {
    patch.call(src, s, r);
    s.fragmentShader = s.fragmentShader.replace(
      "#include <lights_fragment_maps>",
      `float bakedAO = texture2D(aoMap, vAoMapUv).r;
irradiance *= ${BAKED_AMBIENT.toFixed(2)} * bakedAO;
reflectedLight.directDiffuse *= ${LIVE_SHARE.toFixed(2)} * bakedAO;
reflectedLight.directSpecular *= bakedAO;
#include <lights_fragment_maps>
iblIrradiance = vec3(0.0);
#if defined( RE_IndirectSpecular )
radiance *= bakedAO;
#endif`,
    );
  };
  return b;
}
