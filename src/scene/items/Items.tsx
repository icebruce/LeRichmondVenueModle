import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import {
  type Item,
  type Shape,
  chairsWorld,
  footprint,
  localFootprint,
  shapeOf,
} from "../../domain/layout/items";
import { checkPlacement, levelHeight, spotFor, toggledObstacles } from "../../domain/layout/validate";
import { tableLabels } from "../../domain/layout/counts";
import { snap } from "../../domain/geometry";
import type { Scenario } from "../../domain/scenario/schema";
import { GRID, ROTATE_STEP } from "../../state/editor";
import { useEditor, useInteraction, useStudio } from "../context";
import { interaction } from "../interaction";
import type { Materials } from "../materials";
import { cocktailCover, ovalBackChair, votive } from "./geometry";

const LINEN: Record<string, string> = { "linen-white": "#f7f6f2", "linen-ivory": "#eee3cb" };
const MAX_CHAIRS = 400;
const MAX_CANDLES = 300;

type Placed = { item: Item; shape: Shape; y: number; ok: boolean };

function usePlaced(scenario: Scenario): Placed[] {
  const { venue, catalog } = useStudio();
  return useMemo(() => {
    const extra = toggledObstacles(venue, scenario.venueToggles);
    return scenario.items.map((item) => {
      const r = checkPlacement(item, scenario.items, venue, catalog, extra);
      const level = r.ok ? r.level : (spotFor(item, venue)?.level ?? "main");
      return { item, shape: shapeOf(item, catalog), y: levelHeight(level, venue), ok: r.ok };
    });
  }, [scenario.items, scenario.venueToggles, venue, catalog]);
}

function TableBody({ shape, linen, m }: { shape: Shape; linen: THREE.Material; m: Materials }) {
  if (shape.kind === "rectTable") {
    if (shape.farm) {
      const legs = [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => [sx * (shape.length / 2 - 0.12), sz * (shape.width / 2 - 0.1)] as const),
      );
      return (
        <group>
          <mesh position={[0, 0.735, 0]} material={m.timber} castShadow receiveShadow>
            <boxGeometry args={[shape.length, 0.05, shape.width]} />
          </mesh>
          {legs.map(([x, z], i) => (
            <mesh key={i} position={[x, 0.355, z]} material={m.timber} castShadow>
              <boxGeometry args={[0.08, 0.71, 0.08]} />
            </mesh>
          ))}
        </group>
      );
    }
    return (
      <mesh position={[0, 0.3825, 0]} material={linen} castShadow receiveShadow>
        <boxGeometry args={[shape.length + 0.06, 0.765, shape.width + 0.06]} />
      </mesh>
    );
  }
  if (shape.kind === "roundTable") {
    const r = shape.diameter / 2;
    return (
      <mesh position={[0, 0.3825, 0]} material={linen} castShadow receiveShadow>
        <cylinderGeometry args={[r + 0.03, r + 0.07, 0.765, 48]} />
      </mesh>
    );
  }
  if (shape.kind === "cocktail") {
    return <mesh geometry={cocktailCover(shape.diameter / 2, shape.height)} material={linen} castShadow />;
  }
  if (shape.kind === "danceFloor") {
    const mat =
      shape.finish === "white" ? m.danceWhite : shape.finish === "black" ? m.danceBlack : m.danceWood;
    return (
      <group>
        <mesh position={[0, 0.0125, 0]} material={mat} receiveShadow>
          <boxGeometry args={[shape.width, 0.025, shape.depth]} />
        </mesh>
        <mesh position={[0, 0.006, 0]} material={m.brass}>
          <boxGeometry args={[shape.width + 0.05, 0.012, shape.depth + 0.05]} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.5, 0]} material={m.djFacade} castShadow>
        <boxGeometry args={[shape.width, 1.0, shape.depth]} />
      </mesh>
      <mesh position={[0, 1.02, -0.05]} material={m.blackMetal}>
        <boxGeometry args={[shape.width * 0.8, 0.05, shape.depth * 0.6]} />
      </mesh>
      <mesh position={[0, 0.5, shape.depth / 2 + 0.005]} material={m.brass}>
        <boxGeometry args={[shape.width, 0.04, 0.01]} />
      </mesh>
    </group>
  );
}

function candleSpots(shape: Shape): [number, number][] {
  if (shape.kind === "rectTable") {
    if (shape.seats <= 2)
      return [
        [-0.25, 0.05],
        [0.25, 0.05],
      ];
    const n = Math.max(3, Math.round(shape.length / 0.9));
    return Array.from({ length: n }, (_, i) => [
      -shape.length / 2 + (shape.length / n) * (i + 0.5),
      (i % 2) * 0.08 - 0.04,
    ]);
  }
  if (shape.kind === "roundTable")
    return [
      [0, 0.12],
      [0.1, -0.06],
      [-0.1, -0.06],
    ];
  if (shape.kind === "cocktail") return [[0, 0]];
  return [];
}

/** Every chair and votive in the scene as two instanced meshes each (budget: few draw calls). */
function ChairsAndCandles({ placed, m, evening }: { placed: Placed[]; m: Materials; evening: boolean }) {
  const drag = useInteraction((s) => s.drag);
  const chair = useMemo(() => ovalBackChair(), []);
  const cand = useMemo(() => votive(), []);
  const meshes = useMemo(
    () => ({
      frame: new THREE.InstancedMesh(chair.frame, m.chairFrame, MAX_CHAIRS),
      fabric: new THREE.InstancedMesh(chair.fabric, m.chairFabric, MAX_CHAIRS),
      glass: new THREE.InstancedMesh(cand.glass, m.glass, MAX_CANDLES),
      flame: new THREE.InstancedMesh(cand.flame, m.flame, MAX_CANDLES),
    }),
    [chair, cand, m],
  );
  useEffect(() => {
    meshes.frame.castShadow = meshes.fabric.castShadow = true;
    const t = new THREE.Object3D();
    let c = 0;
    let k = 0;
    for (const p of placed) {
      const d = drag?.ids.includes(p.item.id) ? drag : null;
      const item = d
        ? { ...p.item, x: p.item.x + d.dx, z: p.item.z + d.dz, rotY: p.item.rotY + d.dRot }
        : p.item;
      for (const ch of chairsWorld(item, p.shape)) {
        if (c >= MAX_CHAIRS) break;
        t.position.set(ch.x, p.y, ch.z);
        t.rotation.set(0, ch.rotY, 0);
        t.updateMatrix();
        meshes.frame.setMatrixAt(c, t.matrix);
        meshes.fabric.setMatrixAt(c, t.matrix);
        c++;
      }
      const top = p.shape.kind === "cocktail" ? p.shape.height : 0.765;
      const cos = Math.cos(item.rotY);
      const sin = Math.sin(item.rotY);
      for (const [lx, lz] of candleSpots(p.shape)) {
        if (k >= MAX_CANDLES) break;
        t.position.set(item.x + lx * cos + lz * sin, p.y + top, item.z - lx * sin + lz * cos);
        t.rotation.set(0, 0, 0);
        t.updateMatrix();
        meshes.glass.setMatrixAt(k, t.matrix);
        meshes.flame.setMatrixAt(k, t.matrix);
        k++;
      }
    }
    meshes.frame.count = meshes.fabric.count = c;
    meshes.glass.count = meshes.flame.count = k;
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [placed, drag, meshes]);
  return (
    <group name="chairs-and-candles">
      <primitive object={meshes.frame} />
      <primitive object={meshes.fabric} />
      <primitive object={meshes.glass} />
      {evening && <primitive object={meshes.flame} />}
    </group>
  );
}

function Outline({ item, valid, y }: { item: Item; valid: boolean; y: number }) {
  const { catalog } = useStudio();
  const pts = useMemo(() => {
    const fp = localFootprint(shapeOf(item, catalog));
    return [...fp, fp[0] as [number, number]].map(([x, z]) => new THREE.Vector3(x, y + 0.02, z));
  }, [item, catalog, y]);
  return <Line points={pts} color={valid ? "#c9a27f" : "#d9483b"} lineWidth={2.5} />;
}

function useFloorPointer() {
  const { camera, gl, raycaster } = useThree();
  return (clientX: number, clientY: number, y: number): THREE.Vector3 | null => {
    const r = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit);
  };
}

export function Items({ m, evening }: { m: Materials; evening: boolean }) {
  const { venue, catalog, editor } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const selection = useEditor((s) => s.selection);
  const camera = useEditor((s) => s.camera);
  const drag = useInteraction((s) => s.drag);
  const placed = usePlaced(scenario);
  const labels = useMemo(() => tableLabels(scenario.items, catalog), [scenario.items, catalog]);
  const toPlane = useFloorPointer();
  const press = useRef<{ x: number; y: number; timer: number | null; started: boolean } | null>(null);

  const linenMat = useMemo(() => {
    const color = LINEN[scenario.style.linen] ?? "#eee3cb";
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.82,
      sheen: 0.5,
      sheenColor: new THREE.Color("#ffffff"),
    });
  }, [scenario.style.linen]);

  function beginDrag(
    kind: "move" | "rotate",
    ids: string[],
    e: ThreeEvent<PointerEvent>,
    y: number,
    pivot: [number, number],
  ) {
    const start = toPlane(e.clientX, e.clientY, y);
    if (!start) return;
    const base = scenario.items.filter((i) => ids.includes(i.id));
    const a0 = Math.atan2(start.z - pivot[1], start.x - pivot[0]);
    interaction.setState({
      controlsEnabled: false,
      drag: { kind, ids, dx: 0, dz: 0, dRot: 0, valid: true, reason: null },
    });
    const snapping = editor.store.getState().snapping;
    const move = (ev: PointerEvent) => {
      const p = toPlane(ev.clientX, ev.clientY, y);
      if (!p) return;
      let dx = 0;
      let dz = 0;
      let dRot = 0;
      if (kind === "move") {
        const lead = base[0] as Item;
        dx = (snapping && !ev.altKey ? snap(lead.x + p.x - start.x, GRID) : lead.x + p.x - start.x) - lead.x;
        dz = (snapping && !ev.altKey ? snap(lead.z + p.z - start.z, GRID) : lead.z + p.z - start.z) - lead.z;
      } else {
        const a = Math.atan2(p.z - pivot[1], p.x - pivot[0]);
        dRot = -(a - a0);
        if (!ev.altKey) dRot = Math.round(dRot / ROTATE_STEP) * ROTATE_STEP;
      }
      const moved = base.map((b) => ({ ...b, x: b.x + dx, z: b.z + dz, rotY: b.rotY + dRot }));
      const others = [...scenario.items.filter((i) => !ids.includes(i.id)), ...moved];
      const extra = toggledObstacles(venue, scenario.venueToggles);
      const check = moved
        .map((it) => checkPlacement(it, others, venue, catalog, extra, labels))
        .find((r) => !r.ok);
      interaction.setState({
        drag: { kind, ids, dx, dz, dRot, valid: !check, reason: check && !check.ok ? check.reason : null },
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = interaction.getState().drag;
      interaction.setState({ drag: null, controlsEnabled: true });
      if (!d) return;
      if (d.kind === "move" && (Math.abs(d.dx) > 1e-3 || Math.abs(d.dz) > 1e-3)) {
        editor.moveItems(base.map((b) => ({ id: b.id, x: b.x + d.dx, z: b.z + d.dz })));
      } else if (d.kind === "rotate" && Math.abs(d.dRot) > 1e-3) {
        editor.rotateItems(ids, d.dRot);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onDown(e: ThreeEvent<PointerEvent>, p: Placed) {
    if (camera === "walk" || e.button > 0) return;
    e.stopPropagation();
    const id = p.item.id;
    const current = editor.store.getState().selection;
    const ids = e.shiftKey
      ? current.includes(id)
        ? current.filter((s) => s !== id)
        : [...current, id]
      : current.includes(id)
        ? current
        : [id];
    editor.select(ids);
    if (spotFor(p.item, venue)?.level === "mezzanine") return;
    const pivot: [number, number] = [p.item.x, p.item.z];
    if (e.pointerType === "touch") {
      // Long-press to pick up on touch, so one-finger drags still orbit the camera (DESIGN_GUIDE §3.2).
      const timer = window.setTimeout(() => {
        if (press.current && !press.current.started) {
          press.current.started = true;
          navigator.vibrate?.(10);
          beginDrag("move", ids, e, p.y, pivot);
        }
      }, 300);
      press.current = { x: e.clientX, y: e.clientY, timer, started: false };
      const cancel = (ev: PointerEvent) => {
        if (
          press.current &&
          Math.hypot(ev.clientX - press.current.x, ev.clientY - press.current.y) > 8 &&
          !press.current.started
        ) {
          window.clearTimeout(press.current.timer ?? 0);
          press.current = null;
        }
      };
      window.addEventListener("pointermove", cancel, { once: false });
      window.addEventListener(
        "pointerup",
        () => {
          window.removeEventListener("pointermove", cancel);
          if (press.current?.timer) window.clearTimeout(press.current.timer);
          press.current = null;
        },
        { once: true },
      );
      return;
    }
    beginDrag("move", ids, e, p.y, pivot);
  }

  const single = selection.length === 1 ? placed.find((p) => p.item.id === selection[0]) : undefined;
  const showLabels = camera === "plan";

  return (
    <group name="items">
      {placed.map((p) => {
        const d = drag?.ids.includes(p.item.id) ? drag : null;
        const moving = d !== null;
        const x = p.item.x + (d?.dx ?? 0);
        const z = p.item.z + (d?.dz ?? 0);
        const rotY = p.item.rotY + (d?.dRot ?? 0);
        const selected = selection.includes(p.item.id);
        return (
          <group
            key={p.item.id}
            position={[x, p.y, z]}
            rotation={[0, rotY, 0]}
            onPointerDown={(e) => onDown(e, p)}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (camera !== "walk") document.body.style.cursor = "grab";
            }}
            onPointerOut={() => (document.body.style.cursor = "")}
            name={`item-${p.item.id}`}
          >
            <TableBody shape={p.shape} linen={linenMat} m={m} />
            {(selected || moving) && <Outline item={p.item} valid={d ? d.valid : p.ok} y={0} />}
            {showLabels && labels.get(p.item.id) && (
              <Html center position={[0, 1.0, 0]} zIndexRange={[10, 0]} className="table-label">
                {labels.get(p.item.id)}
              </Html>
            )}
          </group>
        );
      })}
      <ChairsAndCandles placed={placed} m={m} evening={evening} />
      {single && camera !== "walk" && !spotFor(single.item, venue) && !drag && (
        <RotateHandle
          placed={single}
          onDown={(e) => beginDrag("rotate", [single.item.id], e, single.y, [single.item.x, single.item.z])}
        />
      )}
      {drag && !drag.valid && drag.reason && (
        <DragReason ids={drag.ids} reason={drag.reason} placed={placed} />
      )}
    </group>
  );
}

function RotateHandle({ placed, onDown }: { placed: Placed; onDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const { catalog } = useStudio();
  const reach = useMemo(
    () => Math.max(...footprint({ ...placed.item, x: 0, z: 0, rotY: 0 }, catalog).map(([x]) => x)) + 0.35,
    [placed, catalog],
  );
  const c = Math.cos(placed.item.rotY);
  const s = Math.sin(placed.item.rotY);
  return (
    <group position={[placed.item.x + reach * c, placed.y + 0.05, placed.item.z - reach * s]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDown(e);
        }}
        onPointerOver={() => (document.body.style.cursor = "alias")}
        onPointerOut={() => (document.body.style.cursor = "")}
        name="rotate-handle"
      >
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial color="#c9a27f" transparent opacity={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.08, 0.12, 24, 1, 0.4, Math.PI * 1.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function DragReason({ ids, reason, placed }: { ids: string[]; reason: string; placed: Placed[] }) {
  const drag = useInteraction((s) => s.drag);
  const p = placed.find((x) => x.item.id === ids[0]);
  if (!p || !drag) return null;
  return (
    <Html
      position={[p.item.x + drag.dx, p.y + 1.3, p.item.z + drag.dz]}
      center
      className="drag-reason"
      zIndexRange={[20, 10]}
    >
      {reason}
    </Html>
  );
}
