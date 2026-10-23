import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import type { VenueModel } from "../../domain/venue/model";
import { barTopPlace, barTopShare, moveVase } from "../../domain/venue/model";
import { seededRandom } from "../../domain/random";
import type { Materials } from "../materials";
import { useEditor, useStudio, useView } from "../context";
import { requestWarmup } from "../frames";
import { PieceModelLoader, type PieceModel } from "../items/geometry";
import { useFloorPointer, useSetControls } from "../items/Items";

const VASE_H = 0.75;
/** Radius of the vase's mouth (m); its waist is much slimmer. */
const LIP_R = 0.085;
/** Blossom branches in each vase: together a big, airy, low dome (R02, owner 2026-10-23). */
const BRANCHES = 22;
/** Length (m, the model's own) of each branch's bare stem below the lip. */
const LIP_DEPTH = 0.48;
/** Each branch spread wider and lower than the model: R02's crowns are domes wider than tall. */
const SPREAD = 1.35;
const SQUASH = 0.8;
/** Touch: hold this long (ms) without moving this far (px) to pick a vase up, as for pieces. */
const HOLD_MS = 300;
const HOLD_PX = 8;
/** How far a vase in hand rises (m), as a dragged piece does. */
const LIFT = 0.02;

/** A tall, slender glass trumpet vase on a small foot, flaring toward the mouth (R02). */
const vaseGeo = new THREE.LatheGeometry(
  [
    [0, 0],
    [0.06, 0],
    [0.055, 0.012],
    [0.035, 0.05],
    [0.035, VASE_H * 0.55],
    [0.05, VASE_H * 0.8],
    [LIP_R, VASE_H],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  24,
);

/** The pointer's target for one vase: the glass and the heart of its crown, not the outer branches. */
const grabGeo = new THREE.CylinderGeometry(0.3, 0.08, 1.15, 12).translate(0, 0.575, 0);

/**
 * The two bar flowers (VEN-06): tall glass vases of white blossom branches on the bar top, as in R02,
 * each where the plan puts it along the bar. Each crown is one Meshy blossom branch repeated, turned
 * and leaning out from a bundle of stems inside the glass. Two draws for both: glass and branches. A vase is dragged along the bar
 * (touch: hold, then drag) and saved on release, one undo step.
 */
export function BarFlowers({ venue, m, at }: { venue: VenueModel; m: Materials; at: [number, number] }) {
  const { editor, readOnly } = useStudio();
  const camera = useEditor((s) => s.camera);
  const photo = useView((s) => !!s.photo);
  const invalidate = useThree((s) => s.invalidate);
  const toPlane = useFloorPointer();
  const setControls = useSetControls();
  const model = useLoader(PieceModelLoader, venue.data.fixtures.barFlowerModel) as PieceModel;
  const top = venue.data.bar.counterHeight.value;
  const [live, setLive] = useState<[number, number] | null>(null);
  /** The vase in hand, drawn lifted as a piece is (DESIGN_GUIDE §5), from pick-up to release. */
  const [held, setHeld] = useState<0 | 1 | null>(null);
  const shown = live ?? at;

  const meshes = useMemo(() => {
    // Ivory by its own colour a little, so the blossom stays white in the evening's shade (R02).
    model.material.emissiveMap = model.material.map;
    model.material.emissive.set("#ffeed8");
    model.material.emissiveIntensity = 0.32;
    const vases = new THREE.InstancedMesh(vaseGeo, m.glass, 2);
    const crowns = new THREE.InstancedMesh(model.geometry, model.material, 2 * BRANCHES);
    crowns.castShadow = true;
    return { vases, crowns };
  }, [m, model]);
  useEffect(() => {
    requestWarmup();
    return () => {
      meshes.vases.dispose();
      meshes.crowns.dispose();
    };
  }, [meshes]);

  // Each branch: its stem's foot inside the vase, turned about it and leaning out by its own amount,
  // so the stems cross the mouth within its radius.
  const branches = useMemo(
    () =>
      [0, 1].flatMap((v) => {
        const rand = seededRandom(7 + v * 101);
        return Array.from({ length: BRANCHES }, (_, b) => ({
          yaw: (b / BRANCHES) * Math.PI * 2 + rand() * 0.5,
          lean: 0.12 + rand() * 0.22,
          spin: rand() * Math.PI * 2,
          scale: 0.62 + rand() * 0.18,
        }));
      }),
    [],
  );
  useLayoutEffect(() => {
    const t = new THREE.Object3D();
    const lean = new THREE.Matrix4();
    const shape = new THREE.Matrix4();
    shown.forEach((share, v) => {
      const [x, z] = barTopPlace(venue.data, share).point;
      const y = top + (held === v ? LIFT : 0);
      t.position.set(x, y, z);
      t.rotation.set(0, 0, 0);
      t.scale.setScalar(1);
      t.updateMatrix();
      meshes.vases.setMatrixAt(v, t.matrix);
      for (let b = 0; b < BRANCHES; b++) {
        const br = branches[v * BRANCHES + b];
        if (!br) continue;
        t.position.set(x, y + VASE_H - LIP_DEPTH * br.scale * SQUASH, z);
        t.rotation.set(0, br.yaw, 0);
        t.updateMatrix();
        lean.makeRotationZ(br.lean);
        shape
          .makeRotationY(br.spin)
          .scale(new THREE.Vector3(br.scale * SPREAD, br.scale * SQUASH, br.scale * SPREAD));
        meshes.crowns.setMatrixAt(v * BRANCHES + b, t.matrix.clone().multiply(lean).multiply(shape));
      }
    });
    meshes.vases.instanceMatrix.needsUpdate = true;
    meshes.crowns.instanceMatrix.needsUpdate = true;
    meshes.vases.computeBoundingSphere();
    meshes.crowns.computeBoundingSphere();
    invalidate();
  }, [shown, held, meshes, branches, venue, top, invalidate]);

  const press = useRef<number | null>(null);
  const editable = !readOnly && camera !== "walk" && !photo;
  function onDown(e: ThreeEvent<PointerEvent>, i: 0 | 1) {
    if (!editable || e.button > 0) return;
    e.stopPropagation();
    const pointerId = e.pointerId;
    const from: [number, number] = [at[0], at[1]];
    let next: [number, number] | null = null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const p = toPlane(ev.clientX, ev.clientY, top);
      if (!p) return;
      next = moveVase(venue.data, from, i, barTopShare(venue.data, [p.x, p.z]));
      setLive(next);
    };
    const stop = (save: boolean) => (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setControls(true);
      document.body.style.cursor = "";
      setLive(null);
      setHeld(null);
      if (save && next && (next[0] !== from[0] || next[1] !== from[1])) editor.setBarFlowers({ at: next });
    };
    const up = stop(true);
    const cancel = stop(false);
    const begin = () => {
      setControls(false);
      setHeld(i);
      document.body.style.cursor = "grabbing";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    };
    if (e.pointerType !== "touch") return begin();
    // Touch: a one-finger drag still moves the camera; holding still picks the vase up.
    const [x0, y0] = [e.clientX, e.clientY];
    const clear = () => {
      if (press.current) window.clearTimeout(press.current);
      press.current = null;
      window.removeEventListener("pointermove", wander);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("pointerdown", pinch);
    };
    // A second finger makes it a pinch, not a pick-up.
    const pinch = (ev: PointerEvent) => ev.pointerId !== pointerId && clear();
    const wander = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > HOLD_PX) clear();
    };
    press.current = window.setTimeout(() => {
      clear();
      navigator.vibrate?.(10);
      begin();
    }, HOLD_MS);
    window.addEventListener("pointermove", wander);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("pointerdown", pinch);
  }

  return (
    <group name="bar-flowers">
      <primitive object={meshes.vases} />
      <primitive object={meshes.crowns} />
      {/* What the pointer grabs: a plain cone round each vase and its crown, never drawn, so a press
          between the petals still takes the vase and the crowns' many triangles are never tested. */}
      {([0, 1] as const).map((i) => {
        const [x, z] = barTopPlace(venue.data, shown[i]).point;
        return (
          <mesh
            key={i}
            geometry={grabGeo}
            position={[x, top, z]}
            visible={false}
            onPointerDown={(e) => onDown(e, i)}
            onPointerOver={(e) => {
              if (!editable) return;
              e.stopPropagation();
              document.body.style.cursor = "grab";
            }}
            onPointerOut={() => {
              if (!live) document.body.style.cursor = "";
            }}
          />
        );
      })}
    </group>
  );
}
