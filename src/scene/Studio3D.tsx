import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { wallFrame } from "../domain/venue/model";
import { pointInPolygon } from "../domain/geometry";
import { footprint, shapeOf } from "../domain/layout/items";
import type { Scenario } from "../domain/scenario/schema";
import type { CameraMode } from "../state/editor";
import { LIBRARY_DRAG, requestCamera, viewStore } from "../state/view";
import { CameraRig, rig } from "./cameras";
import { StudioContext, type Studio, useEditor, useStudio, useView } from "./context";
import { Items, Outline, useFloorPointer } from "./items/Items";
import { People } from "./items/People";
import { Advisories } from "./items/Advisories";
import { useMaterials } from "./materials";
import { type Quality, detectQuality } from "./quality";
import { Bar, Ceiling, Floors, Mezzanine, Railing, Stair, Walls } from "./venue/Architecture";
import { BackBar, Backdrops, Furnishings, Lights, Openings } from "./venue/Fixtures";

type Cutaway = { cut: ReadonlySet<string>; below: boolean };

/**
 * Walls between the camera and the room are cut low in dollhouse view; all walls in plan view
 * (CAM-01). `below` is whether the camera is under the ceiling, which only then is drawn. A reference
 * view (VEN-01) cuts nothing.
 */
function useCutaway(mode: CameraMode, view: string | null): Cutaway {
  const { venue } = useStudio();
  const camera = useThree((s) => s.camera);
  const [state, setState] = useState<Cutaway>({ cut: new Set(), below: false });
  const key = useRef("");
  useFrame(() => {
    let ids: string[] = [];
    const below = camera.position.y < venue.ceiling - 0.2;
    if (mode === "plan") ids = venue.data.walls.map((w) => w.id);
    else if (mode === "dollhouse" && !view) {
      ids = venue.data.walls
        .filter((w) => {
          const { normal } = wallFrame(w);
          const dx = camera.position.x - w.from[0];
          const dz = camera.position.z - w.from[1];
          return dx * normal[0] + dz * normal[1] < 0;
        })
        .map((w) => w.id);
    }
    const k = `${ids.join(",")}|${below}`;
    if (k !== key.current) {
      key.current = k;
      setState({ cut: new Set(ids), below });
    }
  });
  return state;
}

function Lighting({ evening, quality, plan }: { evening: boolean; quality: Quality; plan: boolean }) {
  const { venue } = useStudio();
  const shadowSize = quality === "high" ? 2048 : 1024;
  const fixtures = venue.data.fixtures.chandeliers;
  const W = venue.width;
  const D = venue.depth;
  return (
    <>
      <hemisphereLight args={evening ? ["#6a5139", "#20170e", 0.75] : ["#e9eef2", "#a48d72", 1.25]} />
      <directionalLight
        position={evening ? [W / 2 + 4, 14, D / 2 - 6] : [-12, 13, D / 2 - 3]}
        intensity={evening ? 0.35 : 2.4}
        color={evening ? "#ffcf9a" : "#fff4e6"}
        // Plan view is flat and high-contrast: no shadows (DESIGN_GUIDE §9).
        castShadow={!plan}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={45}
      >
        <object3D attach="target" position={[W / 2, 0, D / 2]} />
      </directionalLight>
      {(quality === "high" ? fixtures : fixtures.slice(0, 2)).map((c, i) => (
        <pointLight
          key={i}
          position={[c.x, c.bottom + (c.kind === "brassCluster" ? 0.9 : 0.5), c.z]}
          intensity={(c.kind === "brassCluster" ? 26 : 9) * (evening ? 1 : 0.25)}
          distance={c.kind === "brassCluster" ? 14 : 8}
          decay={1.6}
          color="#ffbf7a"
        />
      ))}
      {evening && (
        <>
          <pointLight position={[8.4, 2.2, 1.6]} intensity={10} distance={7} decay={1.6} color="#ffb060" />
          <pointLight position={[13.5, 1.6, 6]} intensity={6} distance={9} decay={1.6} color="#ffb070" />
          <pointLight position={[3.5, 1.6, 6]} intensity={6} distance={9} decay={1.6} color="#ffb070" />
          <pointLight position={[5.6, 2, 11]} intensity={6} distance={8} decay={1.6} color="#ffb070" />
        </>
      )}
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={evening ? 0.6 : 2}
          color={evening ? "#ffb070" : "#ffffff"}
          position={[-6, 4, 7]}
          scale={[2, 6, 12]}
          rotation-y={Math.PI / 2}
        />
        <Lightformer
          form="rect"
          intensity={evening ? 0.3 : 1.2}
          color="#ffe2c0"
          position={[8, 9, 7]}
          scale={[14, 12, 1]}
          rotation-x={Math.PI / 2}
        />
      </Environment>
    </>
  );
}

function Effects({ evening, quality }: { evening: boolean; quality: Quality }) {
  if (quality === "low") {
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={evening ? 0.7 : 0.15} luminanceThreshold={0.9} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.7} intensity={evening ? 2.2 : 1.6} distanceFalloff={0.6} halfRes />
      <Bloom
        intensity={evening ? 0.75 : 0.15}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        mipmapBlur
      />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette darkness={evening ? 0.42 : 0.2} offset={0.3} />
    </EffectComposer>
  );
}

type ProjectFn = (x: number, y: number, z: number) => [number, number];

/** Test hook: screen position of a room point, from the live camera (Playwright drags with real pointers). */
function TestHooks() {
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  // Whole-frame totals across shadow, scene and effect passes, for the budget test (ARCHITECTURE §7).
  const frame = useRef({ calls: 0, triangles: 0 });
  useFrame(() => {
    frame.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    gl.info.reset();
  }, -100);
  useEffect(() => {
    gl.info.autoReset = false;
    (window as unknown as { __renderInfo?: () => typeof frame.current }).__renderInfo = () => frame.current;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useEffect(() => {
    const w = window as unknown as { __project?: ProjectFn };
    const fn: ProjectFn = (x, y, z) => {
      const { camera, size } = get();
      const v = new THREE.Vector3(x, y, z).project(camera);
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    };
    w.__project = fn;
    (window as unknown as { __rig?: typeof rig }).__rig = rig;
    (window as unknown as { __camera?: typeof requestCamera }).__camera = requestCamera;
    (window as unknown as { __pose?: () => number[] }).__pose = () => get().camera.position.toArray();
    (window as unknown as { __facing?: () => number[] }).__facing = () =>
      get().camera.getWorldDirection(new THREE.Vector3()).toArray();
    return () => {
      if (w.__project === fn) delete w.__project;
    };
  }, [get]);
  return null;
}

/** Desktop: a piece dragged from Add and dropped on the room is added where it lands (LAY-01). */
function LibraryDrop({ evening }: { evening: boolean }) {
  const { editor, venue, catalog } = useStudio();
  const el = useThree((s) => s.gl.domElement);
  const toFloor = useFloorPointer();
  const dropping = useView((s) => s.dropping);
  // Re-checked when the plan changes under a held drag.
  useEditor((s) => s.scenarios[s.activeId]?.items);
  useEffect(() => {
    // The floor under the cursor, on the raised level where that is what the cursor is over.
    const floorAt = (e: DragEvent): [number, number] | null => {
      const low = toFloor(e.clientX, e.clientY, 0);
      const high = toFloor(e.clientX, e.clientY, venue.raised.height);
      const hit = high && pointInPolygon([high.x, high.z], venue.raised.outline) ? high : low;
      return hit ? [hit.x, hit.z] : null;
    };
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(LIBRARY_DRAG)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const d = viewStore.getState().dropping;
      if (d) viewStore.setState({ dropping: { ...d, at: floorAt(e) } });
    };
    const leave = () => {
      const d = viewStore.getState().dropping;
      if (d) viewStore.setState({ dropping: { ...d, at: null } });
    };
    const drop = (e: DragEvent) => {
      const id = e.dataTransfer?.getData(LIBRARY_DRAG);
      if (!id) return;
      e.preventDefault();
      viewStore.setState({ dropping: null });
      const at = floorAt(e);
      if (at) editor.addItemAt(id, at);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [el, editor, venue, toFloor]);
  // Where it will land (DESIGN_GUIDE §5): its outline, or blocked with the reason; the drop agrees.
  if (!dropping?.at) return null;
  const { item, placed } = editor.dropPlacement(dropping.id, dropping.at);
  const y = placed.ok && placed.level === "raised" ? venue.raised.height : 0;
  return (
    <group name="drop-ghost" position={[item.x, y, item.z]}>
      <Outline shape={shapeOf(item, catalog)} tone={placed.ok ? "selected" : "refused"} dark={evening} />
      {!placed.ok && (
        <Html position={[0, 0.2, 0]} center className="drag-reason" zIndexRange={[20, 10]}>
          {placed.reason}
        </Html>
      )}
    </group>
  );
}

/**
 * Where the desktop selection toolbar sits (DESIGN_GUIDE §3.1, §4): the screen point just above the selected
 * items, written to the view store when it moves; null while dragging, walking or with nothing selected.
 */
function SelectionAnchor() {
  const { editor, catalog, venue } = useStudio();
  const get = useThree((s) => s.get);
  const point = useMemo(() => new THREE.Vector3(), []);
  const corner = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const s = editor.store.getState();
    const items = s.scenarios[s.activeId]?.items.filter((i) => s.selection.includes(i.id)) ?? [];
    let next: [number, number] | null = null;
    if (items.length && s.camera !== "walk" && !viewStore.getState().drag) {
      const x = items.reduce((a, i) => a + i.x, 0) / items.length;
      const z = items.reduce((a, i) => a + i.z, 0) / items.length;
      // Just above the tallest selected piece (a tall hanging light counts only up to 2.5 m, so the
      // toolbar stays near the floor plan), 15 cm clear of it.
      const top = Math.max(
        ...items.map(
          (i) =>
            (pointInPolygon([i.x, i.z], venue.raised.outline) ? venue.raised.height : 0) +
            Math.min(catalog.get(i.libraryId)?.sizeM.h ?? 1, 2.5),
        ),
      );
      const { camera, size } = get();
      point.set(x, top + 0.15, z).project(camera);
      if (Math.abs(point.z) < 1) {
        // Above the whole selection as drawn: the highest corner of its footprint on screen.
        let y = point.y;
        for (const i of items)
          for (const [cx, cz] of footprint(i, catalog))
            y = Math.max(y, corner.set(cx, top + 0.15, cz).project(camera).y);
        next = [((point.x + 1) / 2) * size.width, ((1 - y) / 2) * size.height];
      }
    }
    const prev = viewStore.getState().anchor;
    const moved = !prev || !next || Math.hypot(prev[0] - next[0], prev[1] - next[1]) > 0.5;
    if ((prev || next) && moved) viewStore.setState({ anchor: next });
  });
  return null;
}

function Scene({ quality, follow }: { quality: Quality; follow: boolean }) {
  const { venue } = useStudio();
  const m = useMaterials();
  const mode = useEditor((s) => s.camera);
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  // Plan view is always flat daylight for placing (DESIGN_GUIDE §9).
  const evening = scenario.style.lighting === "evening" && mode !== "plan";
  const view = useView((s) => s.view);
  const { cut, below } = useCutaway(mode, view);
  // The ceiling shows only from below it (walk, reference views, a dollhouse camera zoomed in low);
  // from above it would hide the room.
  const showCeiling = mode === "walk" || (mode === "dollhouse" && below);
  const eyeLevel = mode === "walk" || (view !== null && below);
  const background = useMemo(() => new THREE.Color(evening ? "#151715" : "#e8e6e0"), [evening]);
  return (
    <>
      <primitive attach="background" object={background} />
      <Lighting evening={evening} quality={quality} plan={mode === "plan"} />
      <Walls venue={venue} m={m} cutWalls={cut} />
      <Floors venue={venue} m={m} />
      <Railing venue={venue} m={m} />
      <Bar venue={venue} m={m} stools={scenario.venueToggles.barStools} />
      <BackBar venue={venue} m={m} />
      <Furnishings venue={venue} m={m} art={mode !== "plan"} choices={scenario.venueToggles.paintings} />
      <Openings venue={venue} m={m} evening={evening} cutWalls={cut} />
      {eyeLevel && <Backdrops venue={venue} m={m} evening={evening} />}
      {!cut.has("south") && <Mezzanine venue={venue} m={m} />}
      <Stair venue={venue} m={m} inRoom={cut.has("south")} />
      {mode !== "plan" && <Lights venue={venue} m={m} pendants={showCeiling} />}
      <Ceiling venue={venue} m={m} showCeiling={showCeiling} />
      <Items m={m} evening={evening} quality={quality} />
      <People low={quality === "low"} />
      {mode !== "walk" && <Advisories />}
      <CameraRig follow={follow} />
      {!follow && <TestHooks />}
      {!follow && <SelectionAnchor />}
      {!follow && <LibraryDrop evening={evening} />}
      <Effects evening={evening} quality={quality} />
    </>
  );
}

export function Studio3D({
  studio,
  onReady,
  follow = false,
}: {
  studio: Studio;
  onReady?: () => void;
  /** The side-by-side compare view: same camera as the main view, read-only (SCN-06). */
  follow?: boolean;
}) {
  const quality = useMemo(() => detectQuality(), []);
  const dollhouse = studio.venue.data.cameraPresets.dollhouse;
  return (
    <Canvas
      shadows
      dpr={quality === "high" ? [1, 2] : [1, 1.5]}
      gl={{
        antialias: false,
        toneMapping: THREE.NoToneMapping,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }}
      camera={{
        fov: dollhouse?.fov ?? 30,
        near: 0.1,
        far: 200,
        position: (dollhouse?.position ?? [26, 24, 30]) as [number, number, number],
      }}
      onPointerMissed={() => {
        if (follow) return;
        // A tap on empty floor deselects, and cancels choosing a seat (CAM-04).
        studio.editor.select([]);
        viewStore.setState({ pickSeat: null });
      }}
      onCreated={() => onReady?.()}
      data-testid={follow ? "compare-canvas" : "studio-canvas"}
    >
      <StudioContext.Provider value={studio}>
        <Suspense fallback={null}>
          <Scene quality={quality} follow={follow} />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
