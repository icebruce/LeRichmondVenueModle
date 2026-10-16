import * as THREE from "three";
import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import type { Item } from "../domain/layout/items";
import { createEditor } from "../state/editor";
import { newScenario } from "../domain/scenario/scenario";
import { StudioContext, type Studio } from "./context";
import { Items } from "./items/Items";
import { useMaterials } from "./materials";

/** What to draw for a library entry that is not itself placeable (linens, chairs). */
function thumbItem(id: string): { item: Item; linen?: string } {
  const at = { x: 8, z: 7, rotY: 0.5 };
  if (id.startsWith("linen-"))
    return { item: { id: "t", libraryId: "table-round", ...at, options: { seats: 4 } }, linen: id };
  if (id.startsWith("chair-"))
    return { item: { id: "t", libraryId: "table-sweetheart", ...at, options: {} } };
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
  const { studio, size } = useMemo(() => {
    const { item, linen } = thumbItem(id);
    const s = newScenario("thumb", "thumb", new Date(0).toISOString(), [item]);
    s.style.lighting = "day";
    if (linen) s.style.linen = linen;
    const editor = createEditor({ ...base, now: () => s.updatedAt, newId: () => "x" }, [s]);
    const entry = base.catalog.get(item.libraryId);
    const size = entry ? Math.max(entry.sizeM.w, entry.sizeM.d, entry.sizeM.h, 1.2) : 2;
    return { studio: { ...base, editor }, size };
  }, [base, id]);
  const d = size * 1.25 + 1.2;
  return (
    <Canvas
      gl={{ alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.AgXToneMapping }}
      camera={{ fov: 30, position: [8 + d, d * 0.85, 7 + d], near: 0.1, far: 100 }}
      onCreated={({ camera }) => camera.lookAt(8, 0.45, 7)}
      dpr={1}
      data-testid="thumb-canvas"
    >
      <StudioContext.Provider value={studio}>
        <Suspense fallback={null}>
          <ThumbScene />
        </Suspense>
      </StudioContext.Provider>
    </Canvas>
  );
}
