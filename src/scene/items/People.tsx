import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pointInPolygon } from "../../domain/geometry";
import { placePeople } from "../../domain/layout/people";
import type { Scenario } from "../../domain/scenario/schema";
import { useEditor, useStudio, useView } from "../context";

const MAX = 300;

function capsule(r: number, a: THREE.Vector3, b: THREE.Vector3, seg: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, len, 2, seg);
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g.toNonIndexed();
}

function head(y: number, z: number, seg: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(0.1, seg, Math.max(4, seg - 2)).translate(0, y, z).toNonIndexed();
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Simple neutral figures, no faces (DESIGN_GUIDE §9). Local frame faces +z; origin on the floor. */
function figures(low: boolean) {
  const s = low ? 6 : 8;
  const seated = mergeGeometries([
    capsule(0.14, v(0, 0.58, -0.08), v(0, 0.98, -0.04), s),
    head(1.2, -0.02, s),
    ...[-0.1, 0.1].flatMap((x) => [
      capsule(0.065, v(x, 0.5, -0.04), v(x, 0.5, 0.36), s),
      capsule(0.055, v(x, 0.48, 0.38), v(x, 0.06, 0.42), s),
      capsule(0.045, v(x * 1.9, 0.92, -0.04), v(x * 1.7, 0.74, 0.26), s),
    ]),
  ]);
  const standing = mergeGeometries([
    capsule(0.15, v(0, 1.0, 0), v(0, 1.4, 0), s),
    head(1.62, 0.01, s),
    ...[-0.09, 0.09].flatMap((x) => [
      capsule(0.065, v(x, 0.08, 0), v(x, 0.9, 0), s),
      capsule(0.045, v(x * 2.3, 1.38, 0), v(x * 2.5, 0.85, 0.04), s),
    ]),
  ]);
  if (!seated || !standing) throw new Error("figure merge failed");
  return { seated, standing };
}

/** Guests seated on chairs and standing in open floor (PPL-01..03), two instanced meshes. */
export function People({ low }: { low: boolean }) {
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const show = useView((s) => s.showPeople);
  const drag = useView((s) => s.drag);
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => figures(low), [low]);
  const meshes = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
    return {
      seated: new THREE.InstancedMesh(geo.seated, mat, MAX),
      standing: new THREE.InstancedMesh(geo.standing, mat, MAX),
      mat,
    };
  }, [geo]);
  useEffect(
    () => () => {
      meshes.seated.dispose();
      meshes.standing.dispose();
      meshes.mat.dispose();
      geo.seated.dispose();
      geo.standing.dispose();
    },
    [meshes, geo],
  );
  // Recomputed when the layout settles, not on every frame of a drag.
  const crowd = useMemo(
    () =>
      placePeople(
        scenario.items,
        scenario.guests.count,
        scenario.phase ?? "dinner",
        venue,
        catalog,
        scenario.venueToggles,
        scenario.guests.seed,
      ),
    [scenario.items, scenario.guests, scenario.phase, scenario.venueToggles, venue, catalog],
  );
  useEffect(() => {
    const t = new THREE.Object3D();
    const c = new THREE.Color();
    const tones = ["#a69d92", "#8f877e", "#b8afa4", "#7d766f", "#9a9187"];
    const level = (x: number, z: number) =>
      pointInPolygon([x, z], venue.raised.outline) ? venue.raised.height : 0;
    const fill = (mesh: THREE.InstancedMesh, list: { x: number; z: number; rotY: number }[]) => {
      const n = Math.min(MAX, list.length);
      for (let i = 0; i < n; i++) {
        const p = list[i] as { x: number; z: number; rotY: number };
        t.position.set(p.x, level(p.x, p.z), p.z);
        t.rotation.set(0, p.rotY, 0);
        t.scale.setScalar(0.94 + ((i * 37) % 11) * 0.012);
        t.updateMatrix();
        mesh.setMatrixAt(i, t.matrix);
        mesh.setColorAt(i, c.set(tones[(i * 7) % tones.length] as string));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(meshes.seated, crowd.seated);
    fill(meshes.standing, crowd.standing);
    meshes.seated.castShadow = meshes.standing.castShadow = !low;
    // Written in place: ask for a frame (frames are on demand).
    invalidate();
  }, [crowd, meshes, venue, low, invalidate]);
  if (!show || drag) return null;
  return (
    <group name="people">
      <primitive object={meshes.seated} />
      <primitive object={meshes.standing} />
    </group>
  );
}
