import { WebGLRenderTarget } from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { viewStore } from "../state/view";
import { useStudio } from "./context";

/**
 * The scene renders only when something changes (frameloop "demand"); these keep that cheap and
 * correct. Shadows come from one fixed light, so the shadow map depends on the room's contents, not
 * the camera: it is drawn again only when the plan, a drag, the guests, the cut-away walls
 * (`signature`) or the set of objects change, never while the camera alone moves.
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
    const keys = [editor.store.getState(), v.drag, v.lift, v.showPeople, signature];
    let objects = 0;
    scene.traverse(() => void objects++);
    const prev = last.current;
    if (!prev || objects !== prev.objects || keys.some((k, i) => k !== prev.keys[i]))
      gl.shadowMap.needsUpdate = true;
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
