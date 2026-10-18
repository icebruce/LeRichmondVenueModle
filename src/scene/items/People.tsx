import * as THREE from "three";
import { useEffect, useMemo } from "react";
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
  const seatedHead = head(1.2, -0.02, s);
  const standingHead = head(1.62, 0.01, s);
  const seated = mergeGeometries([
    capsule(0.14, v(0, 0.58, -0.08), v(0, 0.98, -0.04), s),
    ...[-0.1, 0.1].flatMap((x) => [
      capsule(0.065, v(x, 0.5, -0.04), v(x, 0.5, 0.36), s),
      capsule(0.055, v(x, 0.48, 0.38), v(x, 0.06, 0.42), s),
      capsule(0.045, v(x * 1.9, 0.92, -0.04), v(x * 1.7, 0.74, 0.26), s),
    ]),
  ]);
  const standing = mergeGeometries([
    capsule(0.15, v(0, 1.0, 0), v(0, 1.4, 0), s),
    ...[-0.09, 0.09].flatMap((x) => [
      capsule(0.065, v(x, 0.08, 0), v(x, 0.9, 0), s),
      capsule(0.045, v(x * 2.3, 1.38, 0), v(x * 2.5, 0.85, 0.04), s),
    ]),
  ]);
  if (!seated || !standing) throw new Error("figure merge failed");
  return { seated, standing, seatedHead, standingHead };
}

/** Guests seated on chairs and standing in open floor (PPL-01..03), two instanced meshes. */
export function People({ low }: { low: boolean }) {
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const show = useView((s) => s.showPeople);
  const drag = useView((s) => s.drag);
  const geo = useMemo(() => figures(low), [low]);
  // PROTOTYPE: dressed guests (outfit colours, skin-tone heads); light and see-through in the overview.
  const cam = useEditor((s) => s.camera);
  const view = useView((s) => s.view);
  const overview = cam === "dollhouse" && view === null;
  const meshes = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.85,
      transparent: overview,
      opacity: overview ? 0.62 : 1,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.6,
      transparent: overview,
      opacity: overview ? 0.62 : 1,
    });
    const blobTex = (() => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const c = cv.getContext("2d") as CanvasRenderingContext2D;
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "#000");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    })();
    const blobMat = new THREE.MeshBasicMaterial({
      color: "#000",
      alphaMap: blobTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    return {
      seated: new THREE.InstancedMesh(geo.seated, mat, MAX),
      standing: new THREE.InstancedMesh(geo.standing, mat, MAX),
      seatedHead: new THREE.InstancedMesh(geo.seatedHead, skin, MAX),
      standingHead: new THREE.InstancedMesh(geo.standingHead, skin, MAX),
      blobs: new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2),
        blobMat,
        MAX * 2,
      ),
      mat,
    };
  }, [geo, overview]);
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
    const outfits = [
      "#2b2d31",
      "#1f2a3d",
      "#141416",
      "#3c2a2e",
      "#4a4e52",
      "#6b2c35",
      "#d9c9a8",
      "#2f3d33",
      "#5a4a3c",
      "#e8e2d6",
    ];
    const skins = ["#f1d3bd", "#e0b493", "#c68e6a", "#a8704c", "#7b4e34", "#5c3a26"];
    const light = new THREE.Color("#ece5da");
    let b = 0;
    const level = (x: number, z: number) =>
      pointInPolygon([x, z], venue.raised.outline) ? venue.raised.height : 0;
    const fill = (
      mesh: THREE.InstancedMesh,
      list: { x: number; z: number; rotY: number }[],
      heads: THREE.InstancedMesh,
    ) => {
      const n = Math.min(MAX, list.length);
      for (let i = 0; i < n; i++) {
        const p = list[i] as { x: number; z: number; rotY: number };
        t.position.set(p.x, level(p.x, p.z), p.z);
        t.rotation.set(0, p.rotY, 0);
        const k = 0.94 + ((i * 37) % 11) * 0.012;
        t.scale.set(k * 0.86, k * 1.03, k * 0.86);
        t.updateMatrix();
        mesh.setMatrixAt(i, t.matrix);
        heads.setMatrixAt(i, t.matrix);
        c.set(outfits[(i * 7) % outfits.length] as string);
        if (overview) c.lerp(light, 0.55);
        mesh.setColorAt(i, c);
        c.set(skins[(i * 5) % skins.length] as string);
        if (overview) c.lerp(light, 0.4);
        heads.setColorAt(i, c);
        t.scale.setScalar(1);
        t.position.y += 0.006;
        t.updateMatrix();
        meshes.blobs.setMatrixAt(b++, t.matrix);
      }
      mesh.count = n;
      heads.count = n;
      heads.instanceMatrix.needsUpdate = true;
      if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
      heads.computeBoundingSphere();
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(meshes.seated, crowd.seated, meshes.seatedHead);
    fill(meshes.standing, crowd.standing, meshes.standingHead);
    meshes.blobs.count = b;
    meshes.blobs.instanceMatrix.needsUpdate = true;
    meshes.blobs.computeBoundingSphere();
    meshes.seated.castShadow = meshes.standing.castShadow = !low;
  }, [crowd, meshes, venue, low, overview]);
  if (!show || drag) return null;
  return (
    <group name="people">
      <primitive object={meshes.seated} />
      <primitive object={meshes.standing} />
      <primitive object={meshes.seatedHead} />
      <primitive object={meshes.standingHead} />
      <primitive object={meshes.blobs} />
    </group>
  );
}
