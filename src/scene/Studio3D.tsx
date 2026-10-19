import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, advance, invalidate, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { wallFrame } from "../domain/venue/model";
import { hangingLight } from "../domain/library/catalog";
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
import {
  DirectRender,
  FrameClock,
  Pacing,
  PerfProbe,
  ShaderKeepers,
  StaticShadows,
  Warmup,
  shadowDraws,
  uncapNextFrame,
} from "./frames";
import { BACKDROP, BRICK_TINT, LED_GLOW, useMaterials } from "./materials";
import { gradientTexture } from "./textures";
import { BakeExport } from "./BakeExport";
import { useBake } from "./useBake";

/** `?bake-export`: the bake tool's export of the fixed room (visual stage V2, `npm run bake`). */
const BAKE_EXPORT = new URLSearchParams(window.location.search).has("bake-export");
import { type Quality, detectQuality, rememberTierChoice, rememberedAutoTier, tierChoice } from "./quality";
import {
  type AutoTier,
  LEVERS,
  type Tier,
  type TierChoice,
  autoFor,
  graphicsStore,
  tierChoices,
} from "../state/graphics";
import { useStore } from "zustand";
import { Bar, Ceiling, Floors, Mezzanine, Plinth, Railing, Stair, Walls } from "./venue/Architecture";
import { BackBar, BackBarBottles, Backdrops, Furnishings, Lights, Openings } from "./venue/Fixtures";
import { StaticMerge } from "./venue/merge";
import { BarFlowers } from "./venue/BarFlowers";

/** The hidden performance overlay is on (`?perf`, V0). */
const PERF = new URLSearchParams(window.location.search).has("perf");

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

/**
 * The live lights. Their number and which of them cast shadows never change with the view or the
 * lighting (a change would recompile every shader, the lag on a switch): lights a mode does not use
 * are dimmed to zero instead of removed, and plan view hides its shadow instead of dropping it.
 */
function Lighting({
  evening,
  quality,
  tier,
  plan,
}: {
  evening: boolean;
  quality: Quality;
  tier: Tier;
  plan: boolean;
}) {
  const { venue } = useStudio();
  const shadowSize = LEVERS[tier].shadow;
  const fixtures = venue.data.fixtures.chandeliers;
  const W = venue.width;
  const D = venue.depth;
  const glow = evening ? 1 : 0;
  return (
    <>
      {/* Evening warmth kept calm, so white linen reads white or ivory, not beige (V2 colour check). */}
      <hemisphereLight args={evening ? ["#615a50", "#1f1b16", 0.75] : ["#e9eef2", "#a48d72", 1.25]} />
      <directionalLight
        // A new tier's shadow size needs a new shadow map.
        key={shadowSize}
        // Evening: a warm light from nearly overhead, standing in for the chandeliers and track
        // spots, so the bar and tables cast their shadows straight down (R06, R08).
        position={evening ? [W / 2 + 1.5, 14, D / 2 - 1.5] : [-12, 13, D / 2 - 3]}
        intensity={evening ? 1.1 : 2.4}
        color={evening ? "#ffdfc0" : "#fff4e6"}
        castShadow={shadowSize > 0}
        // Plan view is flat and high-contrast: no shadows (DESIGN_GUIDE §9).
        shadow-intensity={plan ? 0 : 1}
        shadow-mapSize={[shadowSize || 1, shadowSize || 1]}
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
          color="#ffdcb8"
        />
      ))}
      {/* The back bar's glow, under its canopy (R01, R03). */}
      <pointLight
        position={[8.1, 2.3, venue.data.backBar.rect.value[1] + 0.4]}
        intensity={16 * glow}
        distance={7}
        decay={1.6}
        color="#ffc98e"
      />
      <pointLight position={[13.5, 1.6, 6]} intensity={6 * glow} distance={9} decay={1.6} color="#ffd0a0" />
      <pointLight position={[3.5, 1.6, 6]} intensity={6 * glow} distance={9} decay={1.6} color="#ffd0a0" />
      <pointLight position={[5.6, 2, 11]} intensity={6 * glow} distance={8} decay={1.6} color="#ffd0a0" />
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={evening ? 0.6 : 2}
          color={evening ? "#ffd6b0" : "#ffffff"}
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

/**
 * Effects per tier (Graphics tiers): ambient occlusion live on High, only in the still frame on
 * Balanced. Battery saver has none and draws directly
 * (`DirectRender`). The look (bloom strength, vignette) follows the device, as before tiers, so a
 * tier change never changes it.
 */
function Effects({ evening, tier, quality }: { evening: boolean; tier: Tier; quality: Quality }) {
  const levers = LEVERS[tier];
  const moving = useStore(graphicsStore, (s) => s.moving);
  if (levers.direct) return null;
  const high = quality === "high";
  // High draws its ambient occlusion at full resolution and smooths edges (V2b: the setting shows on
  // a still picture, not only in motion); changing either rebuilds the effect passes once.
  const best = tier === "high" && high;
  return (
    <EffectComposer multisampling={best ? 4 : 0}>
      <N8AO
        enabled={levers.ao === "live" || !moving}
        aoRadius={0.55}
        intensity={evening ? 3.2 : 2.2}
        distanceFalloff={0.6}
        halfRes={!best}
      />
      <Bloom
        intensity={evening ? (high ? 0.75 : 0.7) : 0.15}
        luminanceThreshold={high ? 0.85 : 0.9}
        luminanceSmoothing={high ? 0.2 : 0.03}
        mipmapBlur
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette darkness={evening ? 0.42 : 0.2} offset={0.3} opacity={high ? 1 : 0} />
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
  const worst = useRef({ calls: 0, triangles: 0 });
  const frames = useRef(0);
  useFrame(() => {
    // Battery saver skips display frames between its drawn ones: keep the last drawn frame's totals.
    if (gl.info.render.calls) {
      frame.current = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
      if (frame.current.calls > worst.current.calls) worst.current = frame.current;
    }
    frames.current++;
    gl.info.reset();
  }, -100);
  useEffect(() => {
    gl.info.autoReset = false;
    (window as unknown as { __renderInfo?: () => typeof frame.current }).__renderInfo = () => frame.current;
    // Frames drawn so far, and the ids of the compiled shader programs: a new id means a compile.
    (window as unknown as { __frames?: () => number }).__frames = () => frames.current;
    (window as unknown as { __shadowDraws?: () => number }).__shadowDraws = () => shadowDraws.n;
    (window as unknown as { __holdMotion?: () => void }).__holdMotion = () =>
      graphicsStore.setState({ moving: true, hold: true });
    // For the budget test: forgets earlier frames, then draws a full frame (shadow pass included)
    // and one more, whose start records it; `__worstFrame` is the largest frame since. Drawn at
    // once rather than on the next animation frames, which a software GPU on CI can hold up for
    // minutes.
    (window as unknown as { __redraw?: () => void }).__redraw = () => {
      worst.current = { calls: 0, triangles: 0 };
      gl.info.reset();
      gl.shadowMap.needsUpdate = true;
      for (let i = 0; i < 2; i++) {
        uncapNextFrame();
        advance(performance.now(), true, get());
      }
    };
    (window as unknown as { __worstFrame?: () => typeof worst.current }).__worstFrame = () => worst.current;
    (window as unknown as { __programs?: () => number[] }).__programs = () =>
      (gl.info.programs ?? []).map((p) => p.id);
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl, get]);
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
    if (items.length && s.camera !== "walk" && !viewStore.getState().drag && !viewStore.getState().lift) {
      const x = items.reduce((a, i) => a + i.x, 0) / items.length;
      const z = items.reduce((a, i) => a + i.z, 0) / items.length;
      // Just above the tallest selected piece, 15 cm clear of it: a tall piece counts only up to
      // 2.5 m, so the toolbar stays near the floor plan, but a light with a height clears the whole
      // light above its grip (its drawn top).
      const top = Math.max(
        ...items.map((i) => {
          const e = catalog.get(i.libraryId);
          const shape = e && hangingLight(e) ? shapeOf(i, catalog) : null;
          const h = shape?.kind === "piece" ? shape.height : Math.min(e?.sizeM.h ?? 1, 2.5);
          return (pointInPolygon([i.x, i.z], venue.raised.outline) ? venue.raised.height : 0) + h;
        }),
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

function Scene({
  quality,
  tier,
  follow,
  auto,
  onTier,
}: {
  quality: Quality;
  tier: Tier;
  follow: boolean;
  auto: AutoTier | null;
  onTier: (t: Tier) => void;
}) {
  const { venue, bake: manifest } = useStudio();
  const m = useMaterials(quality);
  const mode = useEditor((s) => s.camera);
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  // Plan view is always flat daylight for placing (DESIGN_GUIDE §9).
  const evening = scenario.style.lighting === "evening" && mode !== "plan";
  const bake = useBake(venue, manifest, m, quality, evening, mode === "plan");
  const view = useView((s) => s.view);
  const { cut, below } = useCutaway(mode, view);
  // The ceiling shows only from below it (walk, reference views, a dollhouse camera zoomed in low);
  // from above it would hide the room.
  const showCeiling = mode === "walk" || (mode === "dollhouse" && below);
  const eyeLevel = mode === "walk" || (view !== null && below);
  // A smooth gradient behind the model: warm grey in daylight, deep charcoal in the evening (§9).
  const backgrounds = useMemo(
    () => ({
      day: gradientTexture(...BACKDROP.day.colors),
      evening: gradientTexture(...BACKDROP.evening.colors),
    }),
    [],
  );
  const background = evening ? backgrounds.evening : backgrounds.day;
  // The stair's LED treads glow and the caps lift in the evening only, and the backdrop brightens
  // in daylight (uniform changes: no new shader).
  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    m.led.emissiveIntensity = evening ? LED_GLOW : 0;
    m.cap.emissiveIntensity = evening ? 0.12 : 0;
    for (const brick of [m.brick, bake?.materials.brick])
      (brick as THREE.MeshStandardMaterial | undefined)?.color.set(
        evening ? BRICK_TINT.evening : BRICK_TINT.day,
      );
    // Street sheers at night are lit only from inside: dimmer.
    m.sheer.opacity = evening ? 0.1 : 0.2;
    scene.backgroundIntensity = (evening ? BACKDROP.evening : BACKDROP.day).intensity;
    invalidate();
  }, [m, bake, scene, evening, invalidate]);
  return (
    <>
      <primitive attach="background" object={background} />
      <Lighting evening={evening} quality={quality} tier={tier} plan={mode === "plan"} />
      <Walls venue={venue} m={m} cutWalls={cut} bake={bake} />
      {/* The parts that never change with the camera, one mesh per material. */}
      <StaticMerge
        version={`${scenario.venueToggles.barStools}|${mode === "plan"}|${JSON.stringify(scenario.venueToggles.paintings)}`}
      >
        <Floors venue={venue} m={m} bake={bake} />
        <Railing venue={venue} m={m} />
        <Bar venue={venue} m={m} stools={scenario.venueToggles.barStools} />
        <BackBar venue={venue} m={m} />
        <Furnishings venue={venue} m={m} art={mode !== "plan"} choices={scenario.venueToggles.paintings} />
      </StaticMerge>
      <BackBarBottles venue={venue} />
      {scenario.venueToggles.barFlowers.shown && (
        <BarFlowers venue={venue} m={m} at={scenario.venueToggles.barFlowers.at} />
      )}
      <Openings venue={venue} m={m} evening={evening} cutWalls={cut} />
      <group visible={mode !== "plan"}>
        <Plinth venue={venue} m={m} />
      </group>
      {/* Parts a view does not show are hidden, not unmounted: showing them never compiles a shader. */}
      <group visible={eyeLevel}>
        <Backdrops venue={venue} m={m} evening={evening} />
      </group>
      <group visible={!cut.has("south")}>
        <Mezzanine venue={venue} m={m} bake={bake} />
      </group>
      <Stair venue={venue} m={m} inRoom={cut.has("south")} />
      <group visible={mode !== "plan"}>
        <Lights venue={venue} m={m} pendants={showCeiling} />
      </group>
      <Ceiling venue={venue} m={m} showCeiling={showCeiling} bake={bake} />
      <Items m={m} evening={evening} quality={quality} />
      {BAKE_EXPORT && <BakeExport m={m} />}
      <People low={quality === "low"} m={m} />
      <Advisories hidden={mode === "walk"} />
      <ShaderKeepers />
      <StaticShadows signature={`${[...cut].join(",")}|${evening}|${mode}|${LEVERS[tier].shadow}`} />
      <CameraRig follow={follow} />
      {!follow && <TestHooks />}
      {!follow && PERF && <PerfProbe />}
      {!follow && <SelectionAnchor />}
      {!follow && <LibraryDrop evening={evening} />}
      <Effects evening={evening} tier={tier} quality={quality} />
      {LEVERS[tier].direct && <DirectRender />}
      {/* The main view keeps time and paces; the compare halves follow its camera. */}
      {!follow && <FrameClock fps={LEVERS[tier].direct ? LEVERS[tier].fps : Infinity} />}
      {!follow && <Pacing tier={tier} auto={auto} onTier={onTier} />}
      {/* Again after a tier change, whose effects and shadows need other shaders. */}
      <Warmup key={tier} direct={LEVERS[tier].direct} />
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
  const phone = quality === "low";
  // The compare halves draw at Balanced; the main view follows the couple's choice, Auto by default.
  // Auto keeps watching whatever the choice, so a choice above what it settled on can say so.
  const auto = useMemo(() => (follow ? null : autoFor(phone, rememberedAutoTier())), [follow, phone]);
  const [autoTier, setAutoTier] = useState<Tier>(() => auto?.tier ?? "balanced");
  // A saved choice this device does not offer (Battery saver off a phone) falls back to Auto.
  const [choice, setChoice] = useState<TierChoice>(() => {
    const saved = follow ? "auto" : tierChoice();
    return tierChoices(phone).includes(saved) ? saved : "auto";
  });
  // The setting (Room › This device › Graphics) writes the store; the choice is kept on this device.
  useEffect(() => {
    if (follow) return;
    return graphicsStore.subscribe((g) => {
      if (g.choice === choice) return;
      rememberTierChoice(g.choice);
      setChoice(g.choice);
    });
  }, [follow, choice]);
  const tier: Tier = follow ? "balanced" : choice === "auto" ? autoTier : choice;
  useEffect(() => {
    // A new tier is drawn at once (its shadows too), not at the next change.
    invalidate();
    if (follow) return;
    graphicsStore.setState({ choice, tier, autoTier, phone });
    // Test hook: a tier change as Auto makes it.
    (window as unknown as { __setTier?: (t: Tier) => void }).__setTier = setAutoTier;
  }, [follow, choice, tier, autoTier, phone]);
  // Lower resolution while the main view moves (the compare halves draw at Balanced's moving one).
  const moving = useStore(graphicsStore, (s) => s.moving);
  const dpr = LEVERS[tier].dpr;
  const dollhouse = studio.venue.data.cameraPresets.dollhouse;
  return (
    <Canvas
      // Frames are drawn only when something changes: nothing renders while the view is still.
      frameloop="demand"
      // PCF: three dropped soft PCF and falls back to it anyway; naming it keeps shaders compiled ahead valid.
      shadows="percentage"
      dpr={[1, follow ? dpr.moving : moving ? dpr.moving : dpr.still]}
      gl={{
        antialias: false,
        toneMapping: THREE.NoToneMapping,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }}
      camera={{
        fov: dollhouse?.fov ?? 20,
        near: 0.1,
        far: 400,
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
          <Scene
            quality={quality}
            tier={tier}
            follow={follow}
            auto={choice === "auto" ? auto : null}
            onTier={setAutoTier}
          />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
