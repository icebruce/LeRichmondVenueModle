import * as THREE from "three";
import { useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import type { OpeningData, WallData } from "../../domain/venue/schema";
import { type Materials, boxGeo } from "../materials";
import { paintingTexture } from "../textures";
import { openingMatrix } from "./walls";

type P = { venue: VenueModel; m: Materials; evening: boolean };

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  return mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
}

/** Local opening space: x along the opening (0..w), y up, z into the room. */
function local(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  return boxGeo(x0, y0, z0, x1, y1, z1);
}

function gridFrame(o: OpeningData, cols: number, rows: number, bar = 0.05): THREE.BufferGeometry[] {
  const w = o.end - o.start;
  const geos: THREE.BufferGeometry[] = [];
  const y0 = o.sill;
  const y1 = o.head;
  const f = 0.09;
  geos.push(
    local(0, y0, -0.12, f, y1, 0.02),
    local(w - f, y0, -0.12, w, y1, 0.02),
    local(0, y1 - f, -0.12, w, y1, 0.02),
    local(0, y0, -0.12, w, y0 + f, 0.02),
  );
  for (let c = 1; c < cols; c++) {
    const x = (w / cols) * c;
    geos.push(local(x - bar / 2, y0, -0.1, x + bar / 2, y1, 0));
  }
  for (let r = 1; r < rows; r++) {
    const y = y0 + ((y1 - y0) / rows) * r;
    geos.push(local(0, y - bar / 2, -0.1, w, y + bar / 2, 0));
  }
  return geos;
}

function curtainGeo(width: number, height: number, folds: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, folds * 8, 1);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(((x + width / 2) / width) * Math.PI * 2 * folds) * 0.06);
  }
  g.computeVertexNormals();
  return g;
}

/** One wall's glazing, curtains, doors and openings, in world space. */
function buildOpenings(wall: WallData) {
  const frames: THREE.BufferGeometry[] = [];
  const lightFrames: THREE.BufferGeometry[] = [];
  const kitchen: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const curtains: THREE.BufferGeometry[] = [];
  const doors: THREE.BufferGeometry[] = [];
  const voids: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];
  const warm: THREE.BufferGeometry[] = [];
  for (const o of wall.openings) {
    const mtx = openingMatrix(wall, o.start);
    const w = o.end - o.start;
    const add = (list: THREE.BufferGeometry[], geos: THREE.BufferGeometry[]) =>
      geos.forEach((g) => list.push(g.applyMatrix4(mtx)));
    if (o.kind === "garageDoor") {
      add(
        frames,
        gridFrame(o, Math.max(3, Math.round(w / 0.6)), Math.max(4, Math.round((o.head - o.sill) / 0.62))),
      );
      add(glass, [local(0, o.sill, -0.07, w, o.head, -0.06)]);
    } else if (o.kind === "tallWindow") {
      // Street windows: off-white frames, three panes wide with a transom (R09, R10).
      add(lightFrames, gridFrame(o, 3, 4, 0.06));
      add(glass, [local(0, o.sill, -0.07, w, o.head, -0.06)]);
      add(lightFrames, [local(-0.05, o.sill - 0.05, -0.15, w + 0.05, o.sill, 0.12)]);
      const ch = o.head + 0.25;
      for (const [cx, cw] of [
        [-0.32, 0.8],
        [w + 0.32, 0.8],
      ] as const) {
        const g = curtainGeo(cw, ch, 4);
        g.translate(cx, ch / 2, 0.16);
        curtains.push(g.applyMatrix4(mtx));
      }
      add(frames, [local(-0.8, ch, 0.12, w + 0.8, ch + 0.04, 0.2)]);
    } else if (o.kind === "door") {
      add(doors, [local(0.02, 0, -0.1, w - 0.02, o.head, -0.04)]);
      add(signs, [local(w / 2 - 0.18, o.head + 0.1, 0.0, w / 2 + 0.18, o.head + 0.28, 0.06)]);
    } else if (o.kind === "pass") {
      // The kitchen behind the pass is brightly lit with white light on stainless (UV02).
      add(kitchen, [local(0, 0, -0.34, w, o.head, -0.33)]);
      add(frames, [local(0, 0.95, -0.3, w, 1.0, 0.15)]);
      add(voids, [local(-0.05, 0, -1.55, 0, o.head, -0.2), local(w, 0, -1.55, w + 0.05, o.head, -0.2)]);
    } else if (o.kind === "opening" && o.sill === 0) {
      add(voids, [local(0, 0, -2.0, w, o.head, -1.95)]);
      add(signs, [local(w / 2 - 0.18, o.head + 0.1, 0.0, w / 2 + 0.18, o.head + 0.28, 0.06)]);
    }
  }
  return {
    frames: merge(frames),
    lightFrames: merge(lightFrames),
    kitchen: merge(kitchen),
    glass: merge(glass),
    curtains: merge(curtains),
    doors: merge(doors),
    voids: merge(voids),
    signs: merge(signs),
    warm: merge(warm),
  };
}

/** Glazing, curtains, doors and the views beyond them; hidden on walls cut away by the camera. */
export function Openings({ venue, m, evening, cutWalls }: P & { cutWalls: ReadonlySet<string> }) {
  const perWall = useMemo(
    () => venue.data.walls.map((w) => ({ id: w.id, built: buildOpenings(w) })),
    [venue],
  );
  return (
    <group name="openings">
      {perWall
        .filter((w) => !cutWalls.has(w.id))
        .map(({ id, built }) => (
          <group key={id}>
            {built.frames && <mesh geometry={built.frames} material={m.blackMetal} castShadow />}
            {built.lightFrames && <mesh geometry={built.lightFrames} material={m.windowFrame} castShadow />}
            {built.kitchen && <mesh geometry={built.kitchen} material={m.kitchen} />}
            {built.glass && <mesh geometry={built.glass} material={m.glass} />}
            {built.doors && <mesh geometry={built.doors} material={m.greenPanel} />}
            {built.voids && <mesh geometry={built.voids} material={m.darkVoid} />}
            {built.signs && <mesh geometry={built.signs} material={m.exitSign} />}
            {built.warm && <mesh geometry={built.warm} material={evening ? m.shelfGlow : m.fridge} />}
            {built.curtains && <mesh geometry={built.curtains} material={m.velvet} castShadow />}
          </group>
        ))}
    </group>
  );
}

/** What is seen through the glass: terrace to the west, street facades to the east (backdrops only). */
export function Backdrops({ venue, m, evening }: P) {
  const g = useMemo(() => {
    const D = venue.depth;
    const terrace = boxGeo(-5.5, -0.1, -2, -5.4, 8, D + 2);
    const terraceFloor = boxGeo(-5.5, -0.12, -2, -0.36, -0.1, D + 2);
    const street = boxGeo(venue.width + 14, -0.1, -4, venue.width + 14.1, 14, D + 4);
    const lights: THREE.BufferGeometry[] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 26; i++) {
        const z = 0.3 + (i / 25) * (D - 0.6);
        const sag = Math.sin((i / 25) * Math.PI * 3) * 0.25;
        const s = new THREE.SphereGeometry(0.035, 6, 4);
        s.translate(-1.2 - row * 1.1, 3.6 + sag + row * 0.2, z);
        lights.push(s);
      }
    }
    return { terrace, terraceFloor, street, lights: merge(lights) };
  }, [venue]);
  return (
    <group name="backdrops">
      <mesh geometry={g.terrace} material={evening ? m.darkVoid : m.terrace} />
      <mesh geometry={g.terraceFloor} material={m.tile} />
      <mesh geometry={g.street} material={m.street} />
      {evening && g.lights && <mesh geometry={g.lights} material={m.bulb} />}
    </group>
  );
}

export function BackBar({ venue, m }: Omit<P, "evening">) {
  const g = useMemo(() => {
    const b = venue.data.backBar;
    const [x0, z0, x1, z1] = b.rect.value;
    const rc = b.rearCounter;
    const cabinet = boxGeo(x0, 0, z0, x1, 0.95, z1);
    const counter = boxGeo(rc[0], 0, rc[1], rc[2], 0.92, rc[3]);
    const counterTop = boxGeo(rc[0], 0.92, rc[1] - 0.02, rc[2], 0.96, rc[3] + 0.03);
    const fridges: THREE.BufferGeometry[] = [];
    for (let x = rc[0] + 0.6; x < rc[2] - 0.6; x += 0.75)
      fridges.push(boxGeo(x, 0.1, rc[3] + 0.002, x + 0.65, 0.85, rc[3] + 0.01));
    const frame: THREE.BufferGeometry[] = [];
    const shelves: THREE.BufferGeometry[] = [];
    for (const y of [1.25, 1.65, 2.05, 2.45])
      shelves.push(boxGeo(x0 + 0.1, y, z0 + 0.05, x1 - 0.1, y + 0.03, z1 - 0.1));
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 6)
      frame.push(boxGeo(x - 0.04, 0.95, z0, x + 0.04, b.height, z1));
    frame.push(boxGeo(x0, b.height - 0.1, z0, x1, b.height, z1));
    const canopy = boxGeo(x0 - 0.2, b.canopyHeight, z0, x1 + 0.2, b.canopyHeight + 0.18, z1 + 0.9);
    const neon = new THREE.TorusGeometry(0.28, 0.025, 8, 32);
    neon.translate(x1 + 0.45, 2.1, 0.08);
    // Round neon sign on a dark backing board, so it reads as signage, not a floating ring (R02).
    const neonBack = new THREE.CylinderGeometry(0.36, 0.36, 0.02, 32);
    neonBack.rotateX(Math.PI / 2);
    neonBack.translate(x1 + 0.45, 2.1, 0.045);
    return {
      cabinet,
      counter,
      counterTop,
      fridges: merge(fridges),
      frame: merge(frame),
      shelves: merge(shelves),
      canopy,
      neon,
      neonBack,
    };
  }, [venue]);
  const bottles = useMemo(() => {
    const [x0, z0, x1] = venue.data.backBar.rect.value;
    const geo = new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8);
    const mesh = new THREE.InstancedMesh(geo, m.bottles, 240);
    const t = new THREE.Object3D();
    let n = 0;
    for (const y of [1.28, 1.68, 2.08, 2.48]) {
      for (let x = x0 + 0.2; x < x1 - 0.2 && n < 240; x += 0.09) {
        t.position.set(x, y + 0.15, z0 + 0.25 + ((n * 7) % 3) * 0.06);
        t.scale.setScalar(0.85 + ((n * 13) % 5) * 0.06);
        t.updateMatrix();
        mesh.setMatrixAt(n++, t.matrix);
      }
    }
    mesh.count = n;
    return mesh;
  }, [venue, m]);
  return (
    <group name="back-bar">
      <mesh geometry={g.cabinet} material={m.backBarWood} />
      <mesh geometry={g.counter} material={m.barBase} />
      <mesh geometry={g.counterTop} material={m.marble} />
      {g.fridges && <mesh geometry={g.fridges} material={m.fridge} />}
      {g.frame && <mesh geometry={g.frame} material={m.backBarWood} />}
      {g.shelves && <mesh geometry={g.shelves} material={m.shelfGlow} />}
      <mesh geometry={g.canopy} material={m.steel} />
      <mesh geometry={g.neonBack} material={m.blackMetal} />
      <mesh geometry={g.neon} material={m.exitSign} />
      <primitive object={bottles} />
    </group>
  );
}

export function Furnishings({ venue, m, communalTable }: Omit<P, "evening"> & { communalTable: boolean }) {
  const g = useMemo(() => {
    const f = venue.data.fixtures;
    const seats: THREE.BufferGeometry[] = [];
    const backs: THREE.BufferGeometry[] = [];
    for (const b of f.banquettes) {
      if (b.disabled || b.x0 === undefined || b.x1 === undefined) continue;
      seats.push(boxGeo(b.x0, 0, 0.12, b.x1, 0.46, b.depth));
      backs.push(boxGeo(b.x0, 0, 0, b.x1, b.backHeight, 0.14, 1.2));
    }
    const [wx0, wz0, wx1, wz1] = f.wineWall.rect;
    const wine = boxGeo(wx0, 0, wz0, wx1, f.wineWall.height, wz1);
    const wineCanopy = boxGeo(
      wx0 - 0.3,
      f.wineWall.height,
      wz0 - 0.2,
      venue.width,
      f.wineWall.height + 0.12,
      wz1 + 0.2,
    );
    const [cx0, cz0, cx1, cz1] = f.venueFurniture.communalTable.rect;
    const communal = boxGeo(cx0, 0, cz0, cx1, f.venueFurniture.communalTable.height, cz1);
    return { seats: merge(seats), backs: merge(backs), wine, wineCanopy, communal };
  }, [venue]);
  const paintings = useMemo(
    () =>
      venue.data.fixtures.paintings.map((p, i) => ({
        ...p,
        tex: paintingTexture(p.palette, 11 + i * 31),
      })),
    [venue],
  );
  return (
    <group name="furnishings">
      {g.seats && <mesh geometry={g.seats} material={m.leather} receiveShadow castShadow />}
      {g.backs && <mesh geometry={g.backs} material={m.leather} receiveShadow />}
      <mesh geometry={g.wine} material={m.wineFrame} />
      <mesh geometry={g.wineCanopy} material={m.steel} />
      {communalTable && <mesh geometry={g.communal} material={m.barBase} castShadow />}
      {paintings.map((p) => (
        <group key={p.id}>
          <mesh position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.035]}>
            <boxGeometry args={[p.x1 - p.x0 + 0.06, p.y1 - p.y0 + 0.06, 0.04]} />
            <meshStandardMaterial color="#1b1a19" roughness={0.6} />
          </mesh>
          <mesh position={[(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.06]}>
            <planeGeometry args={[p.x1 - p.x0, p.y1 - p.y0]} />
            <meshStandardMaterial map={p.tex} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Brass multi-bulb chandelier over the bar, birdcage chandeliers, drum pendants. */
export function Lights({ venue, m, pendants }: Omit<P, "evening"> & { pendants: boolean }) {
  const built = useMemo(() => {
    const tubes: THREE.Matrix4[] = [];
    const bulbs: THREE.Matrix4[] = [];
    const wires: THREE.BufferGeometry[] = [];
    const crystals: THREE.Matrix4[] = [];
    const drums: THREE.Matrix4[] = [];
    const cords: THREE.BufferGeometry[] = [];
    const t = new THREE.Object3D();
    const C = venue.ceiling;
    let seed = 3;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const c of venue.data.fixtures.chandeliers) {
      if (c.kind === "brassCluster") {
        const top = c.top ?? c.bottom + 2;
        const stem = new THREE.CylinderGeometry(0.03, 0.03, C - c.bottom, 6);
        stem.translate(c.x, (C + c.bottom) / 2, c.z);
        wires.push(stem);
        // Tiered brass rings of cylinder lamps around the stem, widest at the bottom (R03).
        const tiers = 4;
        for (let k = 0; k < tiers; k++) {
          const rad = c.radius * (1 - k * 0.2);
          const y = c.bottom + (((top - c.bottom) * k) / (tiers - 1)) * 0.85;
          const ring = new THREE.TorusGeometry(rad, 0.012, 4, 40);
          ring.rotateX(Math.PI / 2);
          ring.translate(c.x, y + 0.02, c.z);
          wires.push(ring);
          const n = Math.round(16 * (rad / c.radius));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + k * 0.4;
            t.position.set(c.x + Math.cos(a) * rad, y + 0.09, c.z + Math.sin(a) * rad);
            t.scale.set(1, 1, 1);
            t.updateMatrix();
            tubes.push(t.matrix.clone());
            t.position.y = y - 0.04;
            t.updateMatrix();
            bulbs.push(t.matrix.clone());
          }
        }
      } else {
        const h = c.height ?? 1.2;
        const cage: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          const bar = new THREE.CylinderGeometry(0.006, 0.006, h * 0.78, 4);
          bar.translate(c.x + Math.cos(a) * c.radius, c.bottom + h * 0.39, c.z + Math.sin(a) * c.radius);
          cage.push(bar);
        }
        for (const y of [0.02, h * 0.78]) {
          const ring = new THREE.TorusGeometry(c.radius, 0.012, 4, 32);
          ring.rotateX(Math.PI / 2);
          ring.translate(c.x, c.bottom + y, c.z);
          cage.push(ring);
        }
        cage.push(
          new THREE.CylinderGeometry(0.01, c.radius * 0.95, h * 0.22, 18, 1, true).translate(
            c.x,
            c.bottom + h * 0.89,
            c.z,
          ),
        );
        const rope = new THREE.CylinderGeometry(0.015, 0.015, C - (c.bottom + h), 6);
        rope.translate(c.x, (C + c.bottom + h) / 2, c.z);
        cage.push(rope);
        wires.push(...cage);
        for (let i = 0; i < 26; i++) {
          const a = r() * Math.PI * 2;
          const rad = r() * c.radius * 0.6;
          t.position.set(c.x + Math.cos(a) * rad, c.bottom + 0.2 + r() * h * 0.5, c.z + Math.sin(a) * rad);
          t.scale.setScalar(0.6 + r() * 0.6);
          t.updateMatrix();
          crystals.push(t.matrix.clone());
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          t.position.set(
            c.x + Math.cos(a) * c.radius * 0.45,
            c.bottom + h * 0.42,
            c.z + Math.sin(a) * c.radius * 0.45,
          );
          t.scale.setScalar(1);
          t.updateMatrix();
          bulbs.push(t.matrix.clone());
        }
      }
    }
    for (const row of venue.data.fixtures.pendantRows) {
      for (let i = 0; i < row.count; i++) {
        const x = row.x0 + ((row.x1 - row.x0) / Math.max(1, row.count - 1)) * i;
        t.position.set(x, row.height, row.z);
        t.scale.setScalar(1);
        t.updateMatrix();
        drums.push(t.matrix.clone());
        const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.55, 4);
        cord.translate(x, row.height + 0.42, row.z);
        cords.push(cord);
      }
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((mx, i) => mesh.setMatrixAt(i, mx));
      mesh.count = list.length;
      return mesh;
    };
    return {
      tubes: inst(new THREE.CylinderGeometry(0.032, 0.032, 0.17, 8), m.brass, tubes),
      bulbs: inst(new THREE.SphereGeometry(0.045, 10, 8), m.bulb, bulbs),
      crystals: inst(new THREE.OctahedronGeometry(0.03), m.crystal, crystals),
      drums: inst(new THREE.CylinderGeometry(0.2, 0.24, 0.32, 20, 1, true), m.blackMetal, drums),
      drumGlow: inst(
        new THREE.CircleGeometry(0.22, 20).rotateX(Math.PI / 2),
        m.bulb,
        drums.map((mx) => mx.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.15, 0))),
      ),
      wires: merge(wires),
      cords: merge(cords),
    };
  }, [venue, m]);
  return (
    <group name="light-fixtures">
      <primitive object={built.tubes} />
      <primitive object={built.bulbs} />
      <primitive object={built.crystals} />
      {pendants && <primitive object={built.drums} />}
      {pendants && <primitive object={built.drumGlow} />}
      {pendants && built.cords && <mesh geometry={built.cords} material={m.blackMetal} />}
      {built.wires && <mesh geometry={built.wires} material={m.blackMetal} />}
    </group>
  );
}
