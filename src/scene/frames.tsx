import {
  AgXToneMapping,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  type Object3D,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type AutoTier, type Tier, graphicsStore, isMotionFrame, perfStore } from "../state/graphics";
import { viewStore } from "../state/view";
import { useStudio } from "./context";
import { rememberAutoTier } from "./quality";

/** Shadow map redraws so far (test hook). */
export const shadowDraws = { n: 0 };

/**
 * The scene renders only when something changes (frameloop "demand"); these keep that cheap and
 * correct. Shadows come from one fixed light, so the shadow map depends on the room's contents, not
 * the camera: it is drawn again only when the plan, a drag, a light's height, the guests shown,
 * the set of objects (pieces that mount once their photo loads) or `signature` change, never while
 * the camera alone moves. `signature` carries the view state that shows or hides shadow casters (the
 * cut-away walls, the mode, the lighting): a new caster whose visibility depends on the view must
 * be added to it.
 */
export function StaticShadows({ signature }: { signature: string }) {
  const { editor } = useStudio();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const last = useRef<{ keys: unknown[]; objects: number } | null>(null);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(() => {
    const v = viewStore.getState();
    const e = editor.store.getState();
    const keys = [e.scenarios[e.activeId], v.drag, v.lift, v.showPeople, signature];
    let objects = 0;
    scene.traverse(() => void objects++);
    const prev = last.current;
    if (!prev || objects !== prev.objects || keys.some((k, i) => k !== prev.keys[i])) {
      gl.shadowMap.needsUpdate = true;
      shadowDraws.n++;
    }
    last.current = { keys, objects };
  });
  return null;
}

/**
 * Compiles every shader the scene can need, hidden parts included, once it has drawn, so the first
 * switch to another view or lighting does not stall on compiling; and draws a frame when the page
 * comes back from the background (an iPhone may have dropped the canvas contents meanwhile).
 */
export function Warmup({ direct }: { direct: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  // On the second frame: the environment map is drawn in the first, and shaders depend on it.
  const frame = useRef(0);
  useFrame(() => {
    frame.current++;
    if (frame.current === 1) invalidate();
    if (frame.current !== 2) return;
    // With effects the scene is drawn into their linear buffer, not the screen: compile for that.
    if (direct) return void gl.compile(scene, camera);
    const target = new WebGLRenderTarget(1, 1);
    const before = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.compile(scene, camera);
    gl.setRenderTarget(before);
    target.dispose();
  });
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [invalidate]);
  return null;
}

/**
 * Hidden objects that hold the shaders of things drawn only now and then (selection outlines and
 * fills, guides, dashed lines), so selecting, dragging or switching views never compiles one: they
 * are compiled with the scene by `Warmup` and kept while the scene lives.
 */
export function ShaderKeepers() {
  const objects = useMemo(() => {
    const dashed = new LineMaterial({ transparent: true });
    dashed.dashed = true;
    return [
      new Line2(new LineGeometry(), new LineMaterial({ transparent: true })),
      new Line2(new LineGeometry(), dashed),
      new Mesh(undefined, new MeshBasicMaterial({ transparent: true, depthWrite: false })),
    ];
  }, []);
  useEffect(
    () => () => {
      for (const o of objects) {
        o.geometry.dispose();
        o.material.dispose();
      }
    },
    [objects],
  );
  return (
    <group visible={false}>
      {objects.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </group>
  );
}

/** The view counts as still this long after its last frame. */
const STILL_MS = 150;

/**
 * The main view's frame clock, read by `Pacing`, `CappedRender` and `PerfProbe` in the same frame:
 * whether this display frame is drawn (Battery saver draws at most `fps` a second), the time since
 * the last drawn frame, and whether that counts as a frame of motion (`isMotionFrame`).
 */
const clock = { lastDrawn: 0, gap: Infinity, motion: false, skip: false, refine: false };

/** Runs first in every display frame of the main view. `fps` caps drawing only when it draws directly. */
export function FrameClock({ fps }: { fps: number }) {
  useFrame(() => {
    const now = performance.now();
    // A little early is fine: display frames land within a few ms of their slot.
    clock.skip = now - clock.lastDrawn < 1000 / fps - 4;
    if (clock.skip) return;
    const gap = now - clock.lastDrawn;
    clock.motion = isMotionFrame(clock.gap, gap, clock.refine);
    clock.gap = gap;
    clock.lastDrawn = now;
    clock.refine = false;
  }, -300);
  return null;
}

/**
 * Moving and still (Graphics tiers): while frames of motion follow each other the view is moving
 * (`graphicsStore.moving`: the tier's moving resolution, no still-only effects); once they stop, one
 * full-quality frame is drawn. Under Auto, motion frames feed `auto`, and a tier change it asks for
 * is applied only once the view is still.
 */
export function Pacing({
  tier,
  auto,
  onTier,
}: {
  tier: Tier;
  auto: AutoTier | null;
  onTier: (t: Tier) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useFrame(() => {
    if (clock.skip) return;
    const wanted = clock.motion && auto ? auto.frame(clock.gap) : tier;
    const moving = graphicsStore.getState().moving;
    if (clock.motion && !moving) graphicsStore.setState({ moving: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const g = graphicsStore.getState();
      if (g.hold || (!g.moving && wanted === tier)) return;
      graphicsStore.setState({ moving: false });
      if (wanted !== tier) {
        rememberAutoTier(wanted);
        onTier(wanted);
      }
      // The full-quality frame: not a frame of motion.
      clock.refine = true;
      invalidate();
    }, STILL_MS);
  }, -200);
  return null;
}

/**
 * Tiers that draw directly (Battery saver) draw the scene themselves, without effects (the renderer
 * tone-maps instead), only in the display frames `FrameClock` keeps: a frame asked for sooner is put
 * off to the next display frame, so the last change is always drawn.
 */
export function DirectRender() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.autoClear = true;
    gl.toneMapping = AgXToneMapping;
    return () => {
      gl.toneMapping = NoToneMapping;
    };
  }, [gl]);
  useFrame(({ scene, camera, invalidate }) => {
    if (clock.skip) return void invalidate();
    gl.render(scene, camera);
  }, 1);
  return null;
}

/** Frames kept for the `?perf` statistics. */
const KEEP = 600;

/**
 * `?perf` (V0): times between drawn frames of motion (`isMotionFrame`: a freeze inside a gesture
 * counts, the pause between gestures and the still frame do not), the last frame's draw calls and
 * triangles, and a GPU memory estimate.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const state = useRef({ pushed: 0, gaps: [] as number[], calls: 0, triangles: 0 });
  const trailing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const id = setInterval(() => perfStore.setState({ gpuBytes: gpuBytes(gl, scene) }), 2000);
    return () => {
      clearInterval(id);
      clearTimeout(trailing.current);
    };
  }, [gl, scene]);
  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    if (clock.motion && !clock.skip) {
      s.gaps.push(clock.gap);
      if (s.gaps.length > KEEP) s.gaps.shift();
    }
    // The previous frame's totals (reset just after, by the test hooks); skipped display frames
    // draw nothing.
    if (gl.info.render.calls) {
      s.calls = gl.info.render.calls;
      s.triangles = gl.info.render.triangles;
    }
    const push = () => {
      s.pushed = performance.now();
      const el = gl.domElement;
      perfStore.setState({
        gaps: [...s.gaps],
        calls: s.calls,
        triangles: s.triangles,
        dpr: gl.getPixelRatio(),
        size: [el.width, el.height],
      });
    };
    clearTimeout(trailing.current);
    if (now - s.pushed > 500) push();
    else trailing.current = setTimeout(push, 600);
  }, -101);
  return null;
}

/** GPU memory estimate: unique buffers and textures in the scene, the shadow map, frame buffers. */
function gpuBytes(gl: WebGLRenderer, scene: Object3D): number {
  const buffers = new Set<ArrayBufferLike>();
  const textures = new Set<Texture>();
  let bytes = 0;
  const addAttr = (a: BufferAttribute | InterleavedBufferAttribute | null | undefined) => {
    const arr = a && ("data" in a && a.data ? a.data.array : (a as BufferAttribute).array);
    if (arr && !buffers.has(arr.buffer)) {
      buffers.add(arr.buffer);
      bytes += arr.byteLength;
    }
  };
  scene.traverse((o) => {
    const m = o as Mesh & { instanceMatrix?: BufferAttribute; instanceColor?: BufferAttribute | null };
    if (m.geometry) {
      for (const a of Object.values(m.geometry.attributes)) addAttr(a);
      addAttr(m.geometry.index);
    }
    addAttr(m.instanceMatrix);
    addAttr(m.instanceColor);
    for (const mat of m.material ? [m.material].flat() : [])
      for (const v of Object.values(mat)) if ((v as Texture | null)?.isTexture) textures.add(v as Texture);
    const shadow = (o as { shadow?: { map?: { width: number; height: number } | null } }).shadow?.map;
    if (shadow) bytes += shadow.width * shadow.height * 4;
  });
  for (const t of textures) {
    const img = t.image as { width?: number; height?: number } | undefined;
    // RGBA with mipmaps.
    if (img?.width && img.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 4 / 3 : 1);
  }
  // The canvas (colour and depth) and the effects' half-float buffers.
  const px = gl.domElement.width * gl.domElement.height;
  return bytes + px * 8 + (gl.toneMapping === NoToneMapping ? px * 8 * 3 : 0);
}
