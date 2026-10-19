import * as THREE from "three";
import { useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  antiqueMirrorTexture,
  backBarAtlas,
  glowTexture,
  marbleTexture,
  nailheadTexture,
  rivetTexture,
  softShadowTexture,
  tuftedTexture,
} from "./textures";
import type { Quality } from "./quality";
import { DANCE_AREA_COLOUR } from "../domain/layout/items";

const base = `${import.meta.env.BASE_URL}assets/`;

/**
 * Room surfaces (visual stage V1): Poly Haven CC0 sets as WebP (`tools/assets/textures.ts`).
 * `sharp`: a 2K colour map for desktops; every other map is 1K.
 */
const TEXTURES = {
  brickDiff: { file: "yellow_brick_diff", sharp: true },
  brickNor: { file: "yellow_brick_nor", sharp: false },
  brickRough: { file: "yellow_brick_rough", sharp: false },
  redBrickDiff: { file: "red_brick_diff", sharp: true },
  redBrickNor: { file: "red_brick_nor", sharp: false },
  tileDiff: { file: "large_floor_tiles_02_diff", sharp: true },
  tileNor: { file: "large_floor_tiles_02_nor", sharp: false },
  tileRough: { file: "large_floor_tiles_02_rough", sharp: false },
  floorDiff: { file: "old_wood_floor_diff", sharp: true },
  floorNor: { file: "old_wood_floor_nor", sharp: false },
  floorRough: { file: "old_wood_floor_rough", sharp: false },
  ceilingDiff: { file: "roof_planks_diff", sharp: false },
  ceilingNor: { file: "roof_planks_nor", sharp: false },
  timberDiff: { file: "wood_floor_worn_diff", sharp: false },
} as const;
type TextureKey = keyof typeof TEXTURES;
const KEYS = Object.keys(TEXTURES) as TextureKey[];

/** The texture files for a device: desktops get the 2K colour maps, phones the 1K set. */
export function textureUrls(quality: Quality): Record<TextureKey, string> {
  return Object.fromEntries(
    KEYS.map((k) => [
      k,
      `${base}textures/${TEXTURES[k].file}_${TEXTURES[k].sharp && quality === "high" ? "2k" : "1k"}.webp`,
    ]),
  ) as Record<TextureKey, string>;
}

/**
 * Physical size in metres that one texture repeat covers (UVs are generated in metres), from the
 * sets' real-world sizes; the floor's tiles are 0.65 m, three to a repeat (R03, R04).
 */
export const TILE = {
  brick: 2,
  redBrick: 1.4,
  tile: 1.95,
  floor: 3,
  ceiling: 1.5,
  timber: 2,
  marble: 1.4,
  rivets: 0.6,
} as const;

function prep(t: THREE.Texture, colour: boolean) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fixed furniture darkens over this height above the floor, to `GROUND_MIN` of its colour at it. */
const GROUND_REACH = 0.35;
const GROUND_MIN = 0.5;

/**
 * Contact darkening for the bar, back bar, counter, banquettes, stair and rails, which the room's
 * baked occlusion does not cover (owner 2026-10-19): the surface darkens toward the floor, as
 * ambient occlusion would, on every tier. Keeps any shader change the material already has.
 */
function grounded<T extends THREE.MeshStandardMaterial>(mat: T): T {
  const prev = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}|ground`;
  mat.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vGroundY;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vec4 groundAt = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
groundAt = instanceMatrix * groundAt;
#endif
vGroundY = (modelMatrix * groundAt).y;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGroundY;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= mix(${GROUND_MIN.toFixed(2)}, 1.0, smoothstep(0.0, ${GROUND_REACH.toFixed(2)}, vGroundY));`,
      );
  };
  return mat;
}

/**
 * Breaks up a repeating surface by world position (V1): `cell` gives each square of that size (m,
 * on the floor plane) its own tone, the way real tiles differ; otherwise soft patches about `size`
 * metres across, like a brick wall's weathering. `amount` is the largest change in brightness.
 */
function vary(
  mat: THREE.MeshStandardMaterial,
  amount: number,
  { cell, size = 1.6 }: { cell?: number; size?: number },
) {
  const key = cell ? `tile${cell}` : `patch${size}`;
  mat.customProgramCacheKey = () => `vary:${key}:${amount}`;
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    const tone = cell
      ? `hash3(floor(vWorld.xz / ${cell.toFixed(3)}).xyy)`
      : `noise3(vWorld / ${size.toFixed(3)})`;
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWorld;
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>\ndiffuseColor.rgb *= 1.0 + ${(amount * 2).toFixed(3)} * (${tone} - 0.5);`,
      );
  };
  return mat;
}

/** Evening glow of the stair's LED treads: saturated enough to stay lime-yellow after tone mapping. */
export const LED_GLOW = 1.0;

/** A contact shadow's plane is this many times the footprint it darkens. */
export const CONTACT_SPREAD = 1.6;
/**
 * The buff brick's tint by day and in the evening (V2b): under the venue's warm light at night it
 * reads orange-brown in R06 and R08, not pale beige.
 */
export const BRICK_TINT = { day: "#f4ebdd", evening: "#f2c49a" } as const;

/** The plinth's shadow plane is this many times its size (`softShadowTexture`). */
export const SHADOW_SPREAD = 1.25;

/**
 * The backdrop gradient, top to bottom (DESIGN_GUIDE §9), and its brightness: authored warmer and
 * brighter than it should read, as tone mapping greys and darkens it on screen.
 */
export const BACKDROP = {
  day: { colors: ["#fff3e2", "#f2e2cc"], intensity: 1.8 },
  evening: { colors: ["#2e2a24", "#211d18"], intensity: 1 },
} as const;

export type Materials = ReturnType<typeof useMaterials>;

export function useMaterials(quality: Quality) {
  const urls = textureUrls(quality);
  const loaded = useLoader(
    THREE.TextureLoader,
    KEYS.map((k) => urls[k]),
  );
  return useMemo(() => {
    // Colour maps are sRGB; normal and roughness maps are data.
    const tex = Object.fromEntries(
      KEYS.map((k, i) => [k, prep(loaded[i] as THREE.Texture, k.endsWith("Diff"))]),
    ) as Record<TextureKey, THREE.Texture>;
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    const marble = marbleTexture();
    const glow = glowTexture();
    const cards = backBarAtlas();
    const mirror = antiqueMirrorTexture();
    return {
      glow,
      brick: vary(
        std({
          map: tex.brickDiff,
          normalMap: tex.brickNor,
          roughnessMap: tex.brickRough,
          color: BRICK_TINT.day,
          roughness: 1,
        }),
        0.12,
        { size: 1.6 },
      ),
      redBrick: vary(
        std({ map: tex.redBrickDiff, normalMap: tex.redBrickNor, color: "#c9806a", roughness: 0.95 }),
        0.1,
        { size: 1.2 },
      ),
      greenPanel: std({ color: "#28352e", roughness: 0.7 }),
      // Each 0.65 m slate tile its own tone (R03, R04).
      tile: vary(
        std({
          map: tex.tileDiff,
          normalMap: tex.tileNor,
          roughnessMap: tex.tileRough,
          color: "#5c5b58",
          roughness: 0.8,
        }),
        0.15,
        { cell: TILE.tile / 3 },
      ),
      // Weathered grey-tan wood strips (R03, R04).
      tileJoint: std({ color: "#6f665a", roughness: 0.8 }),
      woodFloor: std({
        map: tex.floorDiff,
        normalMap: tex.floorNor,
        roughnessMap: tex.floorRough,
        color: "#c9b8a6",
        roughness: 0.7,
      }),
      // Honey pine deck with darker beams (R02).
      ceiling: std({ map: tex.ceilingDiff, normalMap: tex.ceilingNor, color: "#f6e6c2", roughness: 0.85 }),
      timber: grounded(std({ map: tex.timberDiff, color: "#b5874f", roughness: 0.8 })),
      // The same timber on the ceiling beams and the raised floor's sides, which carry the baked
      // light (V2), kept apart from the stair's live-lit timber.
      beam: std({ map: tex.timberDiff, color: "#b5874f", roughness: 0.8 }),
      steel: grounded(std({ color: "#1c1e1f", metalness: 0.55, roughness: 0.55 })),
      girder: std({ map: rivetTexture(), color: "#ffffff", metalness: 0.55, roughness: 0.55 }),
      // The model's presentation (REFERENCE_NOTES §1, Presented): light wall caps and plinth, and
      // the room's soft shadow on the backdrop.
      // Its evening glow (set with the lighting) keeps it the lightest frame of the model.
      cap: std({ color: "#e6dfd3", emissive: "#e6dfd3", emissiveIntensity: 0, roughness: 0.8 }),
      // Soft contact shadows under standing guests (V2, Grounded).
      contact: new THREE.MeshBasicMaterial({
        color: "#000000",
        map: softShadowTexture(CONTACT_SPREAD, 0.3),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      // Contact shadows that follow a footprint's outline (tables, chairs): darkness per vertex.
      footprint: new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        // Flat on the floor and seen from above: one pass (a transparent double side draws twice).
        side: THREE.DoubleSide,
        forceSinglePass: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      groundShadow: new THREE.MeshBasicMaterial({
        map: softShadowTexture(SHADOW_SPREAD),
        transparent: true,
        depthWrite: false,
      }),
      marble: std({ map: marble, roughness: 0.3, metalness: 0 }),
      barBase: grounded(std({ color: "#18191a", roughness: 0.55, metalness: 0.2 })),
      backBarWood: grounded(std({ color: "#3a2b21", roughness: 0.6 })),
      // Backlit bottle shelves read bright in every bar photo (R02, R03, UV01).
      shelfGlow: std({ color: "#3a2a18", emissive: "#ffb46b", emissiveIntensity: 3, roughness: 0.5 }),
      fridge: std({ color: "#c9d7cf", emissive: "#e8f2ea", emissiveIntensity: 0.35, roughness: 0.2 }),
      brass: std({ color: "#b8955f", metalness: 1, roughness: 0.32 }),
      windowFrame: std({ color: "#e4e1d9", roughness: 0.6 }),
      // Lit kitchen seen through the pass: bright, but under the room's highlights (UV02).
      kitchen: std({ color: "#c9cfcc", emissive: "#e9ede6", emissiveIntensity: 0.22, roughness: 0.3 }),
      blackMetal: grounded(std({ color: "#121314", metalness: 0.7, roughness: 0.45 })),
      bulb: std({ color: "#fff3d6", emissive: "#ffcf8a", emissiveIntensity: 1.8, roughness: 0.3 }),
      crystal: new THREE.MeshPhysicalMaterial({
        color: "#fff6e8",
        emissive: "#ffd9a0",
        emissiveIntensity: 0.6,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.85,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: "#a9c0cc",
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        envMapIntensity: 1.5,
      }),
      velvet: grounded(
        new THREE.MeshPhysicalMaterial({
          color: "#8a6a3e",
          roughness: 0.75,
          sheen: 1,
          sheenColor: new THREE.Color("#e2c28a"),
          sheenRoughness: 0.45,
          side: THREE.DoubleSide,
        }),
      ),
      leather: grounded(std({ map: tuftedTexture("#2a2b2d"), color: "#ffffff", roughness: 0.55 })),
      // The back bar's card sheet: backlit bottles and glasses, rack, plants, instruments (V3).
      cards: std({
        map: cards.map,
        emissiveMap: cards.glow,
        emissive: "#ffffff",
        emissiveIntensity: 0.55,
        alphaTest: 0.5,
        // Softer cut-out edges where multisampling is on (High).
        alphaToCoverage: true,
        side: THREE.DoubleSide,
        roughness: 0.4,
      }),
      antiqueMirror: std({
        map: mirror,
        emissiveMap: mirror,
        emissive: "#ffffff",
        emissiveIntensity: 0.18,
        metalness: 0.3,
        roughness: 0.6,
      }),
      // The back bar's canopy, counter and espresso machine: bright stainless, lighter than the
      // black steel (R02, R03). The fridges' dark glass doors are dimly lit inside.
      stainless: grounded(std({ color: "#b9bcbc", metalness: 0.9, roughness: 0.28 })),
      fridgeGlass: std({ color: "#1c2422", emissive: "#9fb5ad", emissiveIntensity: 0.14, roughness: 0.08 }),
      // The bar flowers' white blossom and dark branches (R02, VEN-06).
      blossom: std({ color: "#f3eee6", roughness: 0.85 }),
      branch: std({ color: "#3b2c22", roughness: 0.9 }),
      // The banquettes' nail-head trim: a strip with one brass nail every 5 cm (trim sheet).
      nailTrim: std({ map: nailheadTexture("#2a2b2d"), color: "#ffffff", metalness: 0.4, roughness: 0.45 }),
      // Sheer curtains behind the velvet at the street windows (R10).
      sheer: new THREE.MeshStandardMaterial({
        color: "#f3efe6",
        roughness: 0.9,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      flame: std({ color: "#ffd18a", emissive: "#ffb347", emissiveIntensity: 4 }),
      // Stair tread glow: lime-yellow, across each tread top (R01, R09, R11).
      // Its glow follows the lighting (set in the scene): off in daylight.
      led: std({ color: "#b8b85a", emissive: "#e2e23a", emissiveIntensity: LED_GLOW, roughness: 0.6 }),
      exitSign: std({ color: "#3a0b0b", emissive: "#ff2a2a", emissiveIntensity: 1.6 }),
      wineFrame: grounded(
        std({
          color: "#5c1717",
          roughness: 0.45,
          metalness: 0.2,
          emissive: "#3a0c08",
          emissiveIntensity: 0.4,
        }),
      ),
      darkVoid: std({ color: "#0e0f10", roughness: 1 }),
      // The closed side under the second flight and the turn landing (owner photo 4).
      stairWall: grounded(std({ color: "#262b28", roughness: 0.9 })),
      // The mezzanine's underside, which carries the baked light (V2).
      soffit: std({ color: "#262b28", roughness: 0.9 }),
      // The terrace through the garage doors by day: a bright, slightly green-grey backdrop, unlit
      // (R02, R03; owner 2026-10-19). Dark at night (`darkVoid`).
      terrace: new THREE.MeshBasicMaterial({ color: "#b9c4bf" }),
      street: std({ color: "#5d6266", roughness: 1 }),
      // The dance area is marked, not built (LIB-01): a solid sand line that reads in evening and
      // daylight, and a faint lit tint that darkens with the room instead of glowing.
      // Drawn with the transparent pass, after every floor, whichever floor material sorts first.
      danceLine: new THREE.MeshBasicMaterial({
        color: DANCE_AREA_COLOUR,
        depthWrite: false,
        transparent: true,
      }),
      danceTint: new THREE.MeshStandardMaterial({
        color: DANCE_AREA_COLOUR,
        roughness: 1,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      djFacade: std({ color: "#15161a", roughness: 0.4, metalness: 0.3 }),
    };
  }, [loaded]);
}

/** Box-project UVs in metres from vertex positions and normals (geometry must be in world units). */
export function metreUV<T extends THREE.BufferGeometry>(g: T, tile: number): T {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A box spanning [x0,x1]×[y0,y1]×[z0,z1] in world coordinates with metre UVs. */
export function boxGeo(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile = 1,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return metreUV(g, tile);
}

/** `boxGeo` with rounded edges of radius `r` (m), so its edges catch a thin highlight (V1, Bevelled). */
export function bevelGeo(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r: number,
  tile = 1,
): THREE.BufferGeometry {
  const [w, h, d] = [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)];
  const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return metreUV(g, tile);
}
