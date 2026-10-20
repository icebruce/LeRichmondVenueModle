import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { chairsWorld } from "../../domain/layout/items";
import { BLOOM_MODELS, type Part, type Prim, type Slot, tableDecor } from "../../domain/layout/decor";
import { makePiece } from "../../domain/layout/pieces";
import { styleOf } from "../../domain/scenario/scenario";
import type { Scenario } from "../../domain/scenario/schema";
import { useStudio, useView } from "../context";
import type { Materials } from "../materials";
import { type Placed, LIFT, TOP, moved } from "./common";
import {
  BloomLoader,
  type ChairModel,
  ChairModelLoader,
  type PieceModel,
  PieceModelLoader,
  chairGeometry,
} from "./geometry";

const CHAIR_CAPACITY = 400;

/** Alpha ramps for light: a beam fading along its length, a glow fading from its centre. */
const fades = (() => {
  if (typeof document === "undefined") return { beam: null, glow: null };
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    draw(c.getContext("2d") as CanvasRenderingContext2D);
    return new THREE.CanvasTexture(c);
  };
  return {
    // Cone uv v runs base (0) to tip (1): bright at the tip (the fixture), gone at the base.
    beam: make((g) => {
      const grd = g.createLinearGradient(0, 64, 0, 0);
      grd.addColorStop(0, "#000");
      grd.addColorStop(0.75, "#555");
      grd.addColorStop(1, "#fff");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }),
    glow: make((g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "#fff");
      grd.addColorStop(0.4, "#888");
      grd.addColorStop(1, "#000");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }),
  };
})();

/** Unit primitives for décor parts (see domain/layout/decor.ts for the conventions). */
function primitives(low: boolean): Record<Prim, THREE.BufferGeometry> {
  const r = low ? 8 : 14;
  return {
    cylinder: new THREE.CylinderGeometry(1, 1, 1, r, 1).translate(0, 0.5, 0),
    sphere: new THREE.SphereGeometry(1, low ? 6 : 9, low ? 4 : 7),
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(1, 1, r).translate(0, 0.5, 0),
    bowl: new THREE.ConeGeometry(1, 1, r).rotateX(Math.PI).translate(0, 0.5, 0),
    plane: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
    drop: low ? teardrop(6, 3) : teardrop(8, 6),
    plate: turned(PLATE, low ? 12 : 32),
    goblet: turned(GOBLET, low ? 8 : 16),
  };
}

/**
 * Turned tableware (V5), as profiles (radius, height) within a unit cylinder from y = 0 to 1, so
 * they scale like the cylinders they replace. A plate: a flat well rising to a rim, its top
 * surface turned back to the centre (a solid, seen from above and below).
 */
const PLATE: [number, number][] = [
  [0, 0],
  [0.62, 0],
  [0.7, 0.3],
  [0.97, 0.85],
  [1, 1],
  [0.94, 1],
  [0.68, 0.55],
  [0, 0.5],
];
/** A stemmed glass: foot, stem, a bowl widest two thirds up, drawn to the rim (glass shows both sides). */
const GOBLET: [number, number][] = [
  [0, 0],
  [0.75, 0],
  [0.72, 0.03],
  [0.1, 0.06],
  [0.07, 0.42],
  [0.25, 0.5],
  [0.85, 0.66],
  [0.98, 0.8],
  [0.9, 1],
];

function turned(profile: [number, number][], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/**
 * A candle flame (V5): round at the bottom, drawn to a point at the top, within -1..1 like the
 * sphere it replaces (x = sin t · sin(t/2), y = cos t, scaled to a unit radius); as many triangles as
 * that sphere or fewer.
 */
function teardrop(segments: number, steps: number): THREE.BufferGeometry {
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = Math.PI * (1 - i / steps);
    return new THREE.Vector2(Math.sin(t) * Math.sin(t / 2) * 1.3, Math.cos(t));
  });
  return new THREE.LatheGeometry(points, segments);
}

const SEAT_ROUGHNESS = 0.8;

/**
 * A loaded chair's material (V4): `frame` finishes the frame; where the model's mask is white the
 * seat colour, fabric roughness, no metal and full opacity take over. The detail map holds the
 * surface at half strength, so the colour is doubled.
 */
function masked(
  frame: THREE.MeshStandardMaterial,
  model: ChairModel,
  seat: string,
): THREE.MeshStandardMaterial {
  frame.map = model.detail;
  frame.onBeforeCompile = (shader) => {
    shader.uniforms.seatMask = { value: model.mask };
    shader.uniforms.seatColour = { value: new THREE.Color(seat) };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D seatMask;\nuniform vec3 seatColour;\nfloat seatShare;",
      )
      .replace(
        "#include <map_fragment>",
        `seatShare = texture2D(seatMask, vMapUv).r;
diffuseColor.rgb = mix(diffuseColor.rgb, seatColour, seatShare) * texture2D(map, vMapUv).r * 2.0;
diffuseColor.a = mix(diffuseColor.a, 1.0, seatShare);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - seatShare;",
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, ${SEAT_ROUGHNESS.toFixed(2)}, seatShare);`,
      );
  };
  frame.customProgramCacheKey = () => "chair-masked";
  return frame;
}

/** Chairs grouped by library chair (DEC-04): per chair type in use, one mesh (a loaded model) or a frame and a seat mesh. */
export function Chairs({ placed, scenario, low }: { placed: Placed[]; scenario: Scenario; low: boolean }) {
  const { catalog } = useStudio();
  const drag = useView((s) => s.drag);
  // Instances are written in place below, so each write asks for a frame (frames are on demand).
  const invalidate = useThree((s) => s.invalidate);
  // Keyed by content: new materials for the same chair types would compile their shader again.
  const usedKey = [...new Set(placed.map((p) => styleOf(p.item, scenario.style).chair))].sort().join("|");
  const used = useMemo(() => (usedKey ? usedKey.split("|") : []), [usedKey]);
  // Full quality draws each style's model file; the light tiers, the generator's own chair (V4).
  // Full quality loads every chair style's model with the room (its loading step waits for them),
  // so they compile with it and never swap in later or compile on a view change ([PLT-03]).
  const files = useMemo(
    () =>
      low
        ? []
        : [
            ...new Set(
              [...catalog.values()].flatMap(({ model }) =>
                model.kind === "parametric" && model.generator === "chair" && model.file ? [model.file] : [],
              ),
            ),
          ].sort(),
    [catalog, low],
  );
  const loaded = useLoader(ChairModelLoader, files) as ChairModel[];
  const models = useMemo(() => new Map(files.map((f, i) => [f, loaded[i] as ChairModel])), [files, loaded]);
  const kinds = useMemo(
    () =>
      used.map((id) => {
        const model = catalog.get(id)?.model;
        const params = model?.kind === "parametric" ? model.params : {};
        const full = !low && model?.kind === "parametric" && model.file ? models.get(model.file) : undefined;
        const metal = params.metal === true;
        const clear = params.clear === true;
        const frameMat = clear
          ? new THREE.MeshPhysicalMaterial({
              color: String(params.frame ?? "#e8f0f2"),
              roughness: 0.05,
              transparent: true,
              opacity: 0.35,
            })
          : new THREE.MeshStandardMaterial({
              color: String(params.frame ?? "#d8c9b4"),
              metalness: metal ? 0.85 : 0,
              roughness: metal ? 0.3 : 0.55,
            });
        const seatColour = String(params.seat ?? "#e9e1d3");
        const instanced = (g: THREE.BufferGeometry, m: THREE.Material) => {
          const mesh = new THREE.InstancedMesh(g, m, CHAIR_CAPACITY);
          mesh.castShadow = true;
          return mesh;
        };
        // A loaded model is one mesh, finished as frame or seat by its mask; the generator's chair
        // is a frame mesh and a seat mesh.
        if (full)
          return { id, shared: true, meshes: [instanced(full.geometry, masked(frameMat, full, seatColour))] };
        const geo = chairGeometry(String(params.style ?? "oval"), low);
        const seatMat = new THREE.MeshStandardMaterial({ color: seatColour, roughness: SEAT_ROUGHNESS });
        return {
          id,
          shared: false,
          meshes: [instanced(geo.frame, frameMat), instanced(geo.fabric, seatMat)],
        };
      }),
    [used, catalog, low, models],
  );
  useEffect(
    () => () => {
      for (const k of kinds)
        for (const m of k.meshes) {
          // A loaded model's geometry is shared by every chair entry of its style.
          if (!k.shared) m.geometry.dispose();
          (m.material as THREE.Material).dispose();
          m.dispose();
        }
    },
    [kinds],
  );
  useEffect(() => {
    const t = new THREE.Object3D();
    const counts = new Map<string, number>();
    for (const p of placed) {
      const id = styleOf(p.item, scenario.style).chair;
      const k = kinds.find((x) => x.id === id);
      if (!k) continue;
      const item = moved(p.item, drag);
      const lift = drag?.ids.includes(p.item.id) ? LIFT : 0;
      let n = counts.get(id) ?? 0;
      for (const ch of chairsWorld(item, p.shape)) {
        if (n >= CHAIR_CAPACITY) break;
        t.position.set(ch.x, p.y + lift, ch.z);
        t.rotation.set(0, ch.rotY, 0);
        t.updateMatrix();
        for (const m of k.meshes) m.setMatrixAt(n, t.matrix);
        n++;
      }
      counts.set(id, n);
    }
    for (const k of kinds) {
      const n = counts.get(k.id) ?? 0;
      for (const m of k.meshes) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
    invalidate();
  }, [placed, drag, kinds, scenario.style, invalidate]);
  return (
    <group name="chairs">
      {kinds.map((k) => (
        <group key={k.id}>
          {k.meshes.map((m) => (
            <primitive key={m.uuid} object={m} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** A mesh's worth of parts: one primitive and slot, or one bloom model (`model`). */
/** A mesh's worth of parts: one primitive and slot, or one bloom model (`model`). */
type Group = { key: string; prim: Prim; slot: Slot; solid: boolean; model?: string };

/** Turned shapes and the primitive drawn for them away from eye level and on phones (V5). */
const FAR: Partial<Record<Prim, Prim>> = { plate: "cylinder", goblet: "cylinder" };

/**
 * Phone tier: every opaque slot of one primitive shares one mesh, coloured per instance with its
 * slot material's colour, so the heaviest décor stays inside the phone draw-call budget
 * (ARCHITECTURE §7). Metal sheen and the wax glow are lost there; flames still glow.
 */
const SOLID_SLOTS: ReadonlySet<Slot> = new Set([
  "wood",
  "wax",
  "brass",
  "silver",
  "black",
  "ceramic",
  "paper",
  "flower",
  "leaf",
  "fabric",
]);
/** Foliage green; a part's own colour (eucalyptus) replaces it. */
const LEAF = "#56704a";

/** Each placed piece's décor parts and the height they stand on: one layout for the décor and its contact shadows. */
export type DecorParts = { p: Placed; base: number; parts: Part[] }[];

export function useDecorParts(placed: Placed[], scenario: Scenario, low: boolean): DecorParts {
  const { catalog } = useStudio();
  // Parts per table depend only on its shape and style; a drag just moves them.
  return useMemo(
    () =>
      placed.map((p, i) => ({
        p,
        // Pieces stand on the floor; table décor sits on the table top.
        base: p.shape.kind === "piece" ? 0 : p.shape.kind === "cocktail" ? p.shape.height : TOP,
        parts:
          p.shape.kind === "piece"
            ? makePiece(
                p.shape.generator,
                low ? p.shape.lowParams : p.shape.params,
                p.shape.options,
                p.shape.size,
              ).parts
            : tableDecor(p.shape, styleOf(p.item, scenario.style), catalog, scenario.style, i * 97 + 13),
      })),
    [placed, scenario.style, catalog, low],
  );
}

/**
 * Candles, florals and place settings on every table (DEC-02..03, LIB-04..06): world-space
 * instances, one mesh per primitive and material. Flames show only in the evening.
 */
export function TableDecor({
  decor: perItem,
  m,
  evening,
  low,
  detail,
}: {
  decor: DecorParts;
  m: Materials;
  evening: boolean;
  low: boolean;
  /** At eye level: blooms as models (V5); from further off, the lighter primitives. */
  detail: boolean;
}) {
  const drag = useView((s) => s.drag);
  // Instances are written in place below, so each write asks for a frame (frames are on demand).
  const invalidate = useThree((s) => s.invalidate);
  const prims = useMemo(() => primitives(low), [low]);
  // Full quality loads every bloom model with the room (its loading step waits for them); the phone
  // tier keeps the primitives (V5).
  const bloomList = useMemo<string[]>(() => (low ? [] : [...BLOOM_MODELS]), [low]);
  const loadedBlooms = useLoader(BloomLoader, bloomList) as THREE.BufferGeometry[];
  const blooms = useMemo(
    () => new Map(bloomList.map((name, i) => [name, loadedBlooms[i] as THREE.BufferGeometry])),
    [bloomList, loadedBlooms],
  );
  const solidMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.15 }),
    [],
  );
  useEffect(() => () => solidMaterial.dispose(), [solidMaterial]);
  // Bloom models: their creases' shade in the vertex colour, tinted per instance; petals are thin
  // shells, seen from both sides.
  const bloomMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }),
    [],
  );
  useEffect(() => () => bloomMaterial.dispose(), [bloomMaterial]);
  const materials = useMemo<Record<Slot, THREE.Material>>(
    () => ({
      wax: new THREE.MeshStandardMaterial({
        color: "#f3ecdf",
        roughness: 0.6,
        emissive: "#ffb46b",
      }),
      flame: m.flame,
      glass: m.glass,
      water: new THREE.MeshPhysicalMaterial({
        color: "#dfeef0",
        roughness: 0.05,
        transparent: true,
        opacity: 0.25,
      }),
      brass: m.brass,
      silver: new THREE.MeshStandardMaterial({ color: "#c9cbcc", metalness: 0.9, roughness: 0.25 }),
      black: m.blackMetal,
      ceramic: new THREE.MeshStandardMaterial({ color: "#f7f5f0", roughness: 0.35 }),
      paper: new THREE.MeshStandardMaterial({ color: "#f4efe4", roughness: 0.9 }),
      flower: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 }),
      fabric: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95 }),
      sheer: new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.9,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
      wood: new THREE.MeshStandardMaterial({ color: "#7a5a3c", roughness: 0.75 }),
      // Lights (LIB-08): bulbs glow in the evening; coloured beams show only then.
      bulb: new THREE.MeshStandardMaterial({ color: "#fff1d6", emissive: "#ffc77a", toneMapped: false }),
      // Beams fade from the fixture outward; glows are soft round pools (washes, glints, halos).
      beam: new THREE.MeshBasicMaterial({
        color: "#ffffff",
        alphaMap: fades.beam,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      glow: new THREE.MeshBasicMaterial({
        color: "#ffffff",
        alphaMap: fades.glow,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      // Candlelight: the cloth times the pool's colour, faded out from the centre (dst · (c·a + 1 − a)).
      pool: new THREE.MeshBasicMaterial({
        color: "#ffffff",
        alphaMap: fades.glow,
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.DstColorFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        toneMapped: false,
      }),
      mirror: new THREE.MeshStandardMaterial({
        color: "#e6e8ea",
        metalness: 1,
        roughness: 0.12,
        flatShading: true,
      }),
    }),
    [m],
  );
  // The lighting changes values only, never the materials or meshes: no shader compiles on a switch.
  useEffect(() => {
    (materials.wax as THREE.MeshStandardMaterial).emissiveIntensity = evening ? 0.18 : 0;
    (materials.bulb as THREE.MeshStandardMaterial).emissiveIntensity = evening ? 3 : 0.25;
  }, [materials, evening]);
  const groups = useMemo(() => {
    type Entry = { p: Placed; part: Part; base: number; lod?: "near" | "far" };
    const map = new Map<string, Group & { parts: Entry[] }>();
    const place = (key: string, g: Omit<Group, "key">, entry: Entry) => {
      let group = map.get(key);
      if (!group) map.set(key, (group = { key, ...g, parts: [] }));
      group.parts.push(entry);
    };
    for (const { p, parts, base } of perItem) {
      // A piece with a model file draws that instead at full quality (`PieceModels`).
      if (!low && p.shape.kind === "piece" && p.shape.file) continue;
      for (const part of parts) {
        const solid = low && SOLID_SLOTS.has(part.slot);
        const slotKey = solid ? "solid" : part.slot;
        const plain = (prim: Prim, lod?: "near" | "far") =>
          place(
            `${prim}:${slotKey}`,
            { prim, slot: part.slot, solid },
            { p, part, base, ...(lod ? { lod } : {}) },
          );
        // Detail (V5) at eye level only: a bloom model or a turned shape near, and from further off
        // the primitive standing in for it, in its slot's own mesh. A view switch only refills the
        // instances: no mesh, draw call or shader is added. Phones draw the stand-ins.
        const model = part.model && blooms.has(part.model) ? part.model : undefined;
        const far = FAR[part.prim];
        if (low) plain(far ?? part.prim);
        else if (model) {
          place(
            `bloom:${model}`,
            { prim: part.prim, slot: part.slot, solid, model },
            { p, part, base, lod: "near" },
          );
          plain(part.prim, "far");
        } else if (far) {
          plain(part.prim, "near");
          plain(far, "far");
        } else plain(part.prim);
      }
    }
    return [...map.values()];
  }, [perItem, low, blooms]);
  const meshes = useMemo(
    () =>
      groups.map((g) => {
        const mesh = new THREE.InstancedMesh(
          (g.model && blooms.get(g.model)) || prims[g.prim],
          g.model ? bloomMaterial : g.solid ? solidMaterial : materials[g.slot],
          Math.max(1, g.parts.length),
        );
        // Phone tier: small décor casts no shadow, to stay inside the draw-call budget (ARCHITECTURE §7).
        mesh.castShadow =
          !low && !["flame", "glass", "water", "sheer", "bulb", "beam", "glow", "pool"].includes(g.slot);
        return { g, mesh };
      }),
    [groups, prims, materials, solidMaterial, bloomMaterial, blooms, low],
  );
  useEffect(
    () => () => {
      for (const { mesh } of meshes) mesh.dispose();
    },
    [meshes],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(prims)) g.dispose();
    },
    [prims],
  );
  useEffect(
    () => () => {
      for (const k of [
        "wax",
        "water",
        "silver",
        "ceramic",
        "paper",
        "flower",
        "leaf",
        "fabric",
        "sheer",
        "wood",
        "bulb",
        "beam",
        "glow",
        "pool",
        "mirror",
      ] as const)
        materials[k].dispose();
    },
    [materials],
  );
  useEffect(() => {
    const local = new THREE.Object3D();
    const table = new THREE.Matrix4();
    const out = new THREE.Matrix4();
    const colour = new THREE.Color();
    for (const { g, mesh } of meshes) {
      // Only the parts for this distance: near ones at eye level, far ones otherwise.
      let n = 0;
      for (const { p, part, base, lod } of g.parts) {
        if (lod && (lod === "near") !== detail) continue;
        const item = moved(p.item, drag);
        const lift = drag?.ids.includes(p.item.id) ? LIFT : 0;
        table.makeRotationY(item.rotY).setPosition(item.x, p.y + base + lift, item.z);
        local.position.set(part.x, part.y, part.z);
        local.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
        // A bloom model keeps its own proportions, at the part's largest size.
        if (g.model) local.scale.setScalar(Math.max(part.sx, part.sy, part.sz));
        else local.scale.set(part.sx, part.sy, part.sz);
        local.updateMatrix();
        out.multiplyMatrices(table, local.matrix);
        mesh.setMatrixAt(n, out);
        // A part's own colour (flowers, napkins, eucalyptus); else foliage green on leaves and, in a
        // phone batch, the colour of the slot's own material.
        const own = part.colour ?? (part.slot === "leaf" ? LEAF : null);
        if (own) mesh.setColorAt(n, colour.set(own));
        else if (g.solid)
          mesh.setColorAt(n, colour.copy((materials[part.slot] as THREE.MeshStandardMaterial).color));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Flames, beams, glows and pools show only in the evening.
      mesh.visible = n > 0 && (evening || !["flame", "beam", "glow", "pool"].includes(g.slot));
    }
    invalidate();
  }, [meshes, drag, materials, evening, detail, invalidate]);
  return (
    <group name="table-decor">
      {meshes.map(({ g, mesh }) => (
        <primitive key={g.key} object={mesh} />
      ))}
    </group>
  );
}

/**
 * Floor pieces with a model file (Meshy plants, V5) at full quality: one mesh per file, scaled to
 * the piece's height. The phone tier draws the generator's parts (`TableDecor`).
 */
export function PieceModels({ decor, low }: { decor: DecorParts; low: boolean }) {
  const drag = useView((s) => s.drag);
  const invalidate = useThree((s) => s.invalidate);
  const key = low
    ? ""
    : [...new Set(decor.flatMap(({ p }) => (p.shape.kind === "piece" && p.shape.file ? [p.shape.file] : [])))]
        .sort()
        .join("|");
  const files = useMemo(() => (key ? key.split("|") : []), [key]);
  const loaded = useLoader(PieceModelLoader, files) as PieceModel[];
  const meshes = useMemo(
    () =>
      files.map((file, i) => {
        const model = loaded[i] as PieceModel;
        const mesh = new THREE.InstancedMesh(model.geometry, model.material, PIECE_CAPACITY);
        mesh.castShadow = true;
        return { file, model, mesh };
      }),
    [files, loaded],
  );
  useEffect(
    () => () => {
      for (const { mesh } of meshes) mesh.dispose();
    },
    [meshes],
  );
  useEffect(() => {
    const t = new THREE.Object3D();
    for (const { file, model, mesh } of meshes) {
      let n = 0;
      for (const { p } of decor) {
        if (p.shape.kind !== "piece" || p.shape.file !== file || n >= PIECE_CAPACITY) continue;
        const item = moved(p.item, drag);
        const lift = drag?.ids.includes(p.item.id) ? LIFT : 0;
        t.position.set(item.x, p.y + lift, item.z);
        t.rotation.set(0, item.rotY, 0);
        t.scale.setScalar(p.shape.height / model.height);
        t.updateMatrix();
        mesh.setMatrixAt(n++, t.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    invalidate();
  }, [meshes, decor, drag, invalidate]);
  return (
    <group name="piece-models">
      {meshes.map(({ file, mesh }) => (
        <primitive key={file} object={mesh} />
      ))}
    </group>
  );
}

/** Placements of one piece model drawn at most (more of one plant than this would be a mistake). */
const PIECE_CAPACITY = 64;
