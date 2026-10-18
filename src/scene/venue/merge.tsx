import * as THREE from "three";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const KEEP = ["position", "normal", "uv", "uv1"] as const;

/** World-space, non-indexed copy with only the attributes every merge partner shares. */
function baked(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const g = new THREE.BufferGeometry();
  for (const name of KEEP) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, a);
  }
  src.dispose();
  return g.applyMatrix4(mesh.matrixWorld);
}

/** Meshes drawn inside `root` (its own hidden flag aside), skipping instanced and line objects. */
function drawn(root: THREE.Object3D, out: THREE.Mesh[] = []): THREE.Mesh[] {
  for (const o of root.children) {
    if (!o.visible) continue;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) out.push(m);
    drawn(o, out);
  }
  return out;
}

/**
 * Static venue parts drawn as one mesh per material (visual stage V0: fewer draw calls in the main
 * and shadow passes). The parts render hidden inside; their visible meshes are baked into world
 * space and merged per material and shadow flags once mounted, and again whenever `version`
 * changes, so `version` must name every input that changes what the parts draw. Instanced meshes
 * are not merged and stay hidden here: draw them outside.
 */
export function StaticMerge({ version, children }: { version: string; children: ReactNode }) {
  const source = useRef<THREE.Group>(null);
  const [merged, setMerged] = useState<THREE.Mesh[]>([]);
  useLayoutEffect(() => {
    const root = source.current;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    const groups = new Map<string, { mesh: THREE.Mesh; geos: THREE.BufferGeometry[] }>();
    for (const m of drawn(root)) {
      const material = m.material as THREE.Material;
      const attrs = KEEP.filter((n) => m.geometry.getAttribute(n)).join();
      const key = `${material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${attrs}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { mesh: m, geos: [] }));
      g.geos.push(baked(m));
    }
    const out: THREE.Mesh[] = [];
    for (const { mesh, geos } of groups.values()) {
      const geometry = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      if (!geometry) continue;
      const m = new THREE.Mesh(geometry, mesh.material);
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      m.renderOrder = mesh.renderOrder;
      // Baked in world space, and the scene root never moves.
      m.matrixAutoUpdate = false;
      out.push(m);
    }
    setMerged(out);
  }, [version]);
  useEffect(() => () => merged.forEach((m) => m.geometry.dispose()), [merged]);
  return (
    <>
      <group ref={source} visible={false}>
        {children}
      </group>
      {merged.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </>
  );
}
