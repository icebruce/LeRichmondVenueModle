import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { chairsWorld } from "../../domain/layout/items";
import { useView } from "../context";
import { CONTACT_SPREAD, type Materials } from "../materials";
import type { Placed } from "./common";

/** Standing guests' contact shadows drawn at most. */
const CAPACITY = 800;
/** Footprint of a standing guest's shadow (m). */
const SMALL = 0.5;
/** A chair's seat, the footprint of its contact shadow (m). */
const CHAIR_SEAT = 0.42;

/** A flat unit square for contact shadows, scaled per instance. */
const square = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** One contact shadow: centre, turn and footprint, at floor height `y`. */
export type Contact = { x: number; z: number; y: number; rotY: number; w: number; d: number };

/** Instanced contact shadows (visual stage V2, Grounded): one draw call for all of them. */
export function ContactShadows({ list, m }: { list: Contact[]; m: Materials }) {
  const invalidate = useThree((s) => s.invalidate);
  const mesh = useMemo(() => {
    const out = new THREE.InstancedMesh(square, m.contact, CAPACITY);
    out.frustumCulled = false;
    out.renderOrder = 1;
    return out;
  }, [m]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  useEffect(() => {
    const t = new THREE.Object3D();
    const n = Math.min(CAPACITY, list.length);
    for (let i = 0; i < n; i++) {
      const c = list[i] as Contact;
      t.position.set(c.x, c.y + 0.004, c.z);
      t.rotation.set(0, c.rotY, 0);
      t.scale.set(c.w * CONTACT_SPREAD, 1, c.d * CONTACT_SPREAD);
      t.updateMatrix();
      mesh.setMatrixAt(i, t.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [list, mesh, invalidate]);
  return <primitive object={mesh} />;
}

/** How far a footprint's contact shadow reaches past its edge (m), and its darkness at the edge. */
const REACH = { table: 0.3, chair: 0.12 } as const;
const EDGE = { table: 0.75, chair: 0.5 } as const;
/** Corner radius of a rectangular footprint (m). */
const CORNER = 0.04;

type Footprint = {
  x: number;
  z: number;
  y: number;
  rotY: number;
  shape: { kind: "round"; radius: number } | { kind: "rect"; length: number; width: number };
  size: keyof typeof REACH;
};

/** A footprint's edge, going round: point and outward normal in its own frame, as [x, z, nx, nz]. */
function edge(f: Footprint["shape"]): [number, number, number, number][] {
  if (f.kind === "round")
    return Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return [Math.cos(a) * f.radius, Math.sin(a) * f.radius, Math.cos(a), Math.sin(a)];
    });
  const [a, b] = [f.length / 2, f.width / 2];
  const r = Math.min(CORNER, a, b);
  const out: [number, number, number, number][] = [];
  [
    [a - r, b - r],
    [-(a - r), b - r],
    [-(a - r), -(b - r)],
    [a - r, -(b - r)],
  ].forEach(([cx, cz], c) => {
    for (let k = 0; k <= 5; k++) {
      const ang = ((c + k / 5) * Math.PI) / 2;
      out.push([
        (cx as number) + Math.cos(ang) * r,
        (cz as number) + Math.sin(ang) * r,
        Math.cos(ang),
        Math.sin(ang),
      ]);
    }
  });
  return out;
}

/**
 * Contact shadows that follow each footprint's outline (owner 2026-10-19: tables and their cloths
 * looked afloat): as dark as `EDGE` under the piece and at its edge, then fading over a fixed `REACH`
 * whatever its size. All of them are one mesh, rebuilt when a piece moves.
 */
function footprintGeometry(list: Footprint[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (const f of list) {
    m.makeRotationY(f.rotY).setPosition(f.x, f.y + 0.004, f.z);
    const ring = edge(f.shape);
    const [reach, dark] = [REACH[f.size], EDGE[f.size]];
    const add = (x: number, z: number, a: number) => {
      v.set(x, 0, z).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      col.push(0, 0, 0, a);
      return pos.length / 3 - 1;
    };
    const centre = add(0, 0, dark);
    // Rings: the edge, a third of the way out, and the end of the reach.
    const rings = [
      [0, dark],
      [reach / 3, dark * 0.35],
      [reach, 0],
    ].map(([out, a]) =>
      ring.map(([x, z, nx, nz]) => add(x + nx * (out as number), z + nz * (out as number), a as number)),
    );
    const n = ring.length;
    const first = rings[0] as number[];
    for (let i = 0; i < n; i++) index.push(centre, first[i] as number, first[(i + 1) % n] as number);
    for (let r = 0; r < 2; r++) {
      const [inner, outer] = [rings[r] as number[], rings[r + 1] as number[]];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        index.push(inner[i] as number, outer[i] as number, inner[j] as number);
        index.push(inner[j] as number, outer[i] as number, outer[j] as number);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(index);
  return g;
}

/** Contact shadows under the tables and their chairs; pieces being dragged are lifted, so none. */
export function TableContacts({ placed, m }: { placed: Placed[]; m: Materials }) {
  const drag = useView((s) => s.drag);
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => {
    const out: Footprint[] = [];
    for (const p of placed) {
      if (drag?.ids.includes(p.item.id)) continue;
      const s = p.shape;
      const at = { x: p.item.x, z: p.item.z, y: p.y, rotY: p.item.rotY, size: "table" as const };
      if (s.kind === "rectTable")
        out.push({ ...at, shape: { kind: "rect", length: s.length, width: s.width } });
      else if (s.kind === "roundTable" || s.kind === "cocktail")
        out.push({ ...at, shape: { kind: "round", radius: s.diameter / 2 } });
      else if (s.kind === "djBooth")
        out.push({ ...at, shape: { kind: "rect", length: s.width, width: s.depth } });
      else continue;
      for (const ch of chairsWorld(p.item, s))
        out.push({
          ...ch,
          y: p.y,
          size: "chair",
          shape: { kind: "rect", length: CHAIR_SEAT, width: CHAIR_SEAT },
        });
    }
    return footprintGeometry(out);
  }, [placed, drag]);
  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);
  return <mesh geometry={geometry} material={m.footprint} renderOrder={1} frustumCulled={false} />;
}

export { SMALL as CONTACT_SMALL };
