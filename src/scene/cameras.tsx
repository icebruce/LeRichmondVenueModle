import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { type Polygon, type Vec2, pointInPolygon } from "../domain/geometry";
import { footprint, shapeOf } from "../domain/layout/items";
import type { CameraMode } from "../state/editor";
import { useEditor, useInteraction, useStudio } from "./context";
import { walkInput } from "./interaction";

export const EYE = 1.65;
const RADIUS = 0.28;
const SPEED = 2.2;

type Pose = { position: THREE.Vector3; target: THREE.Vector3 };

function presetPose(p: { position: readonly number[]; target: readonly number[] }): Pose {
  return {
    position: new THREE.Vector3(...(p.position as [number, number, number])),
    target: new THREE.Vector3(...(p.target as [number, number, number])),
  };
}

/** Requests from the UI: reset the current view (key = null) or jump to a named preset. */
export const cameraCommands = createStore<{ request: { key: string | null; n: number } }>(() => ({
  request: { key: null, n: 0 },
}));

export function requestCamera(key: string | null) {
  cameraCommands.setState((s) => ({ request: { key, n: s.request.n + 1 } }));
}

/** Whether a camera animation is running (read by walk controls and test hooks). */
export const rig = { tweening: false };

export function CameraRig() {
  const { venue } = useStudio();
  const mode = useEditor((s) => s.camera);
  const controlsEnabled = useInteraction((s) => s.controlsEnabled);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitImpl>(null);
  const tween = useRef<{ from: Pose; to: Pose; t: number; fov: [number, number] } | null>(null);
  const presets = venue.data.cameraPresets;

  const poses = useMemo(() => {
    const get = (k: string) => {
      const p = presets[k];
      if (!p) throw new Error(`Missing camera preset ${k}`);
      return p;
    };
    return { dollhouse: get("dollhouse"), plan: get("plan"), walk: get("walkStart") };
  }, [presets]);

  const goTo = (key: CameraMode | string) => {
    const p = key in poses ? poses[key as CameraMode] : presets[key];
    if (!p) return;
    const target = controls.current?.target ?? new THREE.Vector3();
    const to = presetPose(p);
    // Narrow (portrait) screens: pull overview cameras back so the whole room fits.
    const aspect = size.width / Math.max(1, size.height);
    if ((key === "dollhouse" || key === "plan") && aspect < 1.3) {
      const k = Math.pow(1.3 / aspect, 0.85);
      to.position.sub(to.target).multiplyScalar(k).add(to.target);
    }
    tween.current = {
      from: { position: camera.position.clone(), target: target.clone() },
      to,
      t: 0,
      fov: [camera.fov, p.fov],
    };
  };

  // Mode switch animates to that mode's starting pose (CAM-05).
  useEffect(() => {
    goTo(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(
    () =>
      cameraCommands.subscribe((s) => {
        goTo(s.request.key ?? mode);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  useFrame((_, dt) => {
    const tw = tween.current;
    rig.tweening = tw !== null;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / 0.6);
    const k = 1 - Math.pow(1 - tw.t, 3);
    camera.position.lerpVectors(tw.from.position, tw.to.position, k);
    const target = new THREE.Vector3().lerpVectors(tw.from.target, tw.to.target, k);
    camera.fov = tw.fov[0] + (tw.fov[1] - tw.fov[0]) * k;
    camera.updateProjectionMatrix();
    if (controls.current) controls.current.target.copy(target);
    camera.lookAt(target);
    if (tw.t >= 1) {
      tween.current = null;
      controls.current?.update();
    }
  });

  if (mode === "walk") return <WalkControls />;
  const plan = mode === "plan";
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={controlsEnabled}
      enableRotate={!plan}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={plan}
      minDistance={plan ? 8 : 6}
      maxDistance={plan ? 60 : 55}
      minPolarAngle={plan ? 0 : 0.25}
      maxPolarAngle={plan ? 0.0001 : 1.32}
      mouseButtons={
        plan ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined
      }
      touches={plan ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : undefined}
    />
  );
}

/** Eye-level walk: WASD/arrows + drag (or pointer lock) to look; touch joystick on phones (CAM-03). */
function WalkControls() {
  const { venue, catalog } = useStudio();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const items = useEditor((s) => s.scenarios[s.activeId]?.items ?? []);
  const look = useRef({ yaw: 0, pitch: 0, ready: false });
  const keys = useRef(new Set<string>());
  const input = useStore(walkInput);

  const blockers = useMemo<Polygon[]>(() => {
    const tables = items
      .map((it) => ({ it, s: shapeOf(it, catalog) }))
      .filter(({ s }) => s.kind !== "danceFloor")
      .map(({ it }) => footprint(it, catalog));
    return [...venue.obstacles.map((o) => o.polygon), ...tables];
  }, [items, venue, catalog]);

  const free = (p: Vec2) => {
    if (p[0] < RADIUS || p[1] < RADIUS || p[0] > venue.width - RADIUS || p[1] > venue.depth - RADIUS)
      return false;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const q: Vec2 = [p[0] + Math.cos(a) * RADIUS, p[1] + Math.sin(a) * RADIUS];
      if (blockers.some((b) => pointInPolygon(q, b))) return false;
    }
    return !blockers.some((b) => pointInPolygon(p, b));
  };

  useEffect(() => {
    const el = gl.domElement;
    let dragging: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY };
      if (e.pointerType === "mouse" && document.pointerLockElement !== el)
        el.requestPointerLock?.()?.catch?.(() => {});
    };
    const move = (e: PointerEvent) => {
      const locked = document.pointerLockElement === el;
      if (!locked && !dragging) return;
      const dx = locked ? e.movementX : e.clientX - (dragging?.x ?? e.clientX);
      const dy = locked ? e.movementY : e.clientY - (dragging?.y ?? e.clientY);
      if (dragging) dragging = { x: e.clientX, y: e.clientY };
      look.current.yaw -= dx * 0.004;
      look.current.pitch = Math.max(-1.1, Math.min(1.1, look.current.pitch - dy * 0.004));
    };
    const up = () => (dragging = null);
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      keys.current.add(e.key.toLowerCase());
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [gl]);

  useFrame((_, dt) => {
    const l = look.current;
    if (rig.tweening) {
      l.ready = false;
      return;
    }
    if (!l.ready) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      l.yaw = Math.atan2(-dir.x, -dir.z);
      l.pitch = 0;
      l.ready = true;
    }
    l.yaw -= input.look[0] * dt * 1.6;
    const k = keys.current;
    let fwd =
      input.move[1] + (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    let side =
      input.move[0] +
      (k.has("d") || k.has("arrowright") ? 1 : 0) -
      (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const mag = Math.hypot(fwd, side);
    if (mag > 1) {
      fwd /= mag;
      side /= mag;
    }
    const sin = Math.sin(l.yaw);
    const cos = Math.cos(l.yaw);
    const step = SPEED * dt;
    const dx = (-sin * fwd + cos * side) * step;
    const dz = (-cos * fwd - sin * side) * step;
    const p = camera.position;
    if (free([p.x + dx, p.z])) p.x += dx;
    if (free([p.x, p.z + dz])) p.z += dz;
    const onRaised = pointInPolygon([p.x, p.z], venue.raised.outline);
    const eye = EYE + (onRaised ? venue.raised.height : 0);
    p.y += (eye - p.y) * Math.min(1, dt * 8);
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");
  });
  return null;
}
