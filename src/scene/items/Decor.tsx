import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { chairsWorld } from "../../domain/layout/items";
import { type Part, type Prim, type Slot, tableDecor } from "../../domain/layout/decor";
import { makePiece } from "../../domain/layout/pieces";
import { styleOf } from "../../domain/scenario/scenario";
import type { Scenario } from "../../domain/scenario/schema";
import { useStudio, useView } from "../context";
import type { Materials } from "../materials";
import { type Placed, LIFT, TOP, moved } from "./common";
import { chairGeometry } from "./geometry";

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
  };
}

/** Chairs grouped by library chair (DEC-04): one frame and one seat mesh per chair type in use. */
export function Chairs({ placed, scenario, low }: { placed: Placed[]; scenario: Scenario; low: boolean }) {
  const { catalog } = useStudio();
  const drag = useView((s) => s.drag);
  // Instances are written in place below, so each write asks for a frame (frames are on demand).
  const invalidate = useThree((s) => s.invalidate);
  const used = useMemo(
    () => [...new Set(placed.map((p) => styleOf(p.item, scenario.style).chair))].sort(),
    [placed, scenario.style],
  );
  const kinds = useMemo(
    () =>
      used.map((id) => {
        const model = catalog.get(id)?.model;
        const params = model?.kind === "parametric" ? model.params : {};
        const geo = chairGeometry(String(params.style ?? "oval"), low);
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
        const seatMat = new THREE.MeshStandardMaterial({
          color: String(params.seat ?? "#e9e1d3"),
          roughness: 0.8,
        });
        const frame = new THREE.InstancedMesh(geo.frame, frameMat, CHAIR_CAPACITY);
        const seat = new THREE.InstancedMesh(geo.fabric, seatMat, CHAIR_CAPACITY);
        frame.castShadow = seat.castShadow = true;
        return { id, frame, seat };
      }),
    [used, catalog, low],
  );
  useEffect(
    () => () => {
      for (const k of kinds)
        for (const m of [k.frame, k.seat]) {
          m.geometry.dispose();
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
        k.frame.setMatrixAt(n, t.matrix);
        k.seat.setMatrixAt(n, t.matrix);
        n++;
      }
      counts.set(id, n);
    }
    for (const k of kinds) {
      const n = counts.get(k.id) ?? 0;
      for (const m of [k.frame, k.seat]) {
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
          <primitive object={k.frame} />
          <primitive object={k.seat} />
        </group>
      ))}
    </group>
  );
}

type Group = { key: string; prim: Prim; slot: Slot; solid: boolean };

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

/**
 * Candles, florals and place settings on every table (DEC-02..03, LIB-04..06): world-space
 * instances, one mesh per primitive and material. Flames show only in the evening.
 */
export function TableDecor({
  placed,
  scenario,
  m,
  evening,
  low,
}: {
  placed: Placed[];
  scenario: Scenario;
  m: Materials;
  evening: boolean;
  low: boolean;
}) {
  const { catalog } = useStudio();
  const drag = useView((s) => s.drag);
  // Instances are written in place below, so each write asks for a frame (frames are on demand).
  const invalidate = useThree((s) => s.invalidate);
  // Parts per table depend only on its shape and style; a drag just moves them.
  const perItem = useMemo(
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
  const prims = useMemo(() => primitives(low), [low]);
  const solidMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.15 }),
    [],
  );
  useEffect(() => () => solidMaterial.dispose(), [solidMaterial]);
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
    const map = new Map<string, Group & { parts: { p: Placed; part: Part; base: number }[] }>();
    for (const { p, parts, base } of perItem) {
      for (const part of parts) {
        const solid = low && SOLID_SLOTS.has(part.slot);
        const key = `${part.prim}:${solid ? "solid" : part.slot}`;
        let g = map.get(key);
        if (!g) map.set(key, (g = { key, prim: part.prim, slot: part.slot, solid, parts: [] }));
        g.parts.push({ p, part, base });
      }
    }
    return [...map.values()];
  }, [perItem, low]);
  const meshes = useMemo(
    () =>
      groups.map((g) => {
        const mesh = new THREE.InstancedMesh(
          prims[g.prim],
          g.solid ? solidMaterial : materials[g.slot],
          Math.max(1, g.parts.length),
        );
        // Phone tier: small décor casts no shadow, to stay inside the draw-call budget (ARCHITECTURE §7).
        mesh.castShadow =
          !low && !["flame", "glass", "water", "sheer", "bulb", "beam", "glow"].includes(g.slot);
        return { g, mesh };
      }),
    [groups, prims, materials, solidMaterial, low],
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
      g.parts.forEach(({ p, part, base }, i) => {
        const item = moved(p.item, drag);
        const lift = drag?.ids.includes(p.item.id) ? LIFT : 0;
        table.makeRotationY(item.rotY).setPosition(item.x, p.y + base + lift, item.z);
        local.position.set(part.x, part.y, part.z);
        local.rotation.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0);
        local.scale.set(part.sx, part.sy, part.sz);
        local.updateMatrix();
        out.multiplyMatrices(table, local.matrix);
        mesh.setMatrixAt(i, out);
        // A part's own colour (flowers, napkins, eucalyptus); else foliage green on leaves and, in a
        // phone batch, the colour of the slot's own material.
        const own = part.colour ?? (part.slot === "leaf" ? LEAF : null);
        if (own) mesh.setColorAt(i, colour.set(own));
        else if (g.solid)
          mesh.setColorAt(i, colour.copy((materials[part.slot] as THREE.MeshStandardMaterial).color));
      });
      mesh.count = g.parts.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      // Flames, beams and glows show only in the evening.
      mesh.visible = evening || !["flame", "beam", "glow"].includes(g.slot);
    }
    invalidate();
  }, [meshes, drag, materials, evening, invalidate]);
  return (
    <group name="table-decor">
      {meshes.map(({ g, mesh }) => (
        <primitive key={g.key} object={mesh} />
      ))}
    </group>
  );
}
