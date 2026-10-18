// PROTOTYPE ONLY (proto/visual-v2, never merged): export the fixed room for the Blender bake, and
// show the baked room with its light map.
import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/** Groups that receive baked light (fixed architecture); everything else stays live. */
export const RECEIVERS = [
  "walls",
  "floors",
  "bar",
  "ceiling",
  "mezzanine",
  "stair",
  "back-bar",
  "furnishings",
];
/** Groups exported only as occluders and emitters for the bake. */
const CONTEXT = ["openings", "light-fixtures", "railing"];

function flatten(root: THREE.Object3D, tag: string, out: THREE.Group) {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !o.visible) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const t = mats.some((x) => (x as THREE.Material).transparent) ? "C" : tag;
    const push = (matrix: THREE.Matrix4) => {
      const g = m.geometry.clone().applyMatrix4(matrix);
      const copy = new THREE.Mesh(g, m.material);
      copy.name = `${t}:${root.name}`;
      out.add(copy);
    };
    if ((m as THREE.InstancedMesh).isInstancedMesh) {
      const im = m as THREE.InstancedMesh;
      const mt = new THREE.Matrix4();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mt);
        push(new THREE.Matrix4().multiplyMatrices(m.matrixWorld, mt));
      }
    } else push(m.matrixWorld);
  });
}

export function BakeExportHook() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    (window as unknown as { __exportVenue?: () => Promise<string> }).__exportVenue = async () => {
      const out = new THREE.Group();
      for (const name of RECEIVERS) {
        const g = scene.getObjectByName(name);
        if (g) flatten(g, "R", out);
      }
      for (const name of CONTEXT) {
        const g = scene.getObjectByName(name);
        if (g) flatten(g, "C", out);
      }
      const buf = (await new GLTFExporter().parseAsync(out, { binary: true })) as ArrayBuffer;
      let s = "";
      const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    };
  }, [scene]);
  return null;
}

/** The baked room: Blender's export of the receivers, lit by its light map. */
export function BakedRoom({ intensity = 1 }: { intensity?: number }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}poc/venue-baked.glb`);
  const lm = useLoader(RGBELoader, `${import.meta.env.BASE_URL}poc/venue-lightmap.hdr`);
  useMemo(() => {
    lm.channel = 1;
    lm.flipY = false;
    lm.needsUpdate = true;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        if (mat.emissiveIntensity && mat.emissive.getHex() !== 0) {
          // Back-bar bottles and shelf strips: a warm glow, not blown-out white.
          mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.9);
          continue;
        }
        mat.lightMap = lm;
        mat.lightMapIntensity = intensity;
        mat.envMapIntensity = 0.35;
        mat.needsUpdate = true;
      }
    });
  }, [scene, lm, intensity]);
  return <primitive object={scene} />;
}
