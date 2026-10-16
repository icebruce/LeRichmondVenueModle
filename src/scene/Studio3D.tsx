import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { wallFrame } from "../domain/venue/model";
import type { Scenario } from "../domain/scenario/schema";
import type { CameraMode } from "../state/editor";
import { requestCamera } from "../state/view";
import { CameraRig, rig } from "./cameras";
import { StudioContext, type Studio, useEditor, useStudio, useView } from "./context";
import { Items } from "./items/Items";
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
    return () => {
      if (w.__project === fn) delete w.__project;
    };
  }, [get]);
  return null;
}

function Scene({ quality }: { quality: Quality }) {
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
      <Furnishings
        venue={venue}
        m={m}
        communalTable={scenario.venueToggles.communalTable}
        art={mode !== "plan"}
      />
      <Openings venue={venue} m={m} evening={evening} cutWalls={cut} />
      {eyeLevel && <Backdrops venue={venue} m={m} evening={evening} />}
      {!cut.has("south") && <Mezzanine venue={venue} m={m} />}
      <Stair venue={venue} m={m} />
      {mode !== "plan" && <Lights venue={venue} m={m} pendants={showCeiling} />}
      <Ceiling venue={venue} m={m} showCeiling={showCeiling} />
      <Items m={m} evening={evening} quality={quality} />
      <People low={quality === "low"} />
      {mode !== "walk" && <Advisories />}
      <CameraRig />
      <TestHooks />
      <Effects evening={evening} quality={quality} />
    </>
  );
}

export function Studio3D({ studio, onReady }: { studio: Studio; onReady?: () => void }) {
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
      onPointerMissed={() => studio.editor.select([])}
      onCreated={() => onReady?.()}
      data-testid="studio-canvas"
    >
      <StudioContext.Provider value={studio}>
        <Suspense fallback={null}>
          <Scene quality={quality} />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
