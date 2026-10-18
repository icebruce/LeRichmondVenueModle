import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { chairsWorld } from "../../domain/layout/items";
import { useView } from "../context";
import { CONTACT_SPREAD, type Materials } from "../materials";
import type { Placed } from "./common";

/** Contact shadows drawn at most (tables, their chairs, standing guests). */
const CAPACITY = 800;
/** Footprint of a chair's or a standing guest's shadow (m). */
const SMALL = 0.5;

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

/** Contact shadows under the tables and their chairs; pieces being dragged are lifted, so none. */
export function TableContacts({ placed, m }: { placed: Placed[]; m: Materials }) {
  const drag = useView((s) => s.drag);
  const list = useMemo(() => {
    const out: Contact[] = [];
    for (const p of placed) {
      if (drag?.ids.includes(p.item.id)) continue;
      const s = p.shape;
      const at = { x: p.item.x, z: p.item.z, y: p.y, rotY: p.item.rotY };
      if (s.kind === "rectTable") out.push({ ...at, w: s.length, d: s.width });
      else if (s.kind === "roundTable" || s.kind === "cocktail")
        out.push({ ...at, w: s.diameter, d: s.diameter });
      else if (s.kind === "djBooth") out.push({ ...at, w: s.width, d: s.depth });
      else continue;
      for (const ch of chairsWorld(p.item, s)) out.push({ ...ch, y: p.y, w: SMALL, d: SMALL });
    }
    return out;
  }, [placed, drag]);
  return <ContactShadows list={list} m={m} />;
}

export { SMALL as CONTACT_SMALL };
