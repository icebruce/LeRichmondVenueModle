// PROTOTYPE ONLY (proto/visual-v2, never merged): look-development for the two POC renders.
import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { wallFrame } from "../../domain/venue/model";
import { pointInPolygon } from "../../domain/geometry";
import { shapeOf } from "../../domain/layout/items";
import type { Scenario } from "../../domain/scenario/schema";
import { useEditor, useStudio } from "../context";
import { CUT_HEIGHT } from "../venue/walls";

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d") as CanvasRenderingContext2D;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** White centre fading to black edge (alpha maps read green). */
const radial = (inner = 0) =>
  canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, inner * 64, 64, 64, 64);
    g.addColorStop(0, "#fff");
    g.addColorStop(1, "#000");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
/** Vertical ramp: `from` alpha at the bottom row to `to` at the top. */
const ramp = (from: number, to: number, power = 1) =>
  canvasTex(4, 128, (c) => {
    for (let y = 0; y < 128; y++) {
      const t = y / 127;
      const a = from + (to - from) * Math.pow(t, power);
      const v = Math.round(a * 255);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(0, y, 4, 1);
    }
  });
/** An uplight wash: brightest at the bottom centre, fading up and out. */
const wash = () =>
  canvasTex(128, 256, (c) => {
    const g = c.createRadialGradient(64, 256, 4, 64, 256, 250);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, "#888");
    g.addColorStop(1, "#000");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 256);
  });

/** Backlit bottle rows for the back bar, drawn once. */
const bottleSheet = () =>
  canvasTex(
    1024,
    512,
    (c) => {
      c.fillStyle = "#120c07";
      c.fillRect(0, 0, 1024, 512);
      const rows = 5;
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let r = 0; r < rows; r++) {
        const y1 = ((r + 1) * 512) / rows - 6;
        const y0 = y1 - 512 / rows + 12;
        const glow = c.createLinearGradient(0, y0, 0, y1);
        glow.addColorStop(0, "#ffd9a0");
        glow.addColorStop(0.5, "#b26a2a");
        glow.addColorStop(1, "#3a2210");
        c.fillStyle = glow;
        c.fillRect(0, y0, 1024, y1 - y0);
        let x = 6;
        while (x < 1010) {
          const w = 14 + rnd() * 16;
          const h = (y1 - y0) * (0.55 + rnd() * 0.4);
          const tone = ["#5a2e0e", "#2d4a24", "#c9b48a", "#7a3a12", "#1d2d18", "#d8c7a0"][
            Math.floor(rnd() * 6)
          ] as string;
          c.fillStyle = tone;
          c.globalAlpha = 0.92;
          c.fillRect(x, y1 - h * 0.7, w, h * 0.7);
          c.fillRect(x + w * 0.35, y1 - h, w * 0.3, h * 0.32);
          c.globalAlpha = 0.35;
          c.fillStyle = "#fff4dc";
          c.fillRect(x + w * 0.15, y1 - h * 0.65, w * 0.12, h * 0.5);
          c.globalAlpha = 1;
          x += w + 3 + (rnd() < 0.12 ? 18 : 0);
        }
        c.fillStyle = "#2a1a0e";
        c.fillRect(0, y1, 1024, 6);
      }
    },
    true,
  );

/** Evening backdrop: a soft charcoal gradient behind the room. */
const backdrop = () =>
  canvasTex(
    16,
    512,
    (c) => {
      const g = c.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, "#232421");
      g.addColorStop(0.6, "#171816");
      g.addColorStop(1, "#0e0f0e");
      c.fillStyle = g;
      c.fillRect(0, 0, 16, 512);
    },
    true,
  );

const flat = (g: THREE.PlaneGeometry) => g.rotateX(-Math.PI / 2);

type Props = {
  cut: ReadonlySet<string>;
  showCeiling: boolean;
  evening: boolean;
  overview: boolean;
  baked?: boolean;
};

export function Lookdev({ cut, showCeiling, evening, overview, baked = false }: Props) {
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  const { gl, scene } = useThree();
  const tex = useMemo(
    () => ({
      radial: radial(),
      soft: radial(0.2),
      top: ramp(0, 0.9, 0.9),
      base: ramp(0.5, 0, 1.4),
      wash: wash(),
      bottles: bottleSheet(),
      bg: backdrop(),
    }),
    [],
  );

  (window as unknown as { __scene?: THREE.Scene }).__scene = scene;
  // Presentation: gradient backdrop.
  useEffect(() => {
    const prev = scene.background;
    if (evening) scene.background = tex.bg;
    return () => {
      scene.background = prev;
    };
  }, [scene, tex, evening]);

  // One captured reflection of the room, used by glossy materials (marble, glass, brass).
  useEffect(() => {
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.1, 60, rt);
    cam.position.set(8, 1.6, 7.5);
    const id = window.setTimeout(
      () => {
        cam.update(gl, scene);
        scene.environment = rt.texture;
        scene.environmentIntensity = evening ? (baked ? 1.0 : 0.4) : 1.0;
      },
      baked ? 9000 : 2500,
    );
    return () => {
      window.clearTimeout(id);
      rt.dispose();
    };
  }, [gl, scene, evening, baked]);

  const W = venue.width;
  const D = venue.depth;
  const C = venue.ceiling;
  const level = (x: number, z: number) =>
    pointInPolygon([x, z], venue.raised.outline) ? venue.raised.height : 0;

  const mats = useMemo(() => {
    const dark = (map: THREE.Texture, opacity = 1) =>
      new THREE.MeshBasicMaterial({
        color: "#000",
        alphaMap: map,
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
    const light = (map: THREE.Texture, color: string, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        alphaMap: map,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
    return {
      blob: dark(tex.soft, 0.55),
      top: dark(tex.top, 1),
      base: dark(tex.base, 0.75),
      pool: light(tex.radial, "#ffb46e", 0.5),
      wash: light(tex.wash, "#ffa860", 0.42),
      plinth: new THREE.MeshStandardMaterial({ color: "#cfc5b6", roughness: 0.95 }),
      bulb: new THREE.MeshBasicMaterial({ color: "#ffd59a", toneMapped: false }),
      conduit: new THREE.MeshStandardMaterial({ color: "#151617", metalness: 0.6, roughness: 0.5 }),
      bottles: new THREE.MeshStandardMaterial({
        color: "#000",
        emissive: "#ffffff",
        emissiveMap: tex.bottles,
        emissiveIntensity: evening ? 3.2 : 0.5,
        roughness: 0.4,
      }),
      halo: dark(tex.radial, 0.6),
    };
  }, [tex, evening]);

  // Walls: dark above head height (uncut walls), soft darkening where they meet the floor.
  const walls = useMemo(() => {
    const tops: THREE.BufferGeometry[] = [];
    const bases: THREE.BufferGeometry[] = [];
    const floors: THREE.BufferGeometry[] = [];
    for (const w of venue.data.walls) {
      const { dir, normal, length } = wallFrame(w);
      const ang = Math.atan2(normal[0], normal[1]);
      const at = (s: number, inset: number): [number, number] => [
        w.from[0] + dir[0] * s + normal[0] * inset,
        w.from[1] + dir[1] * s + normal[1] * inset,
      ];
      const [cx, cz] = at(length / 2, 0.012);
      const h = cut.has(w.id) ? CUT_HEIGHT : C;
      if (!cut.has(w.id)) {
        const g = new THREE.PlaneGeometry(length, C - 1.9)
          .rotateY(ang)
          .translate(cx, 1.9 + (C - 1.9) / 2, cz);
        tops.push(g);
      }
      bases.push(
        new THREE.PlaneGeometry(length, Math.min(0.55, h))
          .rotateY(ang)
          .translate(cx, Math.min(0.55, h) / 2, cz),
      );
      const [fx, fz] = at(length / 2, 0.35);
      const f = new THREE.PlaneGeometry(length, 0.7);
      f.rotateX(-Math.PI / 2);
      f.rotateY(ang + Math.PI);
      f.translate(fx, 0.004, fz);
      floors.push(f);
    }
    return { top: mergeGeometries(tops), base: mergeGeometries(bases), floor: mergeGeometries(floors) };
  }, [venue, cut, C]);

  // Light pools under the chandeliers and on the bar top; uplight washes on the east piers.
  const light = useMemo(() => {
    const pools: THREE.BufferGeometry[] = [];
    for (const c of venue.data.fixtures.chandeliers) {
      const r = c.kind === "brassCluster" ? 3.2 : 2.1;
      pools.push(flat(new THREE.PlaneGeometry(r * 2, r * 2)).translate(c.x, level(c.x, c.z) + 0.006, c.z));
    }
    const [x0, z0, x1, z1] = venue.data.bar.outer.value;
    const H = venue.data.bar.counterHeight.value;
    pools.push(
      flat(new THREE.PlaneGeometry(x1 - x0 + 0.6, (z1 - z0) * 0.9)).translate(
        (x0 + x1) / 2,
        H + 0.004,
        (z0 + z1) / 2,
      ),
    );
    const washes: THREE.BufferGeometry[] = [];
    const east = venue.data.walls.find((w) => w.id === "east");
    if (east) {
      const { dir, normal, length } = wallFrame(east);
      const ang = Math.atan2(normal[0], normal[1]);
      const cuts = [...east.openings].sort((a, b) => a.start - b.start);
      let s = 0;
      const piers: [number, number][] = [];
      for (const o of cuts) {
        if (o.start - s > 0.3) piers.push([s, o.start]);
        s = o.end;
      }
      if (length - s > 0.3) piers.push([s, length]);
      for (const [a, b] of piers) {
        const mid = (a + b) / 2;
        const px = east.from[0] + dir[0] * mid + normal[0] * 0.03;
        const pz = east.from[1] + dir[1] * mid + normal[1] * 0.03;
        washes.push(
          new THREE.PlaneGeometry(Math.max(1.4, (b - a) * 1.8), 5)
            .rotateY(ang)
            .translate(px, 2.5 + level(px - 0.5, pz), pz),
        );
      }
    }
    return { pools: mergeGeometries(pools), washes: washes.length ? mergeGeometries(washes) : null };
  }, [venue]);

  // Contact shadows under every table and its chairs.
  const blobs = useMemo(() => {
    const out: THREE.BufferGeometry[] = [];
    for (const it of scenario.items) {
      let s;
      try {
        s = shapeOf(it, catalog);
      } catch {
        continue;
      }
      let w: number;
      let d: number;
      if (s.kind === "rectTable") [w, d] = [s.length + 1.3, s.width + 1.4];
      else if (s.kind === "roundTable") w = d = s.diameter + 1.4;
      else if (s.kind === "cocktail") w = d = s.diameter + 0.5;
      else continue;
      out.push(
        flat(new THREE.PlaneGeometry(w, d))
          .rotateY(it.rotY)
          .translate(it.x, level(it.x, it.z) + 0.007, it.z),
      );
    }
    return out.length ? mergeGeometries(out) : null;
  }, [scenario.items, catalog]);

  // Terrace string-light canopy seen through the garage doors at night (R11, R16).
  const terrace = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let row = 0; row < 6; row++) {
      const x = -1.0 - row * 1.25;
      for (let i = 0; i <= 44; i++) {
        const t = i / 44;
        const z = 0.4 + t * (D - 0.8);
        const seg = (t * 4) % 1;
        pts.push([x, 3.7 - Math.sin(seg * Math.PI) * 0.45, z]);
      }
    }
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 8, 6), mats.bulb, pts.length);
    const o = new THREE.Object3D();
    pts.forEach(([x, y, z], i) => {
      o.position.set(x, y, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    return m;
  }, [D, mats]);

  // Ceiling services at eye level: conduit runs and track rails with spot heads (R01, R02, R03).
  const conduits = useMemo(() => {
    const gs: THREE.BufferGeometry[] = [];
    const y = C - 0.45;
    for (const z of [1.6, 4.2, 6.8, 9.4, 11.6])
      gs.push(
        new THREE.CylinderGeometry(0.028, 0.028, W - 0.6, 8).rotateZ(Math.PI / 2).translate(W / 2, y, z),
      );
    for (const x of [3.2, 11.8]) {
      gs.push(new THREE.BoxGeometry(0.05, 0.04, D - 1).translate(x, y - 0.3, D / 2));
      for (let z = 1.2; z < D - 1; z += 1.5)
        gs.push(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10).rotateX(0.5).translate(x, y - 0.4, z));
    }
    return mergeGeometries(gs);
  }, [W, D, C]);

  const bb = venue.data.backBar.rect.value;
  return (
    <group name="lookdev">
      {/* Plinth under the room and its soft shadow. */}
      <mesh position={[W / 2, -0.33, D / 2]} material={mats.plinth} receiveShadow>
        <boxGeometry args={[W + 1.0, 0.56, D + 1.0]} />
      </mesh>
      <mesh
        geometry={useMemo(
          () => flat(new THREE.PlaneGeometry(W + 9, D + 9)).translate(W / 2 + 1.2, -0.62, D / 2 + 1.2),
          [W, D],
        )}
        material={mats.halo}
      />
      {!baked && walls.top && evening && <mesh geometry={walls.top} material={mats.top} />}
      {!baked && walls.base && <mesh geometry={walls.base} material={mats.base} />}
      {!baked && walls.floor && <mesh geometry={walls.floor} material={mats.base} />}
      {blobs && <mesh geometry={blobs} material={mats.blob} />}
      {!baked && evening && light.pools && <mesh geometry={light.pools} material={mats.pool} />}
      {!baked && evening && light.washes && <mesh geometry={light.washes} material={mats.wash} />}
      {evening && !overview && <primitive object={terrace} />}
      {!baked && showCeiling && conduits && <mesh geometry={conduits} material={mats.conduit} />}
      {!baked && showCeiling && evening && (
        <mesh position={[W / 2, C - 0.03, D / 2]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[W, D]} />
          <meshBasicMaterial color="#000" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      )}
      {!baked && (
        <mesh position={[(bb[0] + bb[2]) / 2, 2.07, 0.1]} material={mats.bottles}>
          <planeGeometry args={[bb[2] - bb[0] - 0.3, 1.86]} />
        </mesh>
      )}
    </group>
  );
}
