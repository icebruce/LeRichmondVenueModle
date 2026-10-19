import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import { artFor } from "../../domain/venue/art";
import type { OpeningData, WallData } from "../../domain/venue/schema";
import { type Materials, bevelGeo, boxGeo } from "../materials";
import { CARD, CARD_STRIP_M, paintingTexture } from "../textures";
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

/** A 3.5 cm trim strip facing +z along x from `x0` to `x1`, at height `y`: one nail head per 5 cm. */
function trim(x0: number, x1: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, 0.035);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * (x1 - x0)) / 0.05);
  return g.translate((x0 + x1) / 2, y + 0.0175, z);
}

/** One wall's glazing, curtains, doors and openings, in world space. */
function buildOpenings(wall: WallData) {
  const frames: THREE.BufferGeometry[] = [];
  const lightFrames: THREE.BufferGeometry[] = [];
  const kitchen: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  const curtains: THREE.BufferGeometry[] = [];
  const sheers: THREE.BufferGeometry[] = [];
  const doors: THREE.BufferGeometry[] = [];
  const voids: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];
  const warm: THREE.BufferGeometry[] = [];
  const greens: THREE.BufferGeometry[] = [];
  const floors: THREE.BufferGeometry[] = [];
  const prints: THREE.BufferGeometry[] = [];
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
      // Steel jambs and a deep header band frame each door against the brick piers (R02, R03).
      add(frames, [
        bevelGeo(-0.12, 0, -0.05, 0.01, o.head + 0.28, 0.05, 0.01),
        bevelGeo(w - 0.01, 0, -0.05, w + 0.12, o.head + 0.28, 0.05, 0.01),
        bevelGeo(-0.12, o.head, -0.06, w + 0.12, o.head + 0.28, 0.06, 0.01),
      ]);
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
      // Sheers across the glass, behind the velvet, from the rod down to the sill (R10).
      const sheer = curtainGeo(w, ch - o.sill, Math.round(w / 0.3));
      sheer.translate(w / 2, (ch + o.sill) / 2, 0.14);
      sheers.push(sheer.applyMatrix4(mtx));
    } else if (o.kind === "door") {
      add(doors, [local(0.02, 0, -0.1, w - 0.02, o.head, -0.04)]);
      add(signs, [local(w / 2 - 0.18, o.head + 0.1, 0.0, w / 2 + 0.18, o.head + 0.28, 0.06)]);
    } else if (o.kind === "pass") {
      // The kitchen behind the pass is brightly lit with white light on stainless (UV02).
      add(kitchen, [local(0, 0, -0.34, w, o.head, -0.33)]);
      add(frames, [local(0, 0.95, -0.3, w, 1.0, 0.15)]);
      add(voids, [local(-0.05, 0, -1.55, 0, o.head, -0.2), local(w, 0, -1.55, w + 0.05, o.head, -0.2)]);
    } else if (o.kind === "corridor") {
      // A short corridor with green walls and a framed black-and-white photo facing the room (R07);
      // it turns left (west) at the back, into the dark (owner, 2026-10-18).
      const d = 1.6;
      const turn = -0.9;
      add(greens, [
        local(-0.05, 0, turn, 0, o.head, -0.2),
        local(w, 0, -d, w + 0.05, o.head, -0.2),
        local(-1.0, 0, -d - 0.05, w + 0.05, o.head, -d),
        local(-1.0, o.head, -d, w + 0.05, o.head + 0.05, -0.2),
      ]);
      add(voids, [local(-1.05, 0, -d, -1.0, o.head, turn)]);
      add(floors, [local(-1.0, -0.05, -d, w, 0, -0.2)]);
      const fw = Math.min(0.42, w * 0.45);
      add(frames, [local(w / 2 - fw / 2, 1.25, -d, w / 2 + fw / 2, 1.8, -d + 0.03)]);
      add(prints, [local(w / 2 - fw / 2 + 0.06, 1.31, -d + 0.03, w / 2 + fw / 2 - 0.06, 1.74, -d + 0.035)]);
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
    sheers: merge(sheers),
    doors: merge(doors),
    voids: merge(voids),
    signs: merge(signs),
    warm: merge(warm),
    greens: merge(greens),
    floors: merge(floors),
    prints: merge(prints),
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
      {perWall.map(({ id, built }) => (
        <group key={id} visible={!cutWalls.has(id)}>
          {built.frames && <mesh geometry={built.frames} material={m.blackMetal} castShadow />}
          {built.lightFrames && <mesh geometry={built.lightFrames} material={m.windowFrame} castShadow />}
          {built.kitchen && <mesh geometry={built.kitchen} material={m.kitchen} />}
          {built.glass && <mesh geometry={built.glass} material={m.glass} />}
          {built.doors && <mesh geometry={built.doors} material={m.greenPanel} />}
          {built.voids && <mesh geometry={built.voids} material={m.darkVoid} />}
          {built.signs && <mesh geometry={built.signs} material={m.exitSign} />}
          {built.warm && <mesh geometry={built.warm} material={evening ? m.shelfGlow : m.fridge} />}
          {built.curtains && <mesh geometry={built.curtains} material={m.velvet} castShadow />}
          {built.sheers && <mesh geometry={built.sheers} material={m.sheer} />}
          {built.greens && <mesh geometry={built.greens} material={m.greenPanel} />}
          {built.floors && <mesh geometry={built.floors} material={m.woodFloor} receiveShadow />}
          {built.prints && <mesh geometry={built.prints} material={m.windowFrame} />}
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
      {g.lights && <mesh geometry={g.lights} material={m.bulb} visible={evening} />}
    </group>
  );
}

/** Six lit shelf rows up to the top of the frame (R02, R03, R14), and the bays between posts. */
const SHELVES = [1.15, 1.45, 1.75, 2.05, 2.35, 2.65];
const BAYS = 6;

/** A flat card facing +z, `w` by `h` metres, showing `region` of the card sheet (`repeat` times across). */
function card(w: number, h: number, region: readonly number[], repeat = 1): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = region as [number, number, number, number];
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0) * repeat, v0 + uv.getY(i) * (v1 - v0));
  return g;
}

export function BackBar({ venue, m }: Omit<P, "evening">) {
  const g = useMemo(() => {
    const b = venue.data.backBar;
    const [x0, z0, x1, z1] = b.rect.value;
    const rc = b.rearCounter;
    const top = b.height;
    const cabinet = boxGeo(x0, 0, z0, x1, 0.95, z1);
    const counter = boxGeo(rc[0], 0, rc[1], rc[2], 0.92, rc[3]);
    const counterTop = boxGeo(rc[0], 0.92, rc[1] - 0.02, rc[2], 0.96, rc[3] + 0.03);
    // Lit glass-door fridges under the counter, framed in stainless (R02, R03).
    const fridges: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    for (let x = rc[0] + 0.6; x < rc[2] - 0.6; x += 0.75) {
      fridges.push(boxGeo(x, 0.1, rc[3] + 0.002, x + 0.65, 0.85, rc[3] + 0.01));
      steel.push(
        boxGeo(x - 0.02, 0.08, rc[3], x + 0.67, 0.12, rc[3] + 0.03),
        boxGeo(x - 0.02, 0.83, rc[3], x + 0.67, 0.87, rc[3] + 0.03),
        boxGeo(x - 0.02, 0.08, rc[3], x + 0.02, 0.87, rc[3] + 0.03),
        boxGeo(x + 0.63, 0.08, rc[3], x + 0.67, 0.87, rc[3] + 0.03),
      );
    }
    // The chrome espresso machine on the counter, near the east end (R02, R03): body, cup rail,
    // two group heads with black handles, drip tray.
    const ex = rc[2] - 1.1;
    const ez = (rc[1] + rc[3]) / 2;
    steel.push(
      bevelGeo(ex - 0.4, 1.0, ez - 0.25, ex + 0.4, 1.42, ez + 0.08, 0.03),
      boxGeo(ex - 0.38, 1.44, ez - 0.2, ex + 0.38, 1.46, ez + 0.08),
    );
    const dark: THREE.BufferGeometry[] = [boxGeo(ex - 0.36, 0.96, ez + 0.02, ex + 0.36, 1.0, ez + 0.3)];
    for (const dx of [-0.18, 0.18]) {
      const head = new THREE.CylinderGeometry(0.04, 0.045, 0.07, 12);
      head.translate(ex + dx, 1.06, ez + 0.13);
      steel.push(head);
      const handle = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
      handle.rotateX(Math.PI / 2 - 0.3);
      handle.translate(ex + dx, 1.05, ez + 0.24);
      dark.push(handle);
    }
    // Frame: posts between the bays with brass trim, a stepped crown moulding (R02, R14).
    const frame: THREE.BufferGeometry[] = [];
    const brass: THREE.BufferGeometry[] = [];
    const bay = (x1 - x0) / BAYS;
    for (let i = 0; i <= BAYS; i++) {
      const x = x0 + i * bay;
      frame.push(bevelGeo(x - 0.045, 0.95, z0, x + 0.045, top, z1, 0.012));
      brass.push(boxGeo(x - 0.012, 0.98, z1, x + 0.012, top - 0.12, z1 + 0.008));
    }
    frame.push(boxGeo(x0, 0.95, z0, x1, top, z0 + 0.04));
    for (const [y, out] of [
      [top - 0.12, 0],
      [top - 0.04, 0.03],
      [top + 0.03, 0.06],
    ] as const)
      frame.push(bevelGeo(x0 - out, y, z0, x1 + out, y + 0.09, z1 + out, 0.01));
    brass.push(boxGeo(x0 - 0.03, top - 0.05, z1 + 0.03, x1 + 0.03, top - 0.035, z1 + 0.04));
    const mirror = card(x1 - x0 - 0.08, top - 0.12 - 0.95, [0, 0, 1, 1], BAYS);
    mirror.translate((x0 + x1) / 2, (0.95 + top - 0.12) / 2, z0 + 0.045);
    const shelves: THREE.BufferGeometry[] = [];
    const strips: THREE.BufferGeometry[] = [];
    const cards: THREE.BufferGeometry[] = [];
    for (const [i, y] of SHELVES.entries()) {
      shelves.push(boxGeo(x0 + 0.05, y, z0 + 0.05, x1 - 0.05, y + 0.02, z1 - 0.03));
      // A warm light strip under each shelf's front edge, lighting the row beneath.
      strips.push(boxGeo(x0 + 0.05, y - 0.012, z1 - 0.07, x1 - 0.05, y, z1 - 0.05));
      // Behind the front row: backlit bottles, and glasses on the lowest shelf.
      const row = card(x1 - x0 - 0.1, 0.27, i === 0 ? CARD.glasses : CARD.bottles, (x1 - x0) / CARD_STRIP_M);
      row.translate((x0 + x1) / 2, y + 0.02 + 0.135, z0 + 0.14);
      cards.push(row);
    }
    // A brushed stainless canopy over the shelves with a row of downlights (R02, R03).
    const canopy = boxGeo(x0 - 0.2, b.canopyHeight, z0, x1 + 0.2, b.canopyHeight + 0.18, z1 + 0.9);
    const downlights: THREE.BufferGeometry[] = [];
    for (let x = x0 + 0.3; x < x1; x += 0.6) {
      const disc = new THREE.CircleGeometry(0.045, 16);
      disc.rotateX(Math.PI / 2);
      disc.translate(x, b.canopyHeight - 0.002, z1 + 0.45);
      downlights.push(disc);
    }
    // Small plants and dried grasses along the canopy top (R02).
    for (let x = x0 + 0.2, i = 0; x < x1; x += 0.95, i++) {
      const plant = i % 2 === 0;
      const size = plant ? 0.55 : 0.7;
      for (const turn of [0, Math.PI / 2]) {
        const q = card(size, size, plant ? CARD.plant : CARD.grass);
        q.rotateY(turn + i);
        q.translate(x, b.canopyHeight + 0.18 + size / 2, (z0 + z1) / 2 + 0.3);
        cards.push(q);
      }
    }
    // Round neon sign on a dark backing board on the wine wall's face, so it reads as signage, not a
    // floating ring (R01, R02).
    const face = venue.data.fixtures.wineWall.rect[3];
    const neon = new THREE.TorusGeometry(0.28, 0.025, 8, 32);
    neon.translate(x1 + 0.45, 2.1, face + 0.045);
    const neonBack = new THREE.CylinderGeometry(0.36, 0.36, 0.02, 32);
    neonBack.rotateX(Math.PI / 2);
    neonBack.translate(x1 + 0.45, 2.1, face + 0.01);
    return {
      cabinet,
      counter,
      counterTop,
      fridges: merge(fridges),
      steel: merge(steel),
      dark: merge(dark),
      frame: merge(frame),
      brass: merge(brass),
      mirror,
      shelves: merge(shelves),
      strips: merge(strips),
      cards: merge(cards),
      canopy,
      downlights: merge(downlights),
      neon,
      neonBack,
    };
  }, [venue]);
  return (
    <group name="back-bar">
      <mesh geometry={g.cabinet} material={m.backBarWood} />
      <mesh geometry={g.counter} material={m.barBase} />
      <mesh geometry={g.counterTop} material={m.marble} />
      {g.fridges && <mesh geometry={g.fridges} material={m.fridge} />}
      {g.steel && <mesh geometry={g.steel} material={m.stainless} />}
      {g.dark && <mesh geometry={g.dark} material={m.blackMetal} />}
      {g.frame && <mesh geometry={g.frame} material={m.backBarWood} />}
      {g.brass && <mesh geometry={g.brass} material={m.brass} />}
      <mesh geometry={g.mirror} material={m.antiqueMirror} />
      {g.shelves && <mesh geometry={g.shelves} material={m.glass} />}
      {g.strips && <mesh geometry={g.strips} material={m.shelfGlow} />}
      {g.cards && <mesh geometry={g.cards} material={m.cards} />}
      <mesh geometry={g.canopy} material={m.stainless} />
      {g.downlights && <mesh geometry={g.downlights} material={m.bulb} />}
      <mesh geometry={g.neonBack} material={m.blackMetal} />
      <mesh geometry={g.neon} material={m.exitSign} />
    </group>
  );
}

/** A bottle's outline (lathe): `round` spirits and wine, or a squat six-sided decanter. */
function bottleGeo(round: boolean): THREE.BufferGeometry {
  const profile = round
    ? [
        [0, 0],
        [0.034, 0],
        [0.035, 0.19],
        [0.028, 0.23],
        [0.012, 0.26],
        [0.011, 0.31],
        [0, 0.31],
      ]
    : [
        [0, 0],
        [0.048, 0],
        [0.05, 0.13],
        [0.03, 0.16],
        [0.016, 0.17],
        [0.016, 0.21],
        [0, 0.21],
      ];
  return new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    round ? 10 : 6,
  );
}

/**
 * The front row of real bottles on every shelf (R02, R03): round spirits and wine, tall slim gin,
 * squat decanters, in amber, green, clear and brown. Instanced, so drawn outside `StaticMerge`.
 */
export function BackBarBottles({ venue }: Pick<P, "venue">) {
  const meshes = useMemo(() => {
    const [x0, , x1, z1] = venue.data.backBar.rect.value;
    const bay = (x1 - x0) / BAYS;
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.15,
      emissive: "#3a2410",
      emissiveIntensity: 0.35,
    });
    const tints = ["#b8742a", "#2f3d22", "#d9dccf", "#4a2615", "#c98f3b"].map((c) => new THREE.Color(c));
    const out = [true, false].map((round) => new THREE.InstancedMesh(bottleGeo(round), mat, 220));
    const counts = [0, 0];
    const t = new THREE.Object3D();
    let n = 0;
    for (const y of SHELVES) {
      for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.09) {
        n++;
        // Clear of the posts, with gaps between groups, as on a working back bar.
        const fromPost = (x - x0) % bay;
        if (fromPost < 0.09 || fromPost > bay - 0.09 || (Math.floor(x * 7.3) + Math.round(y * 10)) % 9 === 0)
          continue;
        const kind = n % 5 === 0 ? 1 : 0;
        const mesh = out[kind] as THREE.InstancedMesh;
        const slim = kind === 0 && n % 3 === 0;
        t.position.set(x, y + 0.02, z1 - 0.17);
        t.scale.set(slim ? 0.8 : 1, (slim ? 1.12 : 0.78) + ((n * 13) % 5) * 0.05, slim ? 0.8 : 1);
        t.updateMatrix();
        const i = counts[kind] as number;
        mesh.setMatrixAt(i, t.matrix);
        mesh.setColorAt(i, tints[(n * 5 + Math.round(x * 3)) % tints.length] as THREE.Color);
        counts[kind] = i + 1;
      }
    }
    out.forEach((mesh, k) => {
      mesh.count = counts[k] as number;
      mesh.computeBoundingSphere();
    });
    return out;
  }, [venue]);
  useEffect(
    () => () => {
      for (const mesh of meshes) mesh.geometry.dispose();
      (meshes[0]?.material as THREE.Material | undefined)?.dispose();
      for (const mesh of meshes) mesh.dispose();
    },
    [meshes],
  );
  return (
    <group name="back-bar-bottles">
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}

export function Furnishings({
  venue,
  m,
  art,
  choices,
}: Omit<P, "evening"> & { art: boolean; choices: Record<string, string> }) {
  const g = useMemo(() => {
    const f = venue.data.fixtures;
    const seats: THREE.BufferGeometry[] = [];
    const backs: THREE.BufferGeometry[] = [];
    const trims: THREE.BufferGeometry[] = [];
    for (const b of f.banquettes) {
      if (b.disabled || b.x0 === undefined || b.x1 === undefined) continue;
      seats.push(boxGeo(b.x0, 0, 0.12, b.x1, 0.46, b.depth));
      backs.push(boxGeo(b.x0, 0, 0, b.x1, b.backHeight, 0.14, 1.2));
      // Nail-head trim along the top of the back and the seat front (R03, R07).
      trims.push(trim(b.x0, b.x1, b.backHeight - 0.05, 0.142), trim(b.x0, b.x1, 0.38, b.depth + 0.002));
    }
    const [wx0, wz0, wx1, wz1] = f.wineWall.rect;
    const wine = boxGeo(wx0, 0, wz0, wx1, f.wineWall.height, wz1);
    const wineCanopy = boxGeo(
      wx0 - 0.15,
      f.wineWall.height,
      wz0 - 0.2,
      wx1 + 0.15,
      f.wineWall.height + 0.12,
      wz1 + 0.2,
    );
    // The wine wall's bottles, ends out in a rack, on its two faces toward the room (cards, V3).
    const rack: THREE.BufferGeometry[] = [];
    const RACK_H = (CARD.rack[3] - CARD.rack[1]) * CARD_STRIP_M;
    for (let y = 0.15; y + RACK_H <= f.wineWall.height - 0.1; y += RACK_H) {
      const south = card(wx1 - wx0 - 0.06, RACK_H, CARD.rack, (wx1 - wx0) / CARD_STRIP_M);
      south.translate((wx0 + wx1) / 2, y + RACK_H / 2, wz1 + 0.005);
      const east = card(wz1 - wz0 - 0.06, RACK_H, CARD.rack, (wz1 - wz0) / CARD_STRIP_M);
      east.rotateY(Math.PI / 2);
      east.translate(wx1 + 0.005, y + RACK_H / 2, (wz0 + wz1) / 2);
      rack.push(south, east);
    }
    // String instruments hung on the brick above the back bar's canopy (R02).
    const instruments: THREE.BufferGeometry[] = [];
    const [bx0, , bx1] = venue.data.backBar.rect.value;
    for (const [i, [u, y, size, turn]] of (
      [
        [0.12, 4.15, 0.95, 0.25],
        [0.35, 4.05, 0.62, -0.3],
        [0.62, 4.2, 0.95, -0.15],
        [0.85, 4.0, 0.62, 0.35],
      ] as const
    ).entries()) {
      const q = card(size, size, i % 2 ? CARD.violin : CARD.guitar);
      q.rotateZ(turn);
      q.translate(bx0 + (bx1 - bx0) * u, y, 0.015);
      instruments.push(q);
    }
    return {
      seats: merge(seats),
      backs: merge(backs),
      trims: merge(trims),
      wine,
      wineCanopy,
      rack: merge(rack),
      instruments: merge(instruments),
    };
  }, [venue]);
  // Hidden or swapped per scenario (VEN-05).
  const paintings = useMemo(
    () =>
      venue.data.fixtures.paintings.flatMap((p, i) => {
        const a = artFor(choices[p.id], p.palette);
        return a.hidden ? [] : [{ ...p, tex: paintingTexture(a.palette, 11 + i * 31) }];
      }),
    [venue, choices],
  );
  useEffect(
    () => () => {
      for (const p of paintings) p.tex.dispose();
    },
    [paintings],
  );
  return (
    <group name="furnishings">
      {g.seats && <mesh geometry={g.seats} material={m.leather} receiveShadow castShadow />}
      {g.backs && <mesh geometry={g.backs} material={m.leather} receiveShadow />}
      {g.trims && <mesh geometry={g.trims} material={m.nailTrim} />}
      <mesh geometry={g.wine} material={m.wineFrame} />
      {g.rack && <mesh geometry={g.rack} material={m.cards} />}
      {g.instruments && <mesh geometry={g.instruments} material={m.cards} visible={art} />}
      <mesh geometry={g.wineCanopy} material={m.steel} />
      {/* Plan view is a flat working drawing: no wall art lying outside the walls. */}
      {paintings.map((p) => (
        <group key={p.id} visible={art}>
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
        // Dense cluster of short vertical brass cylinders with bare bulbs, each on a thin arm from
        // the central stem, filling an upright ovoid (R02, R03; owner-confirmed 2026-10-16).
        const cy = (c.bottom + top) / 2;
        const ry = (top - c.bottom) / 2;
        const count = 84;
        for (let i = 0; i < count; i++) {
          const shell = i % 3 === 0 ? 0.55 : 1;
          const v = 1 - (2 * (i + 0.5)) / count;
          const ring = Math.sqrt(1 - v * v);
          const a = i * 2.39996;
          const lx = Math.cos(a) * ring * c.radius * shell;
          const lz = Math.sin(a) * ring * c.radius * shell;
          const y = cy + v * ry * 0.92;
          const reach = Math.hypot(lx, lz);
          if (reach > 0.05) {
            const arm = new THREE.CylinderGeometry(0.006, 0.006, reach, 4);
            arm.rotateZ(Math.PI / 2);
            arm.rotateY(-Math.atan2(lz, lx));
            arm.translate(c.x + lx / 2, y + 0.17, c.z + lz / 2);
            wires.push(arm);
          }
          t.position.set(c.x + lx, y + 0.09, c.z + lz);
          t.scale.set(1, 1, 1);
          t.updateMatrix();
          tubes.push(t.matrix.clone());
          t.position.y = y - 0.04;
          t.updateMatrix();
          bulbs.push(t.matrix.clone());
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
      <group visible={pendants}>
        <primitive object={built.drums} />
        <primitive object={built.drumGlow} />
        {built.cords && <mesh geometry={built.cords} material={m.blackMetal} />}
      </group>
      {built.wires && <mesh geometry={built.wires} material={m.blackMetal} />}
    </group>
  );
}
