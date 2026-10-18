import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import { adjustedTexture, glowTexture, marbleTexture, tuftedTexture } from "./textures";
import { DANCE_AREA_COLOUR } from "../domain/layout/items";

const base = `${import.meta.env.BASE_URL}assets/textures/`;

const TEXTURES = {
  // PROTOTYPE: V2 surfaces at real scale (Poly Haven CC0).
  brickDiff: "ph/yellow_brick_diff.jpg",
  brickNor: "ph/yellow_brick_nor_gl.jpg",
  brickRough: "ph/yellow_brick_rough.jpg",
  redBrickDiff: "ph/red_brick_diff.jpg",
  redBrickNor: "ph/red_brick_nor_gl.jpg",
  tileDiff: "ph/large_floor_tiles_02_diff.jpg",
  tileNor: "ph/large_floor_tiles_02_nor_gl.jpg",
  tileRough: "ph/large_floor_tiles_02_rough.jpg",
  floorDiff: "ph/old_wood_floor_diff.jpg",
  floorNor: "ph/old_wood_floor_nor_gl.jpg",
  floorRough: "ph/old_wood_floor_rough.jpg",
  ceilingDiff: "roof_planks_diff.webp",
  ceilingNor: "roof_planks_nor_gl.webp",
  timberDiff: "wood_floor_worn_diff.webp",
} as const;

export const TEXTURE_URLS = Object.fromEntries(
  Object.entries(TEXTURES).map(([k, f]) => [k, base + f]),
) as Record<keyof typeof TEXTURES, string>;

/** Physical size in metres that one texture repeat covers (UVs are generated in metres). */
export const TILE = { brick: 2.0, tile: 2.0, floor: 3.0, ceiling: 1.6, timber: 1.2, marble: 1.4 } as const;

function prep(t: THREE.Texture, color: boolean) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Materials = ReturnType<typeof useMaterials>;

export function useMaterials() {
  const tex = useTexture(TEXTURE_URLS);
  return useMemo(() => {
    for (const [k, t] of Object.entries(tex)) prep(t, k.endsWith("Diff"));
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
    const marble = marbleTexture();
    const glow = glowTexture();
    // The venue brick is a pale buff; the CC0 texture is warmer, so tone it down (R03, R07).
    const buff = adjustedTexture(tex.brickDiff, 0.7, 1.05);
    return {
      glow,
      brick: std({
        map: buff,
        normalMap: tex.brickNor,
        roughnessMap: tex.brickRough,
        color: "#f4ebdd",
        roughness: 1,
      }),
      redBrick: std({ map: tex.redBrickDiff, normalMap: tex.redBrickNor, color: "#d8a08e", roughness: 0.95 }),
      greenPanel: std({ color: "#28352e", roughness: 0.7 }),
      tile: std({
        map: tex.tileDiff,
        normalMap: tex.tileNor,
        roughnessMap: tex.tileRough,
        color: "#6f665c",
        roughness: 0.8,
      }),
      tileJoint: std({ color: "#5a4634", roughness: 0.7 }),
      woodFloor: std({
        map: tex.floorDiff,
        normalMap: tex.floorNor,
        roughnessMap: tex.floorRough,
        color: "#8e7563",
        roughness: 0.7,
      }),
      // Honey pine deck with darker beams (R02).
      ceiling: std({ map: tex.ceilingDiff, normalMap: tex.ceilingNor, color: "#e6c48e", roughness: 0.85 }),
      timber: std({ map: tex.timberDiff, color: "#9c744c", roughness: 0.8 }),
      steel: std({ color: "#1c1e1f", metalness: 0.55, roughness: 0.55 }),
      // PROTOTYPE: light wall caps (accepted target).
      cap: std({ color: "#e6ddcf", roughness: 0.9 }),
      marble: std({ map: marble, roughness: 0.18, metalness: 0 }),
      barBase: std({ color: "#18191a", roughness: 0.55, metalness: 0.2 }),
      backBarWood: std({ color: "#3a2b21", roughness: 0.6 }),
      // Backlit bottle shelves read bright in every bar photo (R02, R03, UV01).
      shelfGlow: std({ color: "#3a2a18", emissive: "#ffb46b", emissiveIntensity: 3.2, roughness: 0.5 }),
      bottles: std({
        color: "#5b3a1e",
        emissive: "#c27a2c",
        emissiveIntensity: 1.3,
        roughness: 0.2,
        metalness: 0.1,
      }),
      fridge: std({ color: "#c9d7cf", emissive: "#e8f2ea", emissiveIntensity: 0.35, roughness: 0.2 }),
      brass: std({ color: "#b8955f", metalness: 1, roughness: 0.32 }),
      windowFrame: std({ color: "#e4e1d9", roughness: 0.6 }),
      kitchen: std({ color: "#dfe3e0", emissive: "#f3f5f0", emissiveIntensity: 0.5, roughness: 0.3 }),
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
      led: std({ color: "#ffd77a", emissive: "#ffcc55", emissiveIntensity: 2.2 }),
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
  }, [tex]);
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
