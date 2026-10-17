import * as THREE from "three";
import { useMemo } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueModel } from "../../domain/venue/model";
import type { Vec2 } from "../../domain/geometry";
import { type Materials, TILE, boxGeo, metreUV } from "../materials";
import { CUT_HEIGHT, buildWall } from "./walls";

type Props = { venue: VenueModel; m: Materials; cutWalls: ReadonlySet<string>; showCeiling: boolean };

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  if (!g) throw new Error("merge failed");
  return g;
}

export function Walls({ venue, m, cutWalls }: Pick<Props, "venue" | "m" | "cutWalls">) {
  const t = venue.data.room.wallThickness.value;
  const built = useMemo(
    () =>
      venue.data.walls.map((w) => ({
        id: w.id,
        full: buildWall(w, venue.ceiling, t, false),
        cut: buildWall(w, venue.ceiling, t, true),
      })),
    [venue, t],
  );
  return (
    <group name="walls">
      {built.map((w) => {
        const g = cutWalls.has(w.id) ? w.cut : w.full;
        return (
          <group key={w.id} name={`wall-${w.id}`}>
            {g.brick && <mesh geometry={g.brick} material={m.brick} receiveShadow castShadow />}
            {g.redBrick && <mesh geometry={g.redBrick} material={m.redBrick} receiveShadow />}
            {g.panel && <mesh geometry={g.panel} material={m.greenPanel} receiveShadow />}
            {g.cap && <mesh geometry={g.cap} material={m.steel} />}
          </group>
        );
      })}
    </group>
  );
}

function shapeFrom(points: readonly Vec2[]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  s.closePath();
  return s;
}

/** Extruded polygon from y0 to y1 (shape x→x, shape y→z). */
function slab(points: readonly Vec2[], y0: number, y1: number, tile: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shapeFrom(points), { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1, 0);
  g.computeVertexNormals();
  return metreUV(g, tile);
}

export function Floors({ venue, m }: Pick<Props, "venue" | "m">) {
  const { tile, raisedTop, raisedSide, joints } = useMemo(() => {
    const W = venue.width;
    const D = venue.depth;
    const tileG = boxGeo(0, -0.05, 0, W, 0, D, TILE.tile);
    const h = venue.raised.height;
    const top = slab(venue.raised.outline, h - 0.02, h, TILE.floor);
    const side = slab(venue.raised.outline, 0, h - 0.02, 1);
    // Light wood strips between the large tiles (R03, R04): every half texture repeat.
    const step = TILE.tile / 2;
    const strips: THREE.BufferGeometry[] = [];
    for (let x = step; x < W; x += step) strips.push(boxGeo(x - 0.016, 0, 0, x + 0.016, 0.003, D));
    for (let z = step; z < D; z += step) strips.push(boxGeo(0, 0, z - 0.016, W, 0.003, z + 0.016));
    return { tile: tileG, raisedTop: top, raisedSide: side, joints: merge(strips) };
  }, [venue]);
  return (
    <group name="floors">
      <mesh geometry={tile} material={m.tile} receiveShadow />
      <mesh geometry={joints} material={m.tileJoint} receiveShadow />
      <mesh geometry={raisedTop} material={m.woodFloor} receiveShadow />
      <mesh geometry={raisedSide} material={m.timber} receiveShadow />
    </group>
  );
}

/** Wrought-iron railing with a timber handrail along the raised floor edge, open at the steps. */
export function Railing({ venue, m }: Pick<Props, "venue" | "m">) {
  const { iron, rail, steps } = useMemo(() => {
    const d = venue.data;
    const h = venue.raised.height;
    const top = h + 0.95;
    const gaps = d.levels.raised.steps.value;
    const ironGeos: THREE.BufferGeometry[] = [];
    const railGeos: THREE.BufferGeometry[] = [];
    for (const [a, b] of venue.railing) {
      const rl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      const n = Math.max(1, Math.round(rl / 0.12));
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n;
        const z = a[1] + ((b[1] - a[1]) * k) / n;
        const thick = k % 8 === 0 ? 0.035 : 0.014;
        ironGeos.push(boxGeo(x - thick, h, z - thick, x + thick, top - 0.05, z + thick));
      }
      const r = new THREE.BoxGeometry(rl, 0.06, 0.08);
      r.rotateY(ang);
      r.translate((a[0] + b[0]) / 2, top, (a[1] + b[1]) / 2);
      railGeos.push(r);
      const bottom = new THREE.BoxGeometry(rl, 0.03, 0.03);
      bottom.rotateY(ang);
      bottom.translate((a[0] + b[0]) / 2, h + 0.1, (a[1] + b[1]) / 2);
      ironGeos.push(bottom);
    }
    const stepGeos = gaps.map((g) => {
      const cx = (g.from[0] + g.to[0]) / 2;
      const cz = (g.from[1] + g.to[1]) / 2;
      const len = Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]);
      const ang = -Math.atan2(g.to[1] - g.from[1], g.to[0] - g.from[0]);
      const s = new THREE.BoxGeometry(len, h / 2, 0.32);
      s.rotateY(ang);
      // Push the tread out of the raised edge, toward the main floor (+z side of the edge here).
      const nx = Math.sin(-ang) * -0.16;
      const nz = Math.cos(-ang) * 0.16;
      s.translate(cx + nx, h / 4, cz + nz);
      return s;
    });
    return { iron: merge(ironGeos), rail: merge(railGeos), steps: stepGeos.length ? merge(stepGeos) : null };
  }, [venue]);
  return (
    <group name="railing">
      <mesh geometry={iron} material={m.blackMetal} castShadow />
      <mesh geometry={rail} material={m.timber} castShadow />
      {steps && <mesh geometry={steps} material={m.woodFloor} receiveShadow />}
    </group>
  );
}

export function Bar({ venue, m, stools }: Pick<Props, "venue" | "m"> & { stools: boolean }) {
  const parts = useMemo(() => {
    const d = venue.data.bar;
    const [x0, z0, x1, z1] = d.outer.value;
    const H = d.counterHeight.value;
    const leg = d.legWidth;
    const front = d.frontDepth;
    const base = [
      boxGeo(x0, 0, z0, x0 + leg, H - 0.05, z1),
      boxGeo(x1 - leg, 0, z0, x1, H - 0.05, z1),
      boxGeo(x0 + leg, 0, z1 - front, x1 - leg, H - 0.05, z1),
    ];
    const o = 0.05;
    const top = [
      boxGeo(x0 - o, H - 0.05, z0, x0 + leg + 0.02, H, z1 + o, TILE.marble),
      boxGeo(x1 - leg - 0.02, H - 0.05, z0, x1 + o, H, z1 + o, TILE.marble),
      boxGeo(x0 + leg, H - 0.05, z1 - front - 0.02, x1 - leg, H, z1 + o, TILE.marble),
    ];
    const rail = [
      boxGeo(x0 - 0.2, 0.2, z0 + 0.2, x0 - 0.16, 0.24, z1 + 0.18),
      boxGeo(x0 - 0.2, 0.2, z1 + 0.16, x1, 0.24, z1 + 0.2),
    ];
    const stoolGeos: THREE.BufferGeometry[] = [];
    const seatGeos: THREE.BufferGeometry[] = [];
    if (stools) {
      // Evenly along the front and both sides (owner, 2026-10-17); the east side stands on the raised
      // floor, so its stools are shorter and every seat sits at the same height under the counter.
      const { front: nf, side: ns } = venue.data.fixtures.venueFurniture.barStools;
      const spots: [number, number, number][] = [];
      for (let i = 0; i < nf; i++) spots.push([x0 + ((i + 0.5) * (x1 - x0)) / nf, z1 + 0.45, 0]);
      for (let i = 0; i < ns; i++) {
        const z = z0 + ((i + 0.5) * (z1 - z0)) / ns;
        spots.push([x0 - 0.45, z, 0], [x1 + 0.45, z, venue.raised.height]);
      }
      for (const [x, z, floor] of spots) {
        const post = new THREE.CylinderGeometry(0.025, 0.04, 0.72 - floor, 8);
        post.translate(x, (0.72 + floor) / 2, z);
        const foot = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 12);
        foot.translate(x, floor + 0.015, z);
        stoolGeos.push(post, foot);
        const seat = new THREE.CylinderGeometry(0.19, 0.18, 0.07, 16);
        seat.translate(x, 0.76, z);
        seatGeos.push(seat);
      }
    }
    return {
      base: merge(base),
      top: merge(top),
      rail: merge(rail),
      stools: stoolGeos.length ? merge(stoolGeos) : null,
      seats: seatGeos.length ? merge(seatGeos) : null,
    };
  }, [venue, stools]);
  return (
    <group name="bar">
      <mesh geometry={parts.base} material={m.barBase} castShadow receiveShadow />
      <mesh geometry={parts.top} material={m.marble} castShadow receiveShadow />
      <mesh geometry={parts.rail} material={m.brass} />
      {parts.stools && <mesh geometry={parts.stools} material={m.blackMetal} castShadow />}
      {parts.seats && <mesh geometry={parts.seats} material={m.timber} castShadow />}
    </group>
  );
}

export function Ceiling({ venue, m, showCeiling }: Pick<Props, "venue" | "m" | "showCeiling">) {
  const g = useMemo(() => {
    const W = venue.width;
    const D = venue.depth;
    const C = venue.ceiling;
    const f = venue.data.fixtures;
    const planks = boxGeo(-0.4, C, -0.4, W + 0.4, C + 0.12, D + 2.6, TILE.ceiling);
    const beams = merge(
      f.timberBeams.positions.map((x) =>
        boxGeo(
          x - f.timberBeams.width / 2,
          C - f.timberBeams.depth,
          -0.35,
          x + f.timberBeams.width / 2,
          C,
          D + 2.4,
          TILE.timber,
        ),
      ),
    );
    const gTop = C - f.timberBeams.depth;
    const girders = merge(
      f.steelGirders.positions.flatMap((z) => [
        boxGeo(
          -0.35,
          gTop - f.steelGirders.depth,
          z - f.steelGirders.width / 2,
          W + 0.35,
          gTop,
          z + f.steelGirders.width / 2,
        ),
        boxGeo(
          -0.35,
          gTop - f.steelGirders.depth - 0.04,
          z - 0.22,
          W + 0.35,
          gTop - f.steelGirders.depth,
          z + 0.22,
        ),
      ]),
    );
    const ducts: THREE.BufferGeometry[] = [];
    for (const z of f.ducts.positions) {
      const c = new THREE.CylinderGeometry(f.ducts.radius, f.ducts.radius, W + 0.7, 20);
      c.rotateZ(Math.PI / 2);
      c.translate(W / 2, C - f.ducts.drop, z);
      ducts.push(c);
    }
    for (const row of f.pendantRows) {
      const c = new THREE.CylinderGeometry(0.02, 0.02, W, 6);
      c.rotateZ(Math.PI / 2);
      c.translate(W / 2, row.height + 0.55, row.z);
      ducts.push(c);
    }
    const s = f.skylight;
    const sky = boxGeo(
      s.x - s.size / 2,
      C - 0.01,
      s.z - s.size / 2,
      s.x + s.size / 2,
      C + 0.02,
      s.z + s.size / 2,
    );
    return { planks, beams, girders, ducts: merge(ducts), sky };
  }, [venue]);
  if (!showCeiling) return null;
  return (
    <group name="ceiling">
      <mesh geometry={g.planks} material={m.ceiling} />
      <mesh geometry={g.beams} material={m.timber} />
      <mesh geometry={g.girders} material={m.steel} />
      <mesh geometry={g.ducts} material={m.blackMetal} />
      <mesh geometry={g.sky} material={m.bulb} />
    </group>
  );
}

/** Mezzanine edge (non-walkable backdrop): fascia, balustrade, dark volume behind (VEN-03). */
export function Mezzanine({ venue, m }: Pick<Props, "venue" | "m">) {
  const g = useMemo(() => {
    const z = venue.data.mezzanine;
    const H = z.floorHeight.value;
    const z0 = z.edgeZ;
    const z1 = z0 + z.depth;
    const fascia = boxGeo(z.xFrom, H - z.fasciaDepth, z0 - 0.02, z.xTo, H, z0 + 0.25);
    const floor = boxGeo(z.xFrom, H - 0.02, z0, z.xTo, H, z1, TILE.floor);
    const back = boxGeo(-0.35, 0, z1, venue.width + 0.35, venue.ceiling, z1 + 0.3);
    // The stair rises behind the edge (owner, 2026-10-17), so the balustrade runs unbroken.
    const bal: THREE.BufferGeometry[] = [boxGeo(z.xFrom, H + 0.1, z0 + 0.045, z.xTo, H + 0.13, z0 + 0.08)];
    for (let x = z.xFrom + 0.06; x < z.xTo; x += 0.13)
      bal.push(boxGeo(x - 0.012, H, z0 + 0.05, x + 0.012, H + 0.98, z0 + 0.075));
    const rail = boxGeo(z.xFrom, H + 0.98, z0 + 0.02, z.xTo, H + 1.04, z0 + 0.11);
    // Kitchen and corridor below the mezzanine: dark volumes seen through the openings.
    const below = boxGeo(0, 0, z0 + 0.36, venue.width, H - z.fasciaDepth, z1);
    return { fascia, floor, back, bal: merge(bal), rail, below };
  }, [venue]);
  return (
    <group name="mezzanine">
      <mesh geometry={g.fascia} material={m.greenPanel} />
      <mesh geometry={g.floor} material={m.woodFloor} />
      <mesh geometry={g.back} material={m.darkVoid} />
      <mesh geometry={g.bal} material={m.blackMetal} />
      <mesh geometry={g.rail} material={m.timber} />
      <mesh geometry={g.below} material={m.darkVoid} />
    </group>
  );
}

/**
 * One straight flight from height y0 to y1, climbing along its longer side from `from` toward `to`:
 * LED-lit treads (R09), and a stringer, wrought-iron balusters and timber handrail along the open
 * edge at `rail` (a z for a flight along x, an x for one along z).
 */
function flightGeo(from: Vec2, to: Vec2, y0: number, y1: number, treads: number, rail: number) {
  const alongX = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]);
  // u runs up the flight, v across it; `box` maps them back to x and z.
  const [ua, ub] = alongX ? [from[0], to[0]] : [from[1], to[1]];
  const [v0, v1] = alongX ? [from[1], to[1]] : [from[0], to[0]];
  const [va, vb] = [Math.min(v0, v1), Math.max(v0, v1)];
  const box = (u0: number, ya: number, w0: number, u1: number, yb: number, w1: number, tile?: number) =>
    alongX ? boxGeo(u0, ya, w0, u1, yb, w1, tile) : boxGeo(w0, ya, u0, w1, yb, u1, tile);
  const run = (ub - ua) / treads;
  const step = (y1 - y0) / treads;
  const wood: THREE.BufferGeometry[] = [];
  const led: THREE.BufferGeometry[] = [];
  const steel: THREE.BufferGeometry[] = [];
  for (let i = 0; i < treads; i++) {
    const a = ua + run * i;
    const y = y0 + step * (i + 1);
    const [lo, hi] = run > 0 ? [a, a + run + 0.03] : [a + run - 0.03, a];
    wood.push(box(lo, y - 0.05, va, hi, y, vb, TILE.floor));
    led.push(box(a - 0.01, y - 0.075, va + 0.02, a + 0.01, y - 0.05, vb - 0.02));
  }
  const du = ub - ua;
  const len = Math.hypot(du, y1 - y0);
  const ang = Math.atan2(y1 - y0, du);
  const mid = (ua + ub) / 2;
  // Built along x, then turned to run along z when the flight does.
  const sloped = (g: THREE.BufferGeometry, y: number) => {
    g.rotateZ(ang);
    if (!alongX) g.rotateY(-Math.PI / 2);
    return alongX ? g.translate(mid, y, rail) : g.translate(rail, y, mid);
  };
  steel.push(sloped(new THREE.BoxGeometry(len + 0.3, 0.28, 0.06), (y0 + y1) / 2 - 0.12));
  const handrail = sloped(new THREE.BoxGeometry(len + 0.2, 0.06, 0.08), (y0 + y1) / 2 + 0.95);
  for (let i = 0; i <= treads * 2; i++) {
    const u = ua + (run / 2) * i;
    const y = y0 + Math.min(y1 - y0, step * Math.ceil(i / 2));
    steel.push(box(u - 0.01, y, rail - 0.01, u + 0.01, y + 0.9, rail + 0.01));
  }
  return { wood, led, steel, rail: handrail };
}

/**
 * Two-flight stair (owner, 2026-10-17): from the entrance east along the raised floor to a turn landing
 * at the street wall, then right, south along that wall and up into the mezzanine behind its edge.
 * The handrails run on the open sides: the raised-floor side, then the room side.
 */
export function Stair({ venue, m }: Pick<Props, "venue" | "m">) {
  const g = useMemo(() => {
    const s = venue.data.stair;
    const H = venue.mezzanineHeight;
    const { rise } = s.flight;
    const f1 = s.flight;
    const lower = flightGeo(f1.from, f1.to, 0, rise, f1.treads, Math.min(f1.from[1], f1.to[1]) + 0.03);
    const f2 = s.upperFlight;
    const upper = flightGeo(f2.from, f2.to, rise, H, f2.treads, Math.min(f2.from[0], f2.to[0]) + 0.03);
    const [ux0, uz0, ux1, uz1] = s.upperLanding;
    const [tx0, tz0, tx1, tz1] = s.topLanding;
    return {
      wood: merge([
        ...lower.wood,
        ...upper.wood,
        boxGeo(ux0, rise - 0.05, uz0, ux1, rise, uz1, TILE.floor),
        boxGeo(tx0, H - 0.05, tz0, tx1, H, tz1, TILE.floor),
      ]),
      led: merge([...lower.led, ...upper.led]),
      steel: merge([...lower.steel, ...upper.steel]),
      rail: merge([lower.rail, upper.rail]),
    };
  }, [venue]);
  return (
    <group name="stair">
      <mesh geometry={g.wood} material={m.backBarWood} castShadow receiveShadow />
      <mesh geometry={g.led} material={m.led} />
      <mesh geometry={g.steel} material={m.blackMetal} castShadow />
      <mesh geometry={g.rail} material={m.timber} />
    </group>
  );
}

export { CUT_HEIGHT };
