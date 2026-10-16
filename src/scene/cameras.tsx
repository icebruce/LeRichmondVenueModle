import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { useStore } from "zustand";
import { pointInPolygon } from "../domain/geometry";
import { walkArea } from "../domain/layout/walk";
import type { CameraMode } from "../state/editor";
import { cameraCommands, sharedPose, viewStore, walkInput } from "../state/view";
import { useEditor, useStudio, useView } from "./context";

export const EYE = 1.65;
const SPEED = 2.2;

type Pose = { position: THREE.Vector3; target: THREE.Vector3 };

function presetPose(p: { position: readonly number[]; target: readonly number[] }): Pose {
  return {
    position: new THREE.Vector3(...(p.position as [number, number, number])),
    target: new THREE.Vector3(...(p.target as [number, number, number])),
  };
}

/** Seated eye height (CAM-04). */
const SEAT_EYE = 1.2;

/** Whether a camera animation is running (read by walk controls and test hooks). */
export const rig = { tweening: false };

/** Side-by-side compare (SCN-06): this camera copies the main one every frame. */
function FollowCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    camera.position.set(...sharedPose.position);
    camera.quaternion.set(...sharedPose.quaternion);
    if (camera.fov !== sharedPose.fov) {
      camera.fov = sharedPose.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

export function CameraRig({ follow = false }: { follow?: boolean }) {
  if (follow) return <FollowCamera />;
  return <MainCamera />;
}

function MainCamera() {
  const { venue, catalog } = useStudio();
  const mode = useEditor((s) => s.camera);
  const controlsEnabled = useView((s) => s.controlsEnabled);
  const view = useView((s) => s.view);
  const insetRight = useView((s) => s.insetRight);
  const insetTop = useView((s) => s.insetTop);
  const insetBottom = useView((s) => s.insetBottom);
  const comparing = useView((s) => s.compare !== null);
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
    userMoved.current = false;
    const isMode = key in poses;
    const p = isMode ? poses[key as CameraMode] : presets[key];
    if (!p) return;
    // A named reference view is shown as a guest would see it: full walls, ceiling on (VEN-01).
    viewStore.setState({ view: isMode ? null : key });
    const target = controls.current?.target ?? new THREE.Vector3();
    // Sit here (CAM-04): seated eye height at the chosen chair, facing the table's centre.
    const seat = key === "walk" ? viewStore.getState().seat : null;
    const to = seat
      ? {
          position: new THREE.Vector3(seat.x, seat.y + SEAT_EYE, seat.z),
          target: new THREE.Vector3(seat.look[0], seat.y + SEAT_EYE - 0.35, seat.look[1]),
        }
      : presetPose(p);
    // Narrow screens, or a panel covering the right side: pull overview cameras back so the room fits.
    const flat = mode === "walk" || comparing;
    const visible = flat ? size.width : size.width - insetRight;
    // Phone: fit the band between the top bar and the sheet, not the whole screen.
    const band = flat ? size.height : size.height - insetTop - insetBottom;
    const aspect = visible / Math.max(1, band);
    if ((key === "dollhouse" || key === "plan") && aspect < 1.3) {
      const k = Math.pow(1.3 / aspect, aspect < 0.8 ? 1 : 0.85);
      to.position.sub(to.target).multiplyScalar(k).add(to.target);
    }
    tween.current = {
      from: { position: camera.position.clone(), target: target.clone() },
      to,
      t: 0,
      fov: [camera.fov, p.fov],
    };
  };

  // Mode switch, and starting or ending compare, animate to the mode's starting pose (CAM-05). A
  // change of the free area (a compare half settling, a phone sheet height) re-fits the room too,
  // unless the couple has moved the view since: their view is never thrown away.
  const pane = comparing ? `${size.width}x${size.height}` : "";
  const band = comparing ? "" : `${insetTop}:${insetBottom}`;
  const userMoved = useRef(false);
  const framed = useRef({ mode, comparing });
  useEffect(() => {
    const switched = framed.current.mode !== mode || framed.current.comparing !== comparing;
    framed.current = { mode, comparing };
    if (switched || !userMoved.current) goTo(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, comparing, pane, band]);

  // Sit here (CAM-04): picking a seat first brings the camera in over that table, so each chair
  // is a clear target; cancelling returns to the view the couple had.
  const pickSeat = useView((s) => s.pickSeat);
  const items = useEditor((s) => s.scenarios[s.activeId]?.items);
  const beforePick = useRef<Pose | null>(null);
  useEffect(() => {
    if (mode === "walk") return;
    const target = controls.current?.target ?? new THREE.Vector3();
    const from = { position: camera.position.clone(), target: target.clone() };
    const t = pickSeat ? items?.find((i) => i.id === pickSeat) : undefined;
    if (t) {
      beforePick.current ??= from;
      // Back from the table by its size, so its end chairs stay in view.
      const reach = 2.2 + Math.max(0, (footprintSize(t) - 2) * 0.6);
      tween.current = {
        from,
        to: {
          position: new THREE.Vector3(t.x + reach, reach * 1.5, t.z + reach),
          target: new THREE.Vector3(t.x, 0.6, t.z),
        },
        t: 0,
        fov: [camera.fov, camera.fov],
      };
    } else if (beforePick.current && !viewStore.getState().seat) {
      tween.current = { from, to: beforePick.current, t: 0, fov: [camera.fov, camera.fov] };
      beforePick.current = null;
    } else beforePick.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickSeat]);
  const footprintSize = (t: { libraryId: string; options: Record<string, unknown> }) => {
    const e = catalog.get(t.libraryId);
    const seats = Number(t.options.seats ?? 8);
    return e?.family === "table" ? Math.max(e.sizeM.w, seats * 0.35) : 2;
  };

  // Choosing a seat while already walking moves straight to it.
  const seat = useView((s) => s.seat);
  useEffect(() => {
    if (seat && mode === "walk") goTo("walk");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat]);

  useEffect(
    () =>
      cameraCommands.subscribe((s) => {
        goTo(s.request.key ?? mode);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  // Frame the room in the part of the screen the interface leaves free (DESIGN_GUIDE §3.1, §3.2):
  // shift the principal point by half the covered width (desktop panel) and height (phone top bar
  // and sheet), easing as they change. Zoom compensates so the room keeps its size on screen.
  const inset = useRef({ x: 0, y: 0 });
  useFrame((_, dt) => {
    const walk = mode === "walk";
    // Side by side, the halves already sit beside the interface and frame alike.
    const flat = walk || comparing;
    const want = { x: flat ? 0 : insetRight, y: flat ? 0 : insetBottom - insetTop };
    const ease = (from: number, to: number) =>
      Math.abs(to - from) < 0.5 ? to : from + (to - from) * Math.min(1, dt * 10);
    const next = { x: ease(inset.current.x, want.x), y: ease(inset.current.y, want.y) };
    const w = size.width;
    const h = Math.max(1, size.height);
    const fullW = w + next.x;
    const fullH = h + Math.abs(next.y);
    const aspect = fullW / fullH;
    const offset = next.x !== 0 || next.y !== 0;
    const same = next.x === inset.current.x && next.y === inset.current.y;
    if (same && camera.aspect === aspect && offset === !!camera.view?.enabled) return;
    inset.current = next;
    camera.aspect = aspect;
    camera.zoom = h / fullH;
    if (offset) camera.setViewOffset(fullW, fullH, next.x, next.y > 0 ? next.y : 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  });

  // Publish the pose for the side-by-side compare view.
  useFrame(() => {
    sharedPose.position = [camera.position.x, camera.position.y, camera.position.z];
    sharedPose.quaternion = [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ];
    sharedPose.fov = camera.fov;
  });

  // Keep the view's floor centre current, for "Add" (it places items where the couple is looking).
  useFrame(() => {
    const t = controls.current?.target;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const at: [number, number] =
      mode === "walk" || !t ? [camera.position.x + dir.x * 2.5, camera.position.z + dir.z * 2.5] : [t.x, t.z];
    const [fx, fz] = viewStore.getState().focus;
    if (Math.hypot(at[0] - fx, at[1] - fz) > 0.25) viewStore.setState({ focus: at });
  });

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
  // Reference views sit at eye level and close to their target; orbit limits would clamp them.
  const free = view !== null && !plan;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      onStart={() => (userMoved.current = true)}
      enabled={controlsEnabled}
      enableRotate={!plan}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={plan}
      minDistance={plan ? 8 : free ? 0.5 : 6}
      maxDistance={plan ? 120 : 110}
      minPolarAngle={plan ? 0 : free ? 0.05 : 0.25}
      maxPolarAngle={plan ? 0.0001 : free ? Math.PI - 0.15 : 1.32}
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
  const toggles = useEditor((s) => s.scenarios[s.activeId]?.venueToggles);
  const look = useRef({ yaw: 0, pitch: 0, ready: false });
  const seat = useView((s) => s.seat);
  const keys = useRef(new Set<string>());
  const input = useStore(walkInput);

  const free = useMemo(
    () => walkArea(venue, items, catalog, toggles ?? { communalTable: false, barStools: false }),
    [items, venue, catalog, toggles],
  );

  useEffect(() => {
    const el = gl.domElement;
    // One look pointer at a time, so the joystick thumb and a second finger never move the view.
    let dragging: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (dragging) return;
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // Seated is look-only: drag to look, so "Stand up" stays clickable (no pointer lock).
      if (viewStore.getState().seat) return;
      if (e.pointerType === "mouse" && document.pointerLockElement !== el)
        el.requestPointerLock?.()?.catch?.(() => {});
    };
    const move = (e: PointerEvent) => {
      const locked = document.pointerLockElement === el;
      let dx: number;
      let dy: number;
      if (locked && e.pointerType === "mouse") {
        dx = e.movementX;
        dy = e.movementY;
      } else if (dragging && e.pointerId === dragging.id) {
        dx = e.clientX - dragging.x;
        dy = e.clientY - dragging.y;
        dragging = { ...dragging, x: e.clientX, y: e.clientY };
      } else return;
      look.current.yaw -= dx * 0.004;
      look.current.pitch = Math.max(-1.1, Math.min(1.1, look.current.pitch - dy * 0.004));
    };
    const up = (e: PointerEvent) => {
      if (dragging?.id === e.pointerId) dragging = null;
    };
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      keys.current.add(e.key.toLowerCase());
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    // Keys released while another window had focus never send keyup; stop walking instead.
    const blur = () => {
      keys.current.clear();
      dragging = null;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
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
      l.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
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
    // Seated: look around, but stay in the chair.
    if (seat) fwd = side = 0;
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
    const eye = seat ? seat.y + SEAT_EYE : EYE + (onRaised ? venue.raised.height : 0);
    p.y += (eye - p.y) * Math.min(1, dt * 8);
    camera.rotation.set(l.pitch, l.yaw, 0, "YXZ");
  });
  return null;
}
