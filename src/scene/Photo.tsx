import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { DepthOfField } from "@react-three/postprocessing";
import type { DepthOfFieldEffect } from "postprocessing";
import { useStore } from "zustand";
import { RESULT_LABELS } from "../domain/library/imported";
import { graphicsStore } from "../state/graphics";
import { type Photo, photoRenderer } from "../state/view";
import { useStudio } from "./context";
import { uncapNextFrame } from "./frames";

/** Photo mode's scene side (EXP-02): the background blur and the saved image. */

/**
 * Background blur: how deep the sharp band is around the focus, as a share of its distance (so a
 * dollhouse view 35 m out keeps the room readable and a seat's view keeps the table), and how large
 * the blur is.
 */
const BLUR: Record<Photo["blur"], { share: number; bokeh: number }> = {
  off: { share: 1, bokeh: 0 },
  soft: { share: 0.35, bokeh: 2.5 },
  strong: { share: 0.15, bokeh: 4 },
};

/** The nearest drawn surface under a screen point (px from the canvas's top left). */
function surfaceAt(
  scene: THREE.Scene,
  camera: THREE.Camera,
  size: { width: number; height: number },
  at: [number, number],
): THREE.Vector3 | null {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((at[0] / size.width) * 2 - 1, 1 - (at[1] / size.height) * 2), camera);
  // Only what is drawn: hidden objects and invisible pick targets (an item's click box) don't count.
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  const drawn = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m : [m]).some((x) => x.visible);
  return (
    ray
      .intersectObjects(scene.children, true)
      .find((h) => shown(h.object) && drawn((h.object as THREE.Mesh).material ?? []))?.point ?? null
  );
}

/**
 * Depth of field while Photo mode is open, inside the effect chain: sharp at the tapped point, or
 * at the centre of the view once the camera stops. Off keeps the effect with no blur, so changing
 * the blur compiles nothing. `stillOnly`: no blur while the view moves.
 */
export function PhotoDepth({ photo, stillOnly }: { photo: Photo; stillOnly: boolean }) {
  const { scene, camera, size, invalidate } = useThree();
  const moving = useStore(graphicsStore, (s) => s.moving);
  const dof = useRef<DepthOfFieldEffect>(null);
  const blur = BLUR[photo.blur];
  useEffect(() => {
    const effect = dof.current;
    if (moving || !effect?.target) return;
    const hit = surfaceAt(scene, camera, size, photo.focus ?? [size.width / 2, size.height / 2]);
    if (!hit) return;
    effect.target.copy(hit);
    effect.cocMaterial.focusRange = Math.max(MIN_RANGE, hit.distanceTo(camera.position) * blur.share);
    invalidate();
  }, [photo.focus, blur.share, moving, scene, camera, size, invalidate]);
  // Battery saver blurs only once the view is still (the saved image is the same).
  return <DepthOfField ref={dof} target={ORIGIN} bokehScale={stillOnly && moving ? 0 : blur.bokeh} />;
}

/** The sharp band is never shallower than this (m): at eye level a table stays sharp. */
const MIN_RANGE = 1;

/** The blur's first target, before the first surface is found (a constant: the effect keeps its own). */
const ORIGIN: [number, number, number] = [0, 0, 0];

/** The footnote's words for approximate imported items in view, or null with none in view. */
function footnote(camera: THREE.Camera, items: { x: number; z: number; name: string }[]): string | null {
  const v = new THREE.Vector3();
  const seen = items.filter(({ x, z }) => {
    v.set(x, 0.5, z).project(camera);
    return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1;
  });
  return seen.length ? `Approximate: ${[...new Set(seen.map((s) => s.name))].join(", ")}` : null;
}

/**
 * Makes Photo mode's image: the view drawn again at `pixelRatio` (the composer follows the
 * renderer's size), copied with a footnote naming approximate imported items in view, then the
 * screen's resolution back.
 */
export function PhotoCapture() {
  const get = useThree((s) => s.get);
  const { editor, catalog } = useStudio();
  useEffect(() => {
    photoRenderer.render = async (pixelRatio) => {
      const state = get();
      const before = state.viewport.dpr;
      try {
        state.setDpr(pixelRatio);
        // Two frames: the first at the new size settles the effect buffers.
        for (let i = 0; i < 2; i++) {
          uncapNextFrame();
          state.advance(performance.now(), true);
        }
        const src = state.gl.domElement;
        const out = document.createElement("canvas");
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("No 2D canvas");
        ctx.drawImage(src, 0, 0);
        const items = editor.active().items.flatMap((i) => {
          const e = catalog.get(i.libraryId);
          if (!e?.imported) return [];
          // The fidelity label in its exact words (DESIGN_GUIDE §8), once when it is the name too.
          const label = RESULT_LABELS[e.imported.result];
          const same = e.name.toLowerCase() === label.toLowerCase();
          return [{ x: i.x, z: i.z, name: same ? label : `${e.name} (${label})` }];
        });
        const note = footnote(state.camera, items);
        if (note) {
          // Set like a toast: the interface's font and its dark toast colours (tokens.css).
          const token = (name: string) =>
            getComputedStyle(document.documentElement).getPropertyValue(name).trim();
          const px = Math.round(out.height * 0.018);
          ctx.font = `500 ${px}px ${token("--font-ui")}`;
          const pad = Math.round(px * 0.6);
          const w = Math.min(ctx.measureText(note).width, out.width - 4 * pad);
          ctx.fillStyle = token("--toast-bg");
          ctx.fillRect(pad, out.height - pad - px - 2 * pad, w + 2 * pad, px + 2 * pad);
          ctx.fillStyle = token("--on-dark");
          ctx.textBaseline = "top";
          ctx.fillText(note, 2 * pad, out.height - 2 * pad - px, w);
        }
        return await new Promise<Blob>((resolve, reject) =>
          out.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/png"),
        );
      } finally {
        state.setDpr(before);
        state.invalidate();
      }
    };
    return () => {
      photoRenderer.render = null;
    };
  }, [get, editor, catalog]);
  return null;
}
