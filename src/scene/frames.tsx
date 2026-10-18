import { Mesh, MeshBasicMaterial, WebGLRenderTarget } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { viewStore } from "../state/view";
import { useStudio } from "./context";

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
export function Warmup() {
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
    // The scene is drawn into the effects' linear buffer, not the screen; compile for that target.
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
