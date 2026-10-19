import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import { barTopPoint } from "../../domain/venue/model";
import { seededRandom } from "../../domain/random";
import type { Materials } from "../materials";

const VASE_H = 0.55;
const BRANCHES = 9;
const BLOOMS = 26;

/** A tall glass cylinder vase, flared at the lip (R02). */
const vaseGeo = new THREE.LatheGeometry(
  [
    [0, 0],
    [0.085, 0],
    [0.09, 0.02],
    [0.075, VASE_H * 0.55],
    [0.095, VASE_H],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  20,
);

/**
 * The two bar flowers (VEN-06): tall glass vases of white blossom branches on the bar top, as in R02,
 * each where the plan puts it along the bar. Three draws for both: glass, branches, blossom.
 */
export function BarFlowers({ venue, m, at }: { venue: VenueModel; m: Materials; at: readonly number[] }) {
  const top = venue.data.bar.counterHeight.value;
  const built = useMemo(() => {
    const vases: THREE.BufferGeometry[] = [];
    const branches: THREE.BufferGeometry[] = [];
    const blooms: THREE.Matrix4[] = [];
    const t = new THREE.Object3D();
    at.forEach((share, v) => {
      const [x, z] = barTopPoint(venue.data, share);
      vases.push(vaseGeo.clone().translate(x, top, z));
      const rand = seededRandom(7 + v * 101);
      for (let b = 0; b < BRANCHES; b++) {
        // Each branch leans out from the vase mouth, with a bend partway up.
        const yaw = (b / BRANCHES) * Math.PI * 2 + rand() * 0.6;
        const lean = 0.25 + rand() * 0.35;
        const length = 0.75 + rand() * 0.45;
        const base = new THREE.Vector3(x, top + VASE_H - 0.05, z);
        const dir = new THREE.Vector3(
          Math.cos(yaw) * Math.sin(lean),
          Math.cos(lean),
          Math.sin(yaw) * Math.sin(lean),
        );
        const knee = base.clone().addScaledVector(dir, length * 0.5);
        const bent = dir
          .clone()
          .add(new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.35))
          .normalize();
        const tip = knee.clone().addScaledVector(bent, length * 0.5);
        for (const [a, c, r] of [
          [base, knee, 0.009],
          [knee, tip, 0.006],
        ] as const) {
          const seg = new THREE.CylinderGeometry(r * 0.7, r, a.distanceTo(c), 5, 1, true);
          seg.translate(0, a.distanceTo(c) / 2, 0);
          seg.applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              c.clone().sub(a).normalize(),
            ),
          );
          seg.translate(a.x, a.y, a.z);
          branches.push(seg);
        }
        // Blossom clustered along the upper half of the branch.
        for (let i = 0; i < BLOOMS; i++) {
          const k = 0.35 + rand() * 0.65;
          const p = k < 0.5 ? base.clone().lerp(knee, k * 2) : knee.clone().lerp(tip, (k - 0.5) * 2);
          p.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.09));
          t.position.copy(p);
          t.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          t.scale.setScalar(0.7 + rand() * 0.6);
          t.updateMatrix();
          blooms.push(t.matrix.clone());
        }
      }
    });
    const blossom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), m.blossom, blooms.length);
    blooms.forEach((mx, i) => blossom.setMatrixAt(i, mx));
    blossom.computeBoundingSphere();
    return {
      vases: mergeGeometries(vases),
      branches: mergeGeometries(branches.map((g) => g.toNonIndexed())),
      blossom,
    };
  }, [venue, m, at, top]);
  useEffect(
    () => () => {
      built.vases?.dispose();
      built.branches?.dispose();
      built.blossom.geometry.dispose();
      built.blossom.dispose();
    },
    [built],
  );
  return (
    <group name="bar-flowers">
      {built.vases && <mesh geometry={built.vases} material={m.glass} />}
      {built.branches && <mesh geometry={built.branches} material={m.branch} castShadow />}
      <primitive object={built.blossom} />
    </group>
  );
}
