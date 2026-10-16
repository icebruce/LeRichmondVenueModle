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
import { alignSnap } from "../../domain/layout/align";
import { checkPlacement, levelHeight, spotFor, toggledObstacles } from "../../domain/layout/validate";
import { tableLabels } from "../../domain/layout/counts";
import { type Polygon, centredRect, circle, snap } from "../../domain/geometry";
import type { Catalog } from "../../domain/library/catalog";
import type { Scenario } from "../../domain/scenario/schema";
import { GRID, ROTATE_STEP } from "../../state/editor";
import { type Drag, viewStore } from "../../state/view";
import { useEditor, useStudio, useView } from "../context";
import type { Materials } from "../materials";
import type { Quality } from "../quality";
import { cocktailCover, ovalBackChair, votive } from "./geometry";

const MAX_CHAIRS = 400;
const MAX_CANDLES = 300;
const TOP = 0.765;
const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
/** A lap-length cloth hangs this far below the table top (LIB-03). */
const LAP_DROP = 0.3;
/** Picked-up items float this much, so the drag reads as lifting (DESIGN_GUIDE §5). */
const LIFT = 0.02;

type Placed = { item: Item; shape: Shape; y: number; ok: boolean };

/** Colours come from the design tokens (tokens.css), so the 3D outline matches the interface. */
function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function linenColour(catalog: Catalog, id: string): string {
  const model = catalog.get(id)?.model;
  const c = model?.kind === "parametric" ? model.params.colour : undefined;
  return typeof c === "string" ? c : "#f2efe6";
}

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

function Legs({ pts, m }: { pts: [number, number][]; m: Materials }) {
  return (
    <>
      {pts.map(([x, z], i) => (
        <mesh key={i} position={[x, (TOP - 0.03) / 2, z]} material={m.blackMetal} castShadow>
          <cylinderGeometry args={[0.025, 0.025, TOP - 0.03, 8]} />
        </mesh>
      ))}
    </>
  );
}

function TableBody({
  shape,
  linen,
  lap,
  m,
  segments,
}: {
  shape: Shape;
  linen: THREE.Material;
  lap: boolean;
  m: Materials;
  segments: number;
}) {
  // Floor length reaches the floor; lap length stops LAP_DROP below the top and shows the legs.
  const clothH = lap ? LAP_DROP : TOP;
  const clothY = TOP - clothH / 2;
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
    const lx = shape.length / 2 - 0.1;
    const lz = shape.width / 2 - 0.1;
    return (
      <group>
        <mesh position={[0, clothY, 0]} material={linen} castShadow receiveShadow>
          <boxGeometry args={[shape.length + 0.06, clothH, shape.width + 0.06]} />
        </mesh>
        {lap && (
          <Legs
            pts={[
              [-lx, -lz],
              [lx, -lz],
              [-lx, lz],
              [lx, lz],
            ]}
            m={m}
          />
        )}
      </group>
    );
  }
  if (shape.kind === "roundTable") {
    const r = shape.diameter / 2;
    return (
      <group>
        <mesh position={[0, clothY, 0]} material={linen} castShadow receiveShadow>
          <cylinderGeometry args={[r + 0.03, r + (lap ? 0.05 : 0.07), clothH, segments]} />
        </mesh>
        {lap && (
          <mesh position={[0, (TOP - 0.03) / 2, 0]} material={m.blackMetal} castShadow>
            <cylinderGeometry args={[0.05, 0.05, TOP - 0.03, 8]} />
          </mesh>
        )}
      </group>
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

/** The item's own top edge and height, where the selection outline is drawn. */
function topOf(shape: Shape): { poly: Polygon; y: number } {
  switch (shape.kind) {
    case "rectTable":
      return { poly: centredRect(shape.length + 0.06, shape.width + 0.06), y: TOP + 0.01 };
    case "roundTable":
      return { poly: circle(shape.diameter / 2 + 0.03, 40), y: TOP + 0.01 };
    case "cocktail":
      return { poly: circle(shape.diameter / 2, 24), y: shape.height + 0.01 };
    case "danceFloor":
      return { poly: centredRect(shape.width + 0.05, shape.depth + 0.05), y: 0.035 };
    case "djBooth":
      return { poly: centredRect(shape.width, shape.depth), y: 1.06 };
  }
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

function moved(item: Item, d: Drag | null): Item {
  return d?.ids.includes(item.id)
    ? { ...item, x: item.x + d.dx, z: item.z + d.dz, rotY: item.rotY + d.dRot }
    : item;
}

/** Every chair and votive in the scene as two instanced meshes each (budget: few draw calls). */
function ChairsAndCandles({
  placed,
  m,
  evening,
  low,
}: {
  placed: Placed[];
  m: Materials;
  evening: boolean;
  low: boolean;
}) {
  const drag = useView((s) => s.drag);
  const chair = useMemo(() => ovalBackChair(low), [low]);
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
  useEffect(
    () => () => {
      for (const mesh of Object.values(meshes)) mesh.dispose();
      for (const g of [chair.frame, chair.fabric]) g.dispose();
    },
    [meshes, chair],
  );
  useEffect(() => {
    meshes.frame.castShadow = meshes.fabric.castShadow = true;
    const t = new THREE.Object3D();
    let c = 0;
    let k = 0;
    for (const p of placed) {
      const item = moved(p.item, drag);
      const lift = drag?.ids.includes(p.item.id) ? LIFT : 0;
      for (const ch of chairsWorld(item, p.shape)) {
        if (c >= MAX_CHAIRS) break;
        t.position.set(ch.x, p.y + lift, ch.z);
        t.rotation.set(0, ch.rotY, 0);
        t.updateMatrix();
        meshes.frame.setMatrixAt(c, t.matrix);
        meshes.fabric.setMatrixAt(c, t.matrix);
        c++;
      }
      const top = p.shape.kind === "cocktail" ? p.shape.height : TOP;
      const cos = Math.cos(item.rotY);
      const sin = Math.sin(item.rotY);
      for (const [lx, lz] of candleSpots(p.shape)) {
        if (k >= MAX_CANDLES) break;
        t.position.set(item.x + lx * cos + lz * sin, p.y + top + lift, item.z - lx * sin + lz * cos);
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

type Tone = "selected" | "hover" | "refused" | "ghost";

/**
 * Selection drawn on the item: its top edge in the accent colour, plus a soft fill over the floor
 * area it claims with its chairs (DESIGN_GUIDE §5). Refused moves use the blocked colour.
 */
function Outline({ shape, tone, dark }: { shape: Shape; tone: Tone; dark: boolean }) {
  // On the candlelit scene the accent is too dim to read; use its light variant there.
  const colours = useMemo(
    () => ({
      accent: dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b"),
      blocked: token("--blocked", "#c2412d"),
    }),
    [dark],
  );
  const colour = tone === "refused" ? colours.blocked : colours.accent;
  const { top, floor, fill } = useMemo(() => {
    const t = topOf(shape);
    const fp = localFootprint(shape);
    const ring = (poly: Polygon, y: number) =>
      [...poly, poly[0] as [number, number]].map(([x, z]) => new THREE.Vector3(x, y, z));
    const s = new THREE.Shape(fp.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.012, 0);
    return { top: ring(t.poly, t.y), floor: ring(fp, 0.014), fill: g };
  }, [shape]);
  useEffect(() => () => fill.dispose(), [fill]);
  const strong = tone === "selected" || tone === "refused";
  return (
    <group>
      {tone !== "ghost" && (
        <Line
          points={top}
          color={colour}
          lineWidth={strong ? 4 : 2}
          depthTest={false}
          renderOrder={11}
          transparent
          opacity={strong ? 1 : 0.7}
        />
      )}
      <Line
        points={floor}
        color={colour}
        lineWidth={tone === "ghost" ? 1.5 : 2}
        dashed={tone === "ghost"}
        dashSize={0.15}
        gapSize={0.1}
        depthTest={false}
        renderOrder={10}
        transparent
        opacity={tone === "hover" ? 0.5 : 0.9}
      />
      {tone !== "ghost" && tone !== "refused" && (
        <mesh geometry={fill} renderOrder={9}>
          <meshBasicMaterial color={colour} transparent opacity={strong ? 0.22 : 0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Alignment guides (LAY-05): a thin line across the room through the shared centre line. */
function Guides({ drag, y, dark }: { drag: Drag; y: number; dark: boolean }) {
  const { venue } = useStudio();
  const accent = useMemo(
    () => (dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b")),
    [dark],
  );
  return (
    <>
      {drag.guides.map((g, i) => (
        <Line
          key={i}
          points={
            g.axis === "x"
              ? [new THREE.Vector3(g.value, y + 0.02, 0), new THREE.Vector3(g.value, y + 0.02, venue.depth)]
              : [new THREE.Vector3(0, y + 0.02, g.value), new THREE.Vector3(venue.width, y + 0.02, g.value)]
          }
          color={accent}
          lineWidth={1.25}
          dashed
          dashSize={0.2}
          gapSize={0.12}
          depthTest={false}
          renderOrder={12}
          transparent
          opacity={0.85}
        />
      ))}
    </>
  );
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

export function Items({
  m,
  evening,
  quality = "high",
}: {
  m: Materials;
  evening: boolean;
  quality?: Quality;
}) {
  const { venue, catalog, editor } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const selection = useEditor((s) => s.selection);
  const camera = useEditor((s) => s.camera);
  const drag = useView((s) => s.drag);
  const hover = useView((s) => s.hover);
  const placed = usePlaced(scenario);
  const labels = useMemo(() => tableLabels(scenario.items, catalog), [scenario.items, catalog]);
  const toPlane = useFloorPointer();
  const getThree = useThree((s) => s.get);
  const press = useRef<{ x: number; y: number; timer: number | null; started: boolean } | null>(null);

  const colour = linenColour(catalog, scenario.style.linen);
  const lap = scenario.style.linenLength === "lap";
  const linenMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.82,
        sheen: 0.5,
        sheenColor: new THREE.Color("#ffffff"),
      }),
    [colour],
  );
  useEffect(() => () => linenMat.dispose(), [linenMat]);

  function setControls(enabled: boolean) {
    const controls = getThree().controls as { enabled?: boolean } | null;
    if (controls) controls.enabled = enabled;
    viewStore.setState({ controlsEnabled: enabled });
  }

  function beginDrag(
    kind: "move" | "rotate",
    ids: string[],
    e: ThreeEvent<PointerEvent>,
    y: number,
    pivot: [number, number],
  ) {
    const start = toPlane(e.clientX, e.clientY, y);
    if (!start) return;
    // Stop the camera controls from also handling this gesture (they listen on the same canvas).
    setControls(false);
    const pointerId = e.pointerId;
    const base = scenario.items.filter((i) => ids.includes(i.id));
    const others = scenario.items.filter((i) => !ids.includes(i.id));
    const a0 = Math.atan2(start.z - pivot[1], start.x - pivot[0]);
    const extra = toggledObstacles(venue, scenario.venueToggles);
    viewStore.setState({
      drag: { kind, ids, dx: 0, dz: 0, dRot: 0, valid: true, reason: null, guides: [] },
    });
    const snapping = editor.store.getState().snapping;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const p = toPlane(ev.clientX, ev.clientY, y);
      if (!p) return;
      let dx = 0;
      let dz = 0;
      let dRot = 0;
      let guides: Drag["guides"] = [];
      if (kind === "move") {
        const lead = base[0] as Item;
        const free = !snapping || ev.altKey;
        let x = lead.x + p.x - start.x;
        let z = lead.z + p.z - start.z;
        if (!free) {
          x = snap(x, GRID);
          z = snap(z, GRID);
          // Lining up with a nearby table wins over the grid on that axis (LAY-05).
          const a = alignSnap({ x: lead.x + p.x - start.x, z: lead.z + p.z - start.z }, others, catalog);
          if (a.guides.some((g) => g.axis === "x")) x = a.x;
          if (a.guides.some((g) => g.axis === "z")) z = a.z;
          guides = a.guides;
        }
        dx = x - lead.x;
        dz = z - lead.z;
      } else {
        const a = Math.atan2(p.z - pivot[1], p.x - pivot[0]);
        dRot = -(a - a0);
        if (!ev.altKey) dRot = Math.round(dRot / ROTATE_STEP) * ROTATE_STEP;
      }
      const next = base.map((b) => ({ ...b, x: b.x + dx, z: b.z + dz, rotY: b.rotY + dRot }));
      const all = [...others, ...next];
      const check = next
        .map((it) => checkPlacement(it, all, venue, catalog, extra, labels))
        .find((r) => !r.ok);
      viewStore.setState({
        drag: {
          kind,
          ids,
          dx,
          dz,
          dRot,
          valid: !check,
          reason: check && !check.ok ? check.reason : null,
          guides,
        },
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointerdown", second);
      setControls(true);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      const d = viewStore.getState().drag;
      viewStore.setState({ drag: null });
      if (!d) return;
      if (d.kind === "move" && (Math.abs(d.dx) > 1e-3 || Math.abs(d.dz) > 1e-3)) {
        editor.moveItems(base.map((b) => ({ id: b.id, x: b.x + d.dx, z: b.z + d.dz })));
      } else if (d.kind === "rotate" && Math.abs(d.dRot) > 1e-3) {
        editor.rotateItems(ids, d.dRot);
      }
    };
    // The system took the pointer, or a second finger started a pinch: drop the drag, move nothing.
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
      viewStore.setState({ drag: null });
    };
    const second = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) return;
      stop();
      viewStore.setState({ drag: null });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerdown", second);
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
      const pointerId = e.pointerId;
      const clear = () => {
        window.removeEventListener("pointermove", moveOff);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (press.current?.timer) window.clearTimeout(press.current.timer);
        press.current = null;
      };
      const moveOff = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || !press.current || press.current.started) return;
        if (Math.hypot(ev.clientX - press.current.x, ev.clientY - press.current.y) > 8) clear();
      };
      const end = (ev: PointerEvent) => ev.pointerId === pointerId && clear();
      const timer = window.setTimeout(() => {
        if (press.current && !press.current.started) {
          press.current.started = true;
          navigator.vibrate?.(10);
          beginDrag("move", ids, e, p.y, pivot);
        }
      }, 300);
      press.current = { x: e.clientX, y: e.clientY, timer, started: false };
      window.addEventListener("pointermove", moveOff);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      return;
    }
    beginDrag("move", ids, e, p.y, pivot);
  }

  const single = selection.length === 1 ? placed.find((p) => p.item.id === selection[0]) : undefined;
  const showLabels = camera === "plan";
  const segments = quality === "low" ? 24 : 48;

  return (
    <group name="items">
      {placed.map((p) => {
        const d = drag?.ids.includes(p.item.id) ? drag : null;
        const item = moved(p.item, d);
        const selected = selection.includes(p.item.id);
        const tone: Tone | null =
          d && !d.valid
            ? "refused"
            : selected || d
              ? "selected"
              : hover === p.item.id && camera !== "walk"
                ? "hover"
                : null;
        return (
          <group key={p.item.id}>
            {d && (
              <group position={[p.item.x, p.y, p.item.z]} rotation={[0, p.item.rotY, 0]}>
                <Outline shape={p.shape} tone="ghost" dark={evening} />
              </group>
            )}
            <group
              position={[item.x, p.y + (d ? LIFT : 0), item.z]}
              rotation={[0, item.rotY, 0]}
              onPointerDown={(e) => onDown(e, p)}
              onPointerOver={(e) => {
                e.stopPropagation();
                if (camera === "walk") return;
                document.body.style.cursor = "grab";
                viewStore.setState({ hover: p.item.id });
              }}
              onPointerOut={() => {
                document.body.style.cursor = "";
                if (viewStore.getState().hover === p.item.id) viewStore.setState({ hover: null });
              }}
              name={`item-${p.item.id}`}
            >
              <TableBody shape={p.shape} linen={linenMat} lap={lap} m={m} segments={segments} />
              {tone && camera !== "walk" && <Outline shape={p.shape} tone={tone} dark={evening} />}
              {showLabels && labels.get(p.item.id) && (
                <Html center position={[0, 1.0, 0]} zIndexRange={[10, 0]} className="table-label">
                  {labels.get(p.item.id)}
                </Html>
              )}
            </group>
          </group>
        );
      })}
      <ChairsAndCandles placed={placed} m={m} evening={evening} low={quality === "low"} />
      {/* Touch rotates with the inspector buttons; a 3D handle is too small a target there. */}
      {single && camera !== "walk" && !coarse && !spotFor(single.item, venue) && !drag && (
        <RotateHandle
          dark={evening}
          placed={single}
          onDown={(e) => beginDrag("rotate", [single.item.id], e, single.y, [single.item.x, single.item.z])}
        />
      )}
      {drag && (
        <Guides drag={drag} y={placed.find((p) => p.item.id === drag.ids[0])?.y ?? 0} dark={evening} />
      )}
      {drag && <DragLabel drag={drag} placed={placed} />}
    </group>
  );
}

function RotateHandle({
  placed,
  onDown,
  dark,
}: {
  placed: Placed;
  onDown: (e: ThreeEvent<PointerEvent>) => void;
  dark: boolean;
}) {
  const { catalog } = useStudio();
  const colours = useMemo(
    () => ({
      accent: dark ? token("--accent-on-dark", "#e7c9a5") : token("--accent", "#98775b"),
      mark: dark ? token("--ink", "#202522") : token("--on-dark", "#ffffff"),
    }),
    [dark],
  );
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
        renderOrder={12}
      >
        <circleGeometry args={[0.2, 24]} />
        <meshBasicMaterial color={colours.accent} transparent opacity={0.95} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={13}>
        <ringGeometry args={[0.08, 0.12, 24, 1, 0.4, Math.PI * 1.5]} />
        <meshBasicMaterial color={colours.mark} depthTest={false} transparent />
      </mesh>
    </group>
  );
}

/**
 * Live readout above the dragged item (DESIGN_GUIDE §5): the refusal reason when the move is
 * refused, else its distance from the glass-door and back-bar walls, or the angle while rotating.
 */
function DragLabel({ drag, placed }: { drag: Drag; placed: Placed[] }) {
  const p = placed.find((x) => x.item.id === drag.ids[0]);
  if (!p) return null;
  const x = p.item.x + drag.dx;
  const z = p.item.z + drag.dz;
  const deg = Math.round(((((p.item.rotY + drag.dRot) * 180) / Math.PI) % 360) + 360) % 360;
  const text =
    !drag.valid && drag.reason
      ? drag.reason
      : drag.kind === "rotate"
        ? `${deg}°`
        : `≈ ${x.toFixed(1)} m · ${z.toFixed(1)} m`;
  return (
    <Html
      position={[x, p.y + 0.2, z]}
      center
      className={drag.valid ? "drag-readout" : "drag-reason"}
      zIndexRange={[20, 10]}
    >
      {text}
    </Html>
  );
}
