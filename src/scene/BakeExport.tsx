import * as THREE from "three";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useStudio } from "./context";
import type { Materials } from "./materials";
import { ALBEDO, bakeInputsHash, roomAtlas, roomReceivers } from "./venue/bake";
import { applyAtlas } from "./venue/lightmap";

/** Parts of the scene the bake ignores: the couple's pieces, the lights' own fittings, presentation. */
const SKIP = new Set(["items", "seats", "light-fixtures", "plinth", "backdrops", "drop-ghost"]);

function skipped(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (SKIP.has(p.name)) return true;
  return false;
}

/**
 * `?bake-export` (`npm run bake`, visual stage V2): `window.__exportBake()` returns the fixed room as
 * a GLB for Blender. Receivers ("R:" + name) come from the venue data with their light-map UVs, in
 * plain materials of their average colour; everything else drawn and opaque goes in as an occluder
 * ("O:"), glowing where it glows, so the bake sees the bar, stair and fixtures in the light.
 */
export function BakeExport({ m }: { m: Materials }) {
  const scene = useThree((s) => s.scene);
  const { venue } = useStudio();
  useEffect(() => {
    const receiverMaterials = new Set<THREE.Material>(
      roomReceivers(venue).map((r) => m[r.material] as THREE.Material),
    );
    (window as unknown as { __exportBake?: () => Promise<string> }).__exportBake = async () => {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const { atlas, hash } = roomAtlas(venue);
      const root = new THREE.Group();
      for (const r of roomReceivers(venue)) {
        const mat = new THREE.MeshStandardMaterial({
          color: ALBEDO[r.material] ?? "#808080",
          name: r.material,
        });
        const mesh = new THREE.Mesh(applyAtlas(r.geometry, atlas), mat);
        mesh.name = `R:${r.name}`;
        root.add(mesh);
      }
      scene.updateWorldMatrix(true, true);
      let n = 0;
      scene.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || skipped(o)) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        if (Array.isArray(src) || receiverMaterials.has(src) || src.transparent || !src.color) return;
        const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(
          mesh.matrixWorld,
        );
        for (const name of Object.keys(geo.attributes))
          if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
        const glows = !!src.emissive && src.emissiveIntensity > 0 && src.emissive.getHex() !== 0;
        const mat = new THREE.MeshStandardMaterial({
          color: src.color,
          ...(glows ? { emissive: src.emissive, emissiveIntensity: src.emissiveIntensity } : {}),
          name: src.name || src.type,
        });
        const out = new THREE.Mesh(geo, mat);
        out.name = `O:${n++}`;
        root.add(out);
      });
      const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
      let s = "";
      const bytes = new Uint8Array(glb);
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return JSON.stringify({ geometryHash: hash, inputsHash: bakeInputsHash(venue), atlas, glb: btoa(s) });
    };
  }, [scene, venue, m]);
  return null;
}
