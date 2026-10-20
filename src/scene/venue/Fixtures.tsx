import * as THREE from "three";
import { Suspense, useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import { artFor } from "../../domain/venue/art";
import type { OpeningData, WallData } from "../../domain/venue/schema";
import { type Materials, bevelGeo, boxGeo } from "../materials";
import { CARD, CARD_STRIP_M, paintingTexture } from "../textures";
import { openingMatrix } from "./walls";
import { lit, mapped } from "./Architecture";
import type { Bake } from "../useBake";
import { type PieceModel, PieceModelLoader } from "../items/geometry";
import { requestWarmup } from "../frames";

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

/**
 * A hanging curtain `width` × `height` with `folds` pleats `depth` deep: rounded crests, tight
 * valleys, each pleat a little deeper or shallower than the next and opening out toward the hem
 * (R09, R10).
 */
function curtainGeo(width: number, height: number, folds: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, folds * 10, 6);
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + width / 2) / width;
    const down = 0.5 - pos.getY(i) / height;
    const s = Math.sin(u * Math.PI * 2 * folds);
    const h = Math.sin(Math.floor(u * folds) * 12.9898) * 43758.5453;
    const vary = 0.75 + 0.5 * (h - Math.floor(h));
    pos.setZ(i, Math.sign(s) * Math.abs(s) ** 0.6 * depth * vary * (0.85 + 0.3 * down));
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
function buildOpenings(wall: WallData, sill: VenueModel["data"]["fixtures"]["plants"]["sill"]) {
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
  const plants: THREE.BufferGeometry[] = [];
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
      // The planter outside the glass along the sill and its greenery, crossed cards (R05, R09).
      add(frames, [local(0.1, o.sill - 0.2, -0.42, w - 0.1, o.sill, -0.2)]);
      for (let i = 0; i < sill.perWindow; i++)
        for (const turn of [0, Math.PI / 2]) {
          const q = card(sill.height, sill.height, CARD.plant);
          q.rotateY(turn + i);
          q.translate(((i + 0.5) / sill.perWindow) * w, o.sill - 0.02 + sill.height / 2, -0.31);
          add(plants, [q]);
        }
      const ch = o.head + 0.25;
      for (const [cx, cw] of [
        [-0.32, 0.8],
        [w + 0.32, 0.8],
      ] as const) {
        const g = curtainGeo(cw, ch, 6, 0.07);
        g.translate(cx, ch / 2, 0.16);
        curtains.push(g.applyMatrix4(mtx));
      }
      add(frames, [local(-0.8, ch, 0.12, w + 0.8, ch + 0.04, 0.2)]);
      // Sheers across the glass, behind the velvet, from the rod down to the sill (R10).
      const sheer = curtainGeo(w, ch - o.sill, Math.round(w / 0.3), 0.04);
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
    plants: merge(plants),
  };
}

/** Glazing, curtains, doors and the views beyond them; hidden on walls cut away by the camera. */
export function Openings({ venue, m, evening, cutWalls }: P & { cutWalls: ReadonlySet<string> }) {
  const perWall = useMemo(
    () =>
      venue.data.walls.map((w) => ({ id: w.id, built: buildOpenings(w, venue.data.fixtures.plants.sill) })),
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
          {built.plants && <mesh geometry={built.plants} material={m.cards} />}
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
      {/* At night the street facades are dark through the glass (R11). */}
      <mesh geometry={g.street} material={evening ? m.darkVoid : m.street} />
      {g.lights && <mesh geometry={g.lights} material={m.bulb} visible={evening} />}
    </group>
  );
}

/**
 * Four wide dark-wood bays (R02, R03, R14), with four lit wood shelves 0.40 m apart above a clear
 * zone over the counter.
 */
const SHELVES = [1.4, 1.8, 2.2, 2.6];
const BAYS = 4;
/** The tallest a bottle stands, so it clears the shelf above. */
const BOTTLE_MAX = 0.35;

/** A flat card facing +z, `w` by `h` metres, showing `region` of the card sheet (`repeat` times across). */
function card(w: number, h: number, region: readonly number[], repeat = 1): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = region as [number, number, number, number];
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0) * repeat, v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** The back bar: cabinet, rear counter and its fridges and espresso machine, frame and shelves, canopy, plants and neon. */
export function backBarParts(venue: VenueModel) {
  const b = venue.data.backBar;
  const [x0, z0, x1, z1] = b.rect.value;
  const rc = b.rearCounter;
  const top = b.height;
  const cabinet = boxGeo(x0, 0, z0, x1, 0.95, z1);
  const counter = boxGeo(rc[0], 0, rc[1], rc[2], 0.92, rc[3]);
  const counterTop = boxGeo(rc[0], 0.92, rc[1] - 0.02, rc[2], 0.96, rc[3] + 0.03);
  // Dark glass-door fridges under the counter, framed in stainless (R02, R03).
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
  // The wide chrome espresso machine near the middle of the counter (R02, R03): body, a raised
  // cup-warmer with cups, two group heads with black handles, a steam wand, the drip tray.
  const ex = (rc[0] + rc[2]) / 2 + 0.3;
  const ez = (rc[1] + rc[3]) / 2;
  steel.push(
    bevelGeo(ex - 0.48, 1.0, ez - 0.25, ex + 0.48, 1.42, ez + 0.08, 0.035),
    boxGeo(ex - 0.46, 1.44, ez - 0.22, ex + 0.46, 1.46, ez + 0.06),
  );
  const cups: THREE.BufferGeometry[] = [];
  for (let cx = ex - 0.38; cx <= ex + 0.38; cx += 0.095)
    for (const cz of [ez - 0.14, ez - 0.02]) {
      const cup = new THREE.CylinderGeometry(0.035, 0.028, 0.065, 10);
      cup.translate(cx, 1.495, cz);
      cups.push(cup);
    }
  const dark: THREE.BufferGeometry[] = [boxGeo(ex - 0.44, 0.96, ez + 0.02, ex + 0.44, 1.0, ez + 0.3)];
  const wand = new THREE.CylinderGeometry(0.009, 0.009, 0.28, 6);
  wand.rotateX(0.35);
  wand.translate(ex + 0.4, 1.12, ez + 0.14);
  steel.push(wand);
  for (const dx of [-0.2, 0.2]) {
    const head = new THREE.CylinderGeometry(0.05, 0.055, 0.08, 14);
    head.translate(ex + dx, 1.06, ez + 0.13);
    steel.push(head);
    const handle = new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6);
    handle.rotateX(Math.PI / 2 - 0.3);
    handle.translate(ex + dx, 1.05, ez + 0.25);
    dark.push(handle);
  }
  // Frame: plain dark posts between the bays, a stepped crown moulding (R02, R14).
  const frame: THREE.BufferGeometry[] = [];
  const bay = (x1 - x0) / BAYS;
  for (let i = 0; i <= BAYS; i++) {
    const x = x0 + i * bay;
    frame.push(bevelGeo(x - 0.05, 0.95, z0, x + 0.05, top, z1, 0.012));
  }
  frame.push(boxGeo(x0, 0.95, z0, x1, top, z0 + 0.04));
  for (const [y, out] of [
    [top - 0.12, 0],
    [top - 0.04, 0.03],
    [top + 0.03, 0.06],
  ] as const)
    frame.push(bevelGeo(x0 - out, y, z0, x1 + out, y + 0.09, z1 + out, 0.01));
  const mirror = card(x1 - x0 - 0.08, top - 0.12 - 0.95, [0, 0, 1, 1], BAYS);
  mirror.translate((x0 + x1) / 2, (0.95 + top - 0.12) / 2, z0 + 0.045);
  const strips: THREE.BufferGeometry[] = [];
  const cards: THREE.BufferGeometry[] = [];
  for (const [i, y] of SHELVES.entries()) {
    // Wood shelf boards, with a warm light strip under each front edge lighting the row beneath.
    frame.push(boxGeo(x0 + 0.05, y - 0.04, z0 + 0.05, x1 - 0.05, y, z1 - 0.02));
    strips.push(boxGeo(x0 + 0.05, y - 0.052, z1 - 0.07, x1 - 0.05, y - 0.04, z1 - 0.05));
    // Behind the front row: backlit bottles, and glasses on the lowest shelf.
    const row = card(x1 - x0 - 0.1, 0.32, i === 0 ? CARD.glasses : CARD.bottles, (x1 - x0) / CARD_STRIP_M);
    row.translate((x0 + x1) / 2, y + 0.16, z0 + 0.14);
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
  // Ferns spilling over the canopy's front edge and dried branches in white pots (R02, R03).
  const pots: THREE.BufferGeometry[] = [];
  const potTop = b.canopyHeight + 0.18 + 0.16;
  for (let x = x0 + 0.3, i = 0; x < x1; x += 1.25, i++) {
    const plant = i % 2 === 0;
    const size = plant ? 0.85 : 1.0;
    const pz = z1 + 0.65;
    const pot = new THREE.CylinderGeometry(0.1, 0.075, 0.16, 12);
    pot.translate(x, b.canopyHeight + 0.18 + 0.08, pz);
    pots.push(pot);
    for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const q = card(size, size, plant ? CARD.plant : CARD.grass);
      q.rotateY(turn + i);
      q.translate(x, potTop - 0.03 + size / 2, pz);
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
    cups: merge(cups),
    dark: merge(dark),
    frame: merge(frame),
    mirror,
    strips: merge(strips),
    cards: merge(cards),
    pots: merge(pots),
    canopy,
    downlights: merge(downlights),
    neon,
    neonBack,
  };
}

export function BackBar({ venue, m, bake }: Omit<P, "evening"> & { bake: Bake | null }) {
  const g = useMemo(() => {
    const p = backBarParts(venue);
    // Cabinet, counter, frame and shelves carry the bake (V2b): the creases in the bays, under the
    // counter top and the canopy.
    return {
      ...p,
      cabinet: mapped(p.cabinet, bake),
      counter: mapped(p.counter, bake),
      frame: p.frame && mapped(p.frame, bake),
    };
  }, [venue, bake]);
  return (
    <group name="back-bar">
      <mesh geometry={g.cabinet} material={lit(m, bake, "backBarWood")} />
      <mesh geometry={g.counter} material={lit(m, bake, "barBase")} />
      <mesh geometry={g.counterTop} material={m.stainless} />
      {g.fridges && <mesh geometry={g.fridges} material={m.fridgeGlass} />}
      {g.steel && <mesh geometry={g.steel} material={m.stainless} />}
      {g.cups && <mesh geometry={g.cups} material={m.marble} />}
      {g.dark && <mesh geometry={g.dark} material={m.blackMetal} />}
      {g.frame && <mesh geometry={g.frame} material={lit(m, bake, "backBarWood")} />}
      <mesh geometry={g.mirror} material={m.antiqueMirror} />
      {g.strips && <mesh geometry={g.strips} material={m.shelfGlow} />}
      {g.cards && <mesh geometry={g.cards} material={m.cards} />}
      {g.pots && <mesh geometry={g.pots} material={m.marble} />}
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
    const tints = ["#b8742a", "#2f3d22", "#b9c4b3", "#4a2615", "#c98f3b"].map((c) => new THREE.Color(c));
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
        const h = kind === 0 ? 0.31 : 0.21;
        t.position.set(x, y, z1 - 0.17);
        t.scale.set(
          slim ? 0.8 : 1,
          Math.min(BOTTLE_MAX / h, (slim ? 1.0 : 0.82) + ((n * 13) % 5) * 0.04),
          slim ? 0.8 : 1,
        );
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

/** Banquettes, the wine case and its crates, and the instruments on the brick. */
export function furnishingParts(venue: VenueModel) {
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
  // The wine wall as a lit glass case (R02, R15): upright backlit bottles on glass shelves behind a
  // glass front, on its two faces toward the room, with wooden crates at its foot.
  const caseCards: THREE.BufferGeometry[] = [];
  const caseShelves: THREE.BufferGeometry[] = [];
  const caseGlass: THREE.BufferGeometry[] = [];
  const ROW = 0.36;
  for (let y = 0.4; y + ROW <= f.wineWall.height - 0.1; y += ROW) {
    const south = card(wx1 - wx0 - 0.08, ROW - 0.04, CARD.bottles, (wx1 - wx0) / CARD_STRIP_M);
    south.translate((wx0 + wx1) / 2, y + ROW / 2, wz1 + 0.006);
    const east = card(wz1 - wz0 - 0.08, ROW - 0.04, CARD.bottles, (wz1 - wz0) / CARD_STRIP_M);
    east.rotateY(Math.PI / 2);
    east.translate(wx1 + 0.006, y + ROW / 2, (wz0 + wz1) / 2);
    caseCards.push(south, east);
    caseShelves.push(
      boxGeo(wx0 + 0.03, y - 0.01, wz1, wx1 - 0.03, y, wz1 + 0.04),
      boxGeo(wx1, y - 0.01, wz0 + 0.03, wx1 + 0.04, y, wz1 - 0.03),
    );
  }
  caseGlass.push(
    boxGeo(wx0 + 0.02, 0.35, wz1 + 0.045, wx1 - 0.02, f.wineWall.height - 0.05, wz1 + 0.05),
    boxGeo(wx1 + 0.045, 0.35, wz0 + 0.02, wx1 + 0.05, f.wineWall.height - 0.05, wz1 - 0.02),
  );
  const crates = [
    boxGeo(wx0 + 0.04, 0, wz1 - 0.35, wx1 - 0.04, 0.3, wz1 + 0.12),
    boxGeo(wx0 + 0.1, 0, wz1 - 0.95, wx1 + 0.12, 0.28, wz1 - 0.45),
  ];
  // Violins and guitars hung on wires in front of the brick above the canopy, tilted (R02).
  const instruments: THREE.BufferGeometry[] = [];
  const [bx0, , bx1] = venue.data.backBar.rect.value;
  for (const [i, [u, y, size, turn]] of (
    [
      [0.08, 4.5, 0.9, 0.7],
      [0.26, 4.35, 0.62, -0.65],
      [0.44, 4.6, 0.9, 0.6],
      [0.6, 4.4, 0.62, -0.75],
      [0.77, 4.55, 0.9, 0.65],
      [0.93, 4.35, 0.62, -0.6],
    ] as const
  ).entries()) {
    const q = card(size, size, i % 2 ? CARD.violin : CARD.guitar);
    q.rotateZ(turn);
    q.translate(bx0 + (bx1 - bx0) * u, y, 0.06);
    instruments.push(q);
  }
  return {
    seats: merge(seats),
    backs: merge(backs),
    trims: merge(trims),
    wine,
    wineCanopy,
    caseCards: merge(caseCards),
    caseShelves: merge(caseShelves),
    caseGlass: merge(caseGlass),
    crates: merge(crates),
    instruments: merge(instruments),
  };
}

export function Furnishings({
  venue,
  m,
  art,
  choices,
  bake,
}: Omit<P, "evening"> & { art: boolean; choices: Record<string, string>; bake: Bake | null }) {
  const g = useMemo(() => {
    const p = furnishingParts(venue);
    // The banquettes and the wine case carry the bake (V2b): the crease where seat meets back.
    return {
      ...p,
      seats: p.seats && mapped(p.seats, bake),
      backs: p.backs && mapped(p.backs, bake),
      wine: mapped(p.wine, bake),
    };
  }, [venue, bake]);
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
      {g.seats && <mesh geometry={g.seats} material={lit(m, bake, "leather")} receiveShadow castShadow />}
      {g.backs && <mesh geometry={g.backs} material={lit(m, bake, "leather")} receiveShadow />}
      {g.trims && <mesh geometry={g.trims} material={m.nailTrim} />}
      <mesh geometry={g.wine} material={lit(m, bake, "wineFrame")} />
      {g.caseCards && <mesh geometry={g.caseCards} material={m.cards} />}
      {g.caseShelves && <mesh geometry={g.caseShelves} material={m.shelfGlow} />}
      {g.caseGlass && <mesh geometry={g.caseGlass} material={m.glass} />}
      {g.crates && <mesh geometry={g.crates} material={m.timber} />}
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
    const drums: THREE.Matrix4[] = [];
    const cords: THREE.BufferGeometry[] = [];
    const t = new THREE.Object3D();
    const C = venue.ceiling;
    for (const c of venue.data.fixtures.chandeliers) {
      if (c.kind === "brassCluster") {
        const top = c.top ?? c.bottom + 2;
        const stem = new THREE.CylinderGeometry(0.03, 0.03, C - c.bottom, 6);
        stem.translate(c.x, (C + c.bottom) / 2, c.z);
        wires.push(stem);
        // Tiers of horizontal arms off the central stem, widest at the top (an upside-down cone),
        // each arm ending in a short brass cylinder open at the bottom with a bare bulb under it;
        // the upper tiers carry an inner ring too (R02, R03, R11; owner-confirmed 2026-10-16).
        const tiers = 5;
        for (let k = 0; k < tiers; k++) {
          const y = top - 0.12 - (k * (top - c.bottom - 0.25)) / (tiers - 1);
          const outer = c.radius * (1 - (0.6 * k) / (tiers - 1));
          const rings = k < 3 ? [outer, outer * 0.55] : [outer];
          rings.forEach((rad, ring) => {
            const n = Math.round((ring ? 8 : 16) * (rad / c.radius)) + (ring ? 3 : 4);
            for (let j = 0; j < n; j++) {
              const a = ((j + (ring ? 0.5 : 0)) / n) * Math.PI * 2 + k * 0.4;
              const [lx, lz] = [Math.cos(a) * rad, Math.sin(a) * rad];
              const arm = new THREE.CylinderGeometry(0.006, 0.006, rad, 4);
              arm.rotateZ(Math.PI / 2);
              arm.rotateY(-a);
              arm.translate(c.x + lx / 2, y + 0.085, c.z + lz / 2);
              wires.push(arm);
              t.position.set(c.x + lx, y, c.z + lz);
              t.scale.set(1, 1, 1);
              t.updateMatrix();
              tubes.push(t.matrix.clone());
              t.position.y = y - 0.125;
              t.updateMatrix();
              bulbs.push(t.matrix.clone());
            }
          });
        }
      } else {
        const h = c.height ?? 1.2;
        const cage: THREE.BufferGeometry[] = [];
        // A dense wire cage (R05, R10); the crystal chandelier inside it is a model (`Birdcages`).
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
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
      <Suspense fallback={null}>
        <Birdcages venue={venue} />
      </Suspense>
      <group visible={pendants}>
        <primitive object={built.drums} />
        <primitive object={built.drumGlow} />
        {built.cords && <mesh geometry={built.cords} material={m.blackMetal} />}
      </group>
      {built.wires && <mesh geometry={built.wires} material={m.blackMetal} />}
    </group>
  );
}

/** Where one of the room's plants stands: base point, height and turn. */
type PlantSpot = { file: string; at: THREE.Vector3; height: number; rotY: number };

/** The room's own potted plants (V6): fiddle-leaf figs, loaded with the room, one mesh per model. */
export function VenuePlants({ venue, low }: { venue: VenueModel; low: boolean }) {
  const spots = useMemo(
    () =>
      venue.data.fixtures.plants.floor.map((p, i) => ({
        file: p.file,
        at: new THREE.Vector3(p.x, 0, p.z),
        height: p.height,
        rotY: i * 2.1,
      })),
    [venue],
  );
  return (
    <Suspense fallback={null}>
      {/* No shadow on phones, as for placed plants (draw-call budget). */}
      <PlantModels spots={spots} shadows={!low} />
    </Suspense>
  );
}

function PlantModels({ spots, shadows }: { spots: PlantSpot[]; shadows: boolean }) {
  const files = useMemo(() => [...new Set(spots.map((s) => s.file))].sort(), [spots]);
  const loaded = useLoader(PieceModelLoader, files) as PieceModel[];
  const meshes = useMemo(() => {
    const t = new THREE.Object3D();
    return files.map((file, i) => {
      const model = loaded[i] as PieceModel;
      const mine = spots.filter((s) => s.file === file);
      const mesh = new THREE.InstancedMesh(model.geometry, model.material, mine.length);
      mine.forEach((s, k) => {
        t.position.copy(s.at);
        t.rotation.set(0, s.rotY, 0);
        t.scale.setScalar(s.height / model.height);
        t.updateMatrix();
        mesh.setMatrixAt(k, t.matrix);
      });
      mesh.castShadow = shadows;
      return mesh;
    });
  }, [files, loaded, spots, shadows]);
  // Made after the first frames: compiled now, not when a view first shows them (PLT-03).
  useEffect(() => requestWarmup(), [meshes]);
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={files[i]} object={mesh} />
      ))}
    </>
  );
}

/**
 * The crystal chandeliers inside the birdcages (V6): one Meshy model, hung just above each cage's
 * bottom ring. Its pale crystal and candle sleeves glow faintly by their own colour.
 */
function Birdcages({ venue }: { venue: VenueModel }) {
  const file = venue.data.fixtures.chandelierModels.birdcage;
  const model = useLoader(PieceModelLoader, file) as PieceModel;
  const mesh = useMemo(() => {
    const cages = venue.data.fixtures.chandeliers.filter((c) => c.kind === "birdcage");
    model.material.emissiveMap = model.material.map;
    model.material.emissive.set("#ffd9a0");
    model.material.emissiveIntensity = 0.35;
    const mesh = new THREE.InstancedMesh(model.geometry, model.material, cages.length);
    const t = new THREE.Object3D();
    cages.forEach((c, i) => {
      t.position.set(c.x, c.bottom + 0.04, c.z);
      t.rotation.set(0, i * 0.7, 0);
      t.updateMatrix();
      mesh.setMatrixAt(i, t.matrix);
    });
    return mesh;
  }, [venue, model]);
  // Made after the first frames: compiled now, not when a view first shows it (PLT-03).
  useEffect(() => requestWarmup(), [mesh]);
  return <primitive object={mesh} />;
}
