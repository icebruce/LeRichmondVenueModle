import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import { barTopPlace } from "../../domain/venue/model";
import { seededRandom } from "../../domain/random";
import type { Materials } from "../materials";

const VASE_H = 0.68;
const BRANCHES = 9;
/** Florets per branch, clustered toward its tip and along its side twig. */
const BLOOMS = 60;

/** A tall glass cylinder vase, flared at the lip (R02). */
const vaseGeo = new THREE.LatheGeometry(
  [
    [0, 0],
    [0.06, 0],
    [0.062, 0.02],
    [0.058, VASE_H * 0.6],
    [0.064, VASE_H],
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
      const [x, z] = barTopPlace(venue.data, share).point;
      vases.push(vaseGeo.clone().translate(x, top, z));
      const rand = seededRandom(7 + v * 101);
      const stem = (a: THREE.Vector3, c: THREE.Vector3, r: number) => {
        const seg = new THREE.CylinderGeometry(r * 0.7, r, a.distanceTo(c), 5, 1, true);
        seg.translate(0, a.distanceTo(c) / 2, 0);
        seg.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()),
        );
        seg.translate(a.x, a.y, a.z);
        branches.push(seg);
      };
      const floret = (p: THREE.Vector3, spread: number) => {
        t.position
          .copy(p)
          .add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(spread));
        t.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        t.scale.setScalar(0.7 + rand() * 0.6);
        t.updateMatrix();
        blooms.push(t.matrix.clone());
      };
      for (let b = 0; b < BRANCHES; b++) {
        // A dense, rounded crown (R02): branches at irregular turns, leaning out and bending further.
        const yaw = (b / BRANCHES) * Math.PI * 2 + rand() * 0.9;
        const lean = 0.5 + rand() * 0.6;
        const length = 0.45 + rand() * 0.3;
        const base = new THREE.Vector3(x, top + VASE_H - 0.05, z);
        const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
        const dir = new THREE.Vector3(0, Math.cos(lean), 0).addScaledVector(out, Math.sin(lean));
        const knee = base.clone().addScaledVector(dir, length * 0.55);
        const tip = knee
          .clone()
          .addScaledVector(dir.clone().addScaledVector(out, 0.3).normalize(), length * 0.45);
        stem(base, knee, 0.008);
        stem(knee, tip, 0.005);
        // A short side twig from the knee.
        const twig = knee.clone().addScaledVector(
          dir
            .clone()
            .addScaledVector(out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.2), 0.8)
            .normalize(),
          0.25,
        );
        stem(knee, twig, 0.004);
        for (let i = 0; i < BLOOMS; i++) {
          const onTwig = i % 4 === 0;
          const k = 0.4 + rand() * 0.6;
          floret(onTwig ? knee.clone().lerp(twig, 0.4 + rand() * 0.6) : knee.clone().lerp(tip, k), 0.035);
        }
      }
    });
    const blossom = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.02, 1).scale(1, 0.55, 1),
      m.blossom,
      blooms.length,
    );
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
