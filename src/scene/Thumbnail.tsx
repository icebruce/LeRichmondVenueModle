import * as THREE from "three";
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import type { Item } from "../domain/layout/items";
import type { TableStyle } from "../domain/scenario/schema";
import { createEditor } from "../state/editor";
import { newScenario } from "../domain/scenario/scenario";
import { StudioContext, type Studio } from "./context";
import { Items } from "./items/Items";
import { useMaterials } from "./materials";

/** What to draw for a library entry that is not itself placeable: a small table dressed with it. */
function thumbItem(
  id: string,
  family: string | undefined,
  generator: string | undefined,
): {
  item: Item;
  style?: Partial<TableStyle>;
  extras?: { settings: boolean; menus: boolean; tableNumbers: boolean };
} {
  const at = { x: 8, z: 7, rotY: 0.5 };
  const round = (style: Partial<TableStyle>) => ({
    item: { id: "t", libraryId: "table-round", ...at, options: { seats: 4 } },
    style: { candles: "none", ...style },
  });
  if (family === "linen" && generator === "runner")
    return {
      item: { id: "t", libraryId: "table-round", ...at, options: { seats: 4 } },
      style: { runner: id, candles: "none" },
    };
  if (family === "linen") return round({ linen: id });
  if (family === "tableware")
    return {
      ...round({ napkin: generator === "napkin" ? id : "none" }),
      extras: { settings: true, menus: generator === "menuCard", tableNumbers: generator === "tableNumber" },
    };
  if (family === "candle") return round({ candles: id });
  if (family === "floral")
    return id === "floral-runner"
      ? {
          item: { id: "t", libraryId: "table-rect", ...at, options: { seats: 8 } },
          style: { florals: id, candles: "none" },
        }
      : round({ florals: id });
  if (family === "chair")
    return {
      item: { id: "t", libraryId: "table-sweetheart", ...at, options: {} },
      style: { chair: id, candles: "none" },
    };
  return { item: { id: "t", libraryId: id, ...at, options: {} } };
}

function ThumbScene() {
  const m = useMaterials();
  return (
    <>
      <hemisphereLight args={["#ffffff", "#b9a991", 1.4]} />
      <directionalLight position={[4, 8, 6]} intensity={2.2} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, 5]} scale={[10, 10, 1]} />
      </Environment>
      <Items m={m} evening={false} />
    </>
  );
}

/** Renders one library item on a transparent background for its catalogue thumbnail (LIB-11). */
export function Thumbnail({ base, id }: { base: Studio; id: string }) {
  const studio = useMemo(() => {
    const own = base.catalog.get(id);
    const generator = own?.model.kind === "parametric" ? own.model.generator : undefined;
    const { item, style, extras } = thumbItem(id, own?.family, generator);
    const s = newScenario("thumb", "thumb", new Date(0).toISOString(), [item]);
    s.style = { ...s.style, ...style, settings: false, ...extras, lighting: "day" };
    const editor = createEditor({ ...base, now: () => s.updatedAt, newId: () => "x" }, [s]);
    // Table-top pieces are framed close up on the table top; everything else whole.
    if (own && own.placement === "table" && id !== "floral-runner") {
      const h = own.sizeM.h;
      return { studio: { ...base, editor }, d: Math.max(0.55, h * 1.6) + 0.25, target: 0.765 + h / 2 };
    }
    const entry = base.catalog.get(item.libraryId);
    const size = entry ? Math.max(entry.sizeM.w, entry.sizeM.d, entry.sizeM.h, 1.2) : 2;
    return { studio: { ...base, editor }, d: size * 1.25 + 1.2, target: 0.45 };
  }, [base, id]);
  const { d, target } = studio;
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
          <ThumbScene />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
