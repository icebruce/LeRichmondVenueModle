import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { chairsWorld } from "../../domain/layout/items";
import type { VenueModel } from "../../domain/venue/model";
import { useStudio, useView } from "../context";
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

/**
 * Contact shadows where the bar and the back counter meet the floor (V2b, Grounded). Long runs are a
 * row of near-square shadows, so their soft edges fall only at the sides.
 */
function venueContacts(venue: VenueModel): Contact[] {
  const [x0, z0, x1, z1] = venue.data.bar.outer.value;
  const { legWidth: leg, frontDepth: front } = venue.data.bar;
  const rc = venue.data.backBar.rearCounter;
  const out: Contact[] = [];
  const run = (ax: number, az: number, bx: number, bz: number) => {
    const along = bx - ax > bz - az;
    const [len, wid] = along ? [bx - ax, bz - az] : [bz - az, bx - ax];
    const n = Math.max(1, Math.round(len / (wid * 1.2)));
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + (len * (i + 0.5)) / n;
      const [x, z] = along ? [(ax + bx) / 2 + c, (az + bz) / 2] : [(ax + bx) / 2, (az + bz) / 2 + c];
      const [w, d] = along ? [len / n, wid] : [wid, len / n];
      out.push({ x, z, y: 0, rotY: 0, w, d });
    }
  };
  run(x0, z0, x0 + leg, z1);
  run(x1 - leg, z0, x1, z1);
  run(x0 + leg, z1 - front, x1 - leg, z1);
  run(rc[0], rc[1], rc[2], rc[3]);
  return out;
}

/** Contact shadows under the bar, the tables and their chairs; pieces being dragged are lifted, so none. */
export function TableContacts({ placed, m }: { placed: Placed[]; m: Materials }) {
  const drag = useView((s) => s.drag);
  const { venue } = useStudio();
  const fixed = useMemo(() => venueContacts(venue), [venue]);
  const list = useMemo(() => {
    const out: Contact[] = [...fixed];
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
  }, [placed, drag, fixed]);
  return <ContactShadows list={list} m={m} />;
}

export { SMALL as CONTACT_SMALL };
