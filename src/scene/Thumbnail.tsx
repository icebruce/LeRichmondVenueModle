import * as THREE from "three";
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { type Item, shapeOf } from "../domain/layout/items";
import { litThumbnail } from "../domain/library/catalog";
import type { TableStyle } from "../domain/scenario/schema";
import { createEditor } from "../state/editor";
import { newScenario } from "../domain/scenario/scenario";
import { StudioContext, type Studio } from "./context";
import { Items } from "./items/Items";
import { useMaterials } from "./materials";
import { PIECE_GENERATORS } from "../domain/layout/pieces";

/** What to draw for a library entry that is not itself placeable: a small table dressed with it. */
function thumbItem(
  id: string,
  family: string | undefined,
  generator: string | undefined,
  count = 1,
): {
  item: Item;
  style?: Partial<TableStyle>;
  extras?: { settings: boolean; menus: boolean; tableNumbers: boolean };
} {
  const at = { x: 8, z: 7, rotY: 0.5 };
  const round = (style: Partial<TableStyle>) => ({
    item: { id: "t", libraryId: "table-round", ...at, options: { seats: 4 } },
    style: { candles: [], ...style },
  });
  if (family === "linen" && generator === "runner") return round({ runner: id });
  if (family === "linen") return round({ linen: id });
  if (family === "tableware")
    return {
      ...round({ napkin: generator === "napkin" ? id : "none" }),
      extras: { settings: true, menus: generator === "menuCard", tableNumbers: generator === "tableNumber" },
    };
  // Candles on a cocktail table, which has no chairs to hide them.
  if (family === "candle")
    return {
      item: { id: "t", libraryId: "table-cocktail", ...at, options: {} },
      style: { candles: [{ id, n: count }] },
    };
  // Library pieces (floral installations, plants, lights, signs) stand on their own.
  // A short strand, so its bulbs are big enough to read in a thumbnail.
  if (generator && PIECE_GENERATORS.includes(generator))
    return { item: { id: "t", libraryId: id, ...at, options: { span: 2 } } };
  if (family === "floral")
    return id === "floral-runner"
      ? {
          item: { id: "t", libraryId: "table-rect", ...at, options: { seats: 8 } },
          style: { florals: id, candles: [] },
        }
      : round({ florals: id });
  if (family === "chair")
    return {
      item: { id: "t", libraryId: "table-sweetheart", ...at, options: {} },
      style: { chair: id, candles: [] },
    };
  return { item: { id: "t", libraryId: id, ...at, options: {} } };
}

function ThumbScene({ evening }: { evening: boolean }) {
  // Thumbnails are small: the 1K set.
  const m = useMaterials("low");
  return (
    <>
      {/* Lit pieces on a dark tile, so glows and light-coloured words read; the same colour as --thumb-dark. */}
      {evening && <color attach="background" args={["#1d1f1c"]} />}
      <hemisphereLight args={["#ffffff", "#b9a991", 1.4]} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 5]} scale={[10, 10, 1]} />
      </Environment>
      <Items m={m} evening={evening} />
    </>
  );
}

/** Renders one library item on a transparent background for its catalogue thumbnail (LIB-11). */
export function Thumbnail({ base, id }: { base: Studio; id: string }) {
  const studio = useMemo(() => {
    const own = base.catalog.get(id);
    const generator = own?.model.kind === "parametric" ? own.model.generator : undefined;
    const { item, style, extras } = thumbItem(id, own?.family, generator, own?.defaultCount);
    const s = newScenario("thumb", "thumb", new Date(0).toISOString(), [item]);
    s.style = { ...s.style, ...style, settings: false, ...extras, lighting: "day" };
    const editor = createEditor({ ...base, now: () => s.updatedAt, newId: () => "x" }, [s]);
    // Table-top pieces are framed close up on the table top (over its cloth); everything else whole.
    if (own && own.placement === "table" && id !== "floral-runner") {
      const h = own.sizeM.h;
      const top = (base.catalog.get(item.libraryId)?.sizeM.h ?? 0.75) + 0.015;
      // Candles stand on the small cocktail table at 0.6 scale: closer still, so they fill the frame.
      const d = own.family === "candle" ? Math.max(0.3, h) + 0.15 : Math.max(0.55, h * 1.6) + 0.25;
      return { studio: { ...base, editor }, d, target: top + (own.family === "candle" ? h * 0.3 : h / 2) };
    }
    const entry = base.catalog.get(item.libraryId);
    // Standing pieces are framed whole; hanging ones on the piece itself, up where it hangs.
    const shape = shapeOf(item, base.catalog);
    if (shape.kind === "piece") {
      const size = Math.max(shape.width, shape.depth, shape.blocks ? shape.height : 0.8, 0.8);
      const target = shape.blocks ? shape.height / 2 : shape.height - 0.4;
      return { studio: { ...base, editor }, d: size * 1.25 + 0.6, target };
    }
    const size = entry ? Math.max(entry.sizeM.w, entry.sizeM.d, entry.sizeM.h, 1.2) : 2;
    return { studio: { ...base, editor }, d: size * 1.25 + 1.2, target: 0.45 };
  }, [base, id]);
  const { d, target } = studio;
  const own = base.catalog.get(id);
  const lit = !!own && litThumbnail(own);
  return (
    <Canvas
      gl={{ alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.AgXToneMapping }}
      camera={{ fov: 30, position: [8 + d, target + d * 0.7, 7 + d], near: 0.05, far: 100 }}
      onCreated={({ camera }) => camera.lookAt(8, target, 7)}
      dpr={1}
      data-testid="thumb-canvas"
    >
      <StudioContext.Provider value={studio.studio}>
        <Suspense fallback={null}>
          {/* Lights are shown lit, so their glow and beams read in the catalogue; the dance area, a
              mark on the floor, on the dark of the venue's tile. */}
          <ThumbScene evening={lit} />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
