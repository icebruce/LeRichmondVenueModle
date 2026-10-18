import * as THREE from "three";
import { useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { glowTexture, marbleTexture, tuftedTexture } from "./textures";
import type { Quality } from "./quality";
import { DANCE_AREA_COLOUR } from "../domain/layout/items";

const base = `${import.meta.env.BASE_URL}assets/`;

/**
 * Room surfaces (visual stage V1): Poly Haven CC0 sets as KTX2 (`tools/assets/textures.ts`),
 * compressed on the GPU too. `sharp`: a 2K colour map for desktops; every other map is 1K.
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
      `${base}textures/${TEXTURES[k].file}_${TEXTURES[k].sharp && quality === "high" ? "2k" : "1k"}.ktx2`,
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
} as const;

function prep(t: THREE.Texture) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
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

export type Materials = ReturnType<typeof useMaterials>;

export function useMaterials(quality: Quality) {
  const gl = useThree((s) => s.gl);
  const urls = textureUrls(quality);
  // The Basis transcoder comes bundled with three's loader.
  const loaded = useLoader(
    KTX2Loader,
    KEYS.map((k) => urls[k]),
    (loader) => loader.detectSupport(gl),
  );
  return useMemo(() => {
    const tex = Object.fromEntries(KEYS.map((k, i) => [k, prep(loaded[i] as THREE.Texture)])) as Record<
      TextureKey,
      THREE.Texture
    >;
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    const marble = marbleTexture();
    const glow = glowTexture();
    return {
      glow,
      brick: vary(
        std({
          map: tex.brickDiff,
          normalMap: tex.brickNor,
          roughnessMap: tex.brickRough,
          color: "#f4ebdd",
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
          color: "#8d8a84",
          roughness: 0.8,
        }),
        0.1,
        { cell: TILE.tile / 3 },
      ),
      tileJoint: std({ color: "#6f5d4a", roughness: 0.7 }),
      woodFloor: std({
        map: tex.floorDiff,
        normalMap: tex.floorNor,
        roughnessMap: tex.floorRough,
        color: "#c9b8a6",
        roughness: 0.7,
      }),
      // Honey pine deck with darker beams (R02).
      ceiling: std({ map: tex.ceilingDiff, normalMap: tex.ceilingNor, color: "#f2d9ae", roughness: 0.85 }),
      timber: std({ map: tex.timberDiff, color: "#9c744c", roughness: 0.8 }),
      steel: std({ color: "#1c1e1f", metalness: 0.55, roughness: 0.55 }),
      marble: std({ map: marble, roughness: 0.18, metalness: 0 }),
      barBase: std({ color: "#18191a", roughness: 0.55, metalness: 0.2 }),
      backBarWood: std({ color: "#3a2b21", roughness: 0.6 }),
      // Backlit bottle shelves read bright in every bar photo (R02, R03, UV01).
      shelfGlow: std({ color: "#3a2a18", emissive: "#ffb46b", emissiveIntensity: 1.8, roughness: 0.5 }),
      bottles: std({
        color: "#5b3a1e",
        emissive: "#c27a2c",
        emissiveIntensity: 0.75,
        roughness: 0.2,
        metalness: 0.1,
      }),
      fridge: std({ color: "#c9d7cf", emissive: "#e8f2ea", emissiveIntensity: 0.35, roughness: 0.2 }),
      brass: std({ color: "#b8955f", metalness: 1, roughness: 0.32 }),
      windowFrame: std({ color: "#e4e1d9", roughness: 0.6 }),
      // Lit kitchen seen through the pass: bright, but under the room's highlights (UV02).
      kitchen: std({ color: "#c9cfcc", emissive: "#e9ede6", emissiveIntensity: 0.22, roughness: 0.3 }),
      blackMetal: std({ color: "#121314", metalness: 0.7, roughness: 0.45 }),
      bulb: std({ color: "#fff3d6", emissive: "#ffcf8a", emissiveIntensity: 2.4, roughness: 0.3 }),
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
      velvet: new THREE.MeshPhysicalMaterial({
        color: "#8a6a3e",
        roughness: 0.75,
        sheen: 1,
        sheenColor: new THREE.Color("#e2c28a"),
        sheenRoughness: 0.45,
        side: THREE.DoubleSide,
      }),
      leather: std({ map: tuftedTexture("#2a2b2d"), color: "#ffffff", roughness: 0.55 }),
      flame: std({ color: "#ffd18a", emissive: "#ffb347", emissiveIntensity: 4 }),
      // Stair tread glow: lime-yellow, across each tread top (R01, R09, R11).
      led: std({ color: "#d9e86a", emissive: "#d4ec4f", emissiveIntensity: 1.1, roughness: 0.6 }),
      exitSign: std({ color: "#3a0b0b", emissive: "#ff2a2a", emissiveIntensity: 1.6 }),
      wineFrame: std({
        color: "#5c1717",
        roughness: 0.45,
        metalness: 0.2,
        emissive: "#3a0c08",
        emissiveIntensity: 0.4,
      }),
      darkVoid: std({ color: "#0e0f10", roughness: 1 }),
      // The closed side under the second flight and the turn landing (owner photo 4).
      stairWall: std({ color: "#262b28", roughness: 0.9 }),
      terrace: std({ color: "#1b2421", roughness: 1 }),
      street: std({ color: "#5d6266", roughness: 1 }),
      // The dance area is marked, not built (LIB-01): a solid sand line that reads in evening and
      // daylight, and a faint lit tint that darkens with the room instead of glowing.
      danceLine: new THREE.MeshBasicMaterial({ color: DANCE_AREA_COLOUR, depthWrite: false }),
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
