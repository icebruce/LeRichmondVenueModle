import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { VenueModel } from "../domain/venue/model";
import type { Materials } from "./materials";
import type { Quality } from "./quality";
import type { Atlas } from "./venue/lightmap";
import { BAKE_SETS, type BakeManifest, bakeAtlas, bakedMaterial, roomReceivers } from "./venue/bake";

/** `?bake=stale` (tests) and `?bake-export` (the bake tool) draw the live-lit room. */
const BAKE_OFF = ((q) => q.get("bake") === "stale" || q.has("bake-export"))(
  new URLSearchParams(window.location.search),
);

/** The receivers' light-mapped materials and their light-map UVs, when the bake matches the room. */
export type Bake = { atlas: Atlas; materials: Partial<Materials> };

/**
 * Brightness of each set on top of the bake's own scale: the evening and daylight calibration
 * against the reference photos (V2).
 */
const EXPOSURE: Record<(typeof BAKE_SETS)[number], number> = { evening: 1, day: 1 };

/**
 * The baked room light (visual stage V2, ADR-2), or null for the live-lit room: when no bake was
 * made from this room (the manifest's fingerprints differ), or `?bake=stale` forces it for tests.
 * Both sets load with the room; switching lighting swaps the map (no new shader).
 */
export function useBake(
  venue: VenueModel,
  manifest: BakeManifest | undefined,
  m: Materials,
  quality: Quality,
  evening: boolean,
): Bake | null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const atlas = useMemo(() => (!manifest || BAKE_OFF ? null : bakeAtlas(venue, manifest)), [venue, manifest]);
  const size = quality === "high" ? "2k" : "1k";
  const urls =
    atlas && manifest
      ? BAKE_SETS.map((k) => `${import.meta.env.BASE_URL}assets/bake/${manifest.sets[k].files[size]}`)
      : [];
  const maps = useLoader(KTX2Loader, urls, (loader) => loader.detectSupport(gl)) as THREE.Texture[];
  const bake = useMemo(() => {
    const [map] = maps;
    if (!atlas || !map) return null;
    const materials: Partial<Materials> = {};
    for (const r of roomReceivers(venue)) {
      const key = r.material;
      if (!materials[key])
        Object.assign(materials, { [key]: bakedMaterial(m[key] as THREE.MeshStandardMaterial, map) });
    }
    return { atlas, materials };
  }, [atlas, maps, venue, m]);
  useEffect(() => {
    if (!bake || !manifest) return;
    const set = evening ? "evening" : "day";
    const map = maps[BAKE_SETS.indexOf(set)] as THREE.Texture;
    map.channel = 1;
    for (const mat of Object.values(bake.materials) as THREE.MeshStandardMaterial[]) {
      mat.lightMap = map;
      // The bake holds irradiance over π (Cycles' diffuse colour pass is left out), scaled into 8 bits.
      mat.lightMapIntensity = Math.PI * manifest.sets[set].scale * EXPOSURE[set];
    }
    invalidate();
  }, [bake, maps, manifest, evening, invalidate]);
  // Test hook: whether the room is drawn with its bake.
  useEffect(() => {
    (window as unknown as { __bakeState?: () => string }).__bakeState = () => (bake ? "baked" : "live");
  }, [bake]);
  return bake;
}
