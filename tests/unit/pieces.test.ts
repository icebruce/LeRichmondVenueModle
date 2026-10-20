import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { FLOWER_TYPES, type Part, type Prim, bottomOf } from "../../src/domain/layout/decor";
import { PIECE_GENERATORS, makePiece } from "../../src/domain/layout/pieces";
import { type Item, blocksFloor, footprint, shapeOf } from "../../src/domain/layout/items";
import { checkPlacement } from "../../src/domain/layout/validate";
import { countLayout } from "../../src/domain/layout/counts";
import { hangingLight, resolveOptions } from "../../src/domain/library/catalog";

/** Triangles per unit primitive, as the scene builds them (Decor.tsx `primitives`). */
const TRIS: Record<"high" | "low", Record<Prim, number>> = {
  high: { cylinder: 56, sphere: 108, box: 12, cone: 28, bowl: 28, plane: 2, drop: 96 },
  low: { cylinder: 32, sphere: 36, box: 12, cone: 16, bowl: 16, plane: 2, drop: 36 },
};
const triangles = (parts: Part[], q: "high" | "low") => parts.reduce((n, p) => n + TRIS[q][p.prim], 0);

/** Each unit primitive's bounds before scaling, as Decor.tsx builds it (cylinders, boxes from y = 0). */
const UNIT: Record<Prim, [number, number]> = {
  cylinder: [0, 1],
  sphere: [-1, 1],
  box: [0, 1],
  cone: [0, 1],
  bowl: [0, 1],
  plane: [0, 1],
  drop: [-1, 1],
};
const HALF: Record<Prim, number> = {
  cylinder: 1,
  sphere: 1,
  box: 0.5,
  cone: 1,
  bowl: 1,
  plane: 0.5,
  drop: 1,
};
/** World bounds of the solid parts (light beams, glows and floor spots are light, not objects). */
function bounds(parts: Part[]): THREE.Box3 {
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  for (const p of parts) {
    if (["beam", "glow"].includes(p.slot)) continue;
    const [y0, y1] = UNIT[p.prim];
    const h = HALF[p.prim];
    const unit = new THREE.Box3(
      new THREE.Vector3(-h, y0, p.prim === "plane" ? 0 : -h),
      new THREE.Vector3(h, y1, p.prim === "plane" ? 0 : h),
    );
    m.compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)),
      new THREE.Vector3(p.sx, p.sy, p.sz),
    );
    box.union(unit.applyMatrix4(m));
  }
  return box;
}

const pieces = [...catalog.values()].filter(
  (e) => e.model.kind === "parametric" && PIECE_GENERATORS.includes(e.model.generator),
);
const item = (libraryId: string, x = 9, z = 8, options = {}): Item => ({
  id: libraryId,
  libraryId,
  x,
  z,
  rotY: 0,
  options,
});

describe("step-3 library pieces", () => {
  test("[LIB-01] [LIB-02] [LIB-06] [LIB-07] [LIB-08] [LIB-09] [LIB-10] every family is stocked", () => {
    const has = (prefix: string) => pieces.filter((e) => e.id.startsWith(prefix)).map((e) => e.id);
    expect(has("plant-")).toHaveLength(6);
    expect(has("light-")).toEqual(
      expect.arrayContaining([
        "light-string",
        "light-edison",
        "light-uplight",
        "light-pinspot",
        "light-chandelier",
        "light-disco",
        "light-dj",
        "light-monogram",
      ]),
    );
    expect(has("sign-")).toEqual(expect.arrayContaining(["sign-welcome", "sign-chart", "sign-neon"]));
    expect(has("floral-")).toEqual(
      expect.arrayContaining(["floral-arch", "floral-wall", "floral-pedestal", "floral-hanging"]),
    );
    expect(pieces.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        "stage",
        "photo-booth",
        "station-food",
        "station-dessert",
        "bar-module",
        "table-cake",
        "table-gift",
        "chair-lounge",
        "chair-loveseat",
      ]),
    );
  });

  test("[LIB-11] [PLT-03] each piece stays inside its own triangle budget, desktop and phone", () => {
    for (const e of pieces) {
      if (e.model.kind !== "parametric" || e.lowModel.kind !== "parametric") continue;
      const o = resolveOptions(e, {}) as Record<string, number | string | boolean>;
      const high = makePiece(e.model.generator, e.model.params, o, e.sizeM).parts;
      const low = makePiece(e.lowModel.generator, e.lowModel.params, o, e.sizeM).parts;
      expect(triangles(high, "high"), e.id).toBeLessThanOrEqual(e.budget.triangles);
      expect(triangles(low, "low"), e.id).toBeLessThanOrEqual(e.budget.phoneTriangles);
    }
  });

  test("[LIB-08] lights glow: bulbs or light beams in every light, text for the monogram", () => {
    for (const e of pieces.filter((x) => x.family === "light")) {
      if (e.model.kind !== "parametric") continue;
      const p = makePiece(
        e.model.generator,
        e.model.params,
        resolveOptions(e, {}) as Record<string, string>,
        e.sizeM,
      );
      expect(p.parts.some((x) => ["bulb", "beam", "glow"].includes(x.slot)) || !!p.text, e.id).toBe(true);
    }
  });

  test("[LIB-09] signs carry the couple's own words", () => {
    const neon = shapeOf(item("sign-neon", 9, 8, { text: "Ana & Ben" }), catalog);
    expect(neon.kind).toBe("piece");
    if (neon.kind !== "piece") return;
    expect(makePiece(neon.generator, neon.params, neon.options, neon.size).text?.value).toBe("Ana & Ben");
  });

  test("[LIB-08] hanging lights never block the floor; floor pieces do", () => {
    const strand = item("light-string", 7.5, 5);
    const stage = item("stage", 9, 8);
    expect(blocksFloor(shapeOf(strand, catalog))).toBe(false);
    expect(blocksFloor(shapeOf(stage, catalog))).toBe(true);
    // String lights may hang over a table; a stage may not overlap one.
    const table: Item = { id: "t", libraryId: "table-round", x: 7.5, z: 5, rotY: 0, options: { seats: 8 } };
    expect(checkPlacement(strand, [table], venue, catalog).ok).toBe(true);
    expect(checkPlacement({ ...stage, x: 7.5, z: 5 }, [table], venue, catalog).ok).toBe(false);
    expect(footprint(strand, catalog).length).toBe(4);
  });

  test("[LIB-08] hanging lights, and only they, get a height handle under their lowest point", () => {
    const get = (id: string) => catalog.get(id) as NonNullable<ReturnType<typeof catalog.get>>;
    for (const id of ["light-string", "light-edison", "light-pinspot", "light-chandelier", "light-disco"])
      expect(hangingLight(get(id)), id).toBe(true);
    for (const id of ["light-uplight", "floral-hanging", "sign-neon"])
      expect(hangingLight(get(id)), id).toBe(false);
    const bottom = (id: string) => {
      const s = shapeOf(item(id, 8, 7, { hang: 2.8 }), catalog);
      return s.kind === "piece" ? bottomOf(makePiece(s.generator, s.params, s.options, s.size).parts) : NaN;
    };
    // A chandelier ends near its hanging height; a sagging strand and a mirror ball reach below it.
    expect(Math.abs(bottom("light-chandelier") - 2.8)).toBeLessThan(0.2);
    expect(bottom("light-string")).toBeLessThan(2.7);
    expect(bottom("light-disco")).toBeLessThan(2.7);
    for (const id of ["light-string", "light-edison", "light-pinspot", "light-chandelier", "light-disco"])
      expect(bottom(id), id).toBeGreaterThan(1.8);
  });

  test("[LIB-11] [LIB-12] every piece is built to its catalogue size, and stays inside its footprint", () => {
    const TOL = 0.05;
    for (const e of pieces) {
      const shape = shapeOf(item(e.id), catalog);
      if (shape.kind !== "piece") continue;
      // The catalogue size is the piece at its default options, measured from the floor.
      expect(Math.abs(shape.width - e.sizeM.w), `${e.id} width`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(shape.depth - e.sizeM.d), `${e.id} depth`).toBeLessThanOrEqual(TOL);
      expect(Math.abs(shape.height - e.sizeM.h), `${e.id} height`).toBeLessThanOrEqual(TOL);
      if (!shape.blocks) continue;
      // What collisions and aisle checks use must hold the whole piece.
      const b = bounds(makePiece(shape.generator, shape.params, shape.options, shape.size).parts);
      expect(Math.max(-b.min.x, b.max.x), `${e.id} spills sideways`).toBeLessThanOrEqual(
        shape.width / 2 + TOL,
      );
      expect(Math.max(-b.min.z, b.max.z), `${e.id} spills front/back`).toBeLessThanOrEqual(
        shape.depth / 2 + TOL,
      );
      expect(b.max.y, `${e.id} taller than its size`).toBeLessThanOrEqual(shape.height + TOL);
    }
  });

  test("[LIB-12] a new piece kind with no generator code fails loudly", () => {
    expect(() => makePiece("light", { kind: "lava" }, {}, { w: 1, d: 1, h: 1 })).toThrow(/lava/);
  });

  test("[LIB-06] flower types change installations: big peonies, small baby's breath, grey-green eucalyptus", () => {
    const pedestal = catalog.get("floral-pedestal");
    if (!pedestal || pedestal.model.kind !== "parametric") throw new Error("no pedestal");
    const params = pedestal.model.params;
    const blooms = (flowerType: string) =>
      makePiece(
        "floralPiece",
        params,
        { ...resolveOptions(pedestal, {}), flowerType } as Record<string, string>,
        pedestal.sizeM,
      ).parts;
    const size = (ps: Part[]) => {
      const f = ps.filter((p) => p.slot === "flower");
      return f.reduce((a, p) => a + p.sx, 0) / f.length;
    };
    expect(size(blooms("peony"))).toBeGreaterThan(size(blooms("rose")) * 1.2);
    expect(size(blooms("babysBreath"))).toBeLessThan(size(blooms("rose")) * 0.6);
    expect(blooms("eucalyptus").some((p) => p.slot === "leaf" && p.colour === "#9fb5a8")).toBe(true);
    // Never more blooms than roses, so every flower type stays inside the budget.
    expect(blooms("babysBreath").length).toBeLessThanOrEqual(blooms("rose").length);
    // Every installation offers exactly the flower types table arrangements know.
    for (const e of pieces.filter((x) => x.family === "floral")) {
      const o = e.options.find((x) => x.key === "flowerType");
      expect(o?.type === "choice" ? o.choices.map((c) => c.value) : [], e.id).toEqual(
        Object.keys(FLOWER_TYPES),
      );
    }
  });
});

describe("dance area and hanging lights", () => {
  test("[LIB-01] the dance area is an outline: sized freely, no floor finish, its area counted", () => {
    const entry = catalog.get("dance-floor");
    expect(entry?.name).toBe("Dance area");
    expect(entry?.options.map((o) => o.key)).toEqual(["width", "depth"]);
    const area: Item = {
      id: "d",
      libraryId: "dance-floor",
      x: 6,
      z: 11,
      rotY: 0,
      options: { width: 5, depth: 4 },
    };
    expect(countLayout([area], 75, catalog).danceFloorM2).toBeCloseTo(20);
  });

  test("[LIB-08] hanging and ceiling lights hang from 2.2 m to just under the ceiling, even on the raised floor", () => {
    const ceiling = venue.data.room.ceiling.value - venue.raised.height;
    const lights = [...catalog.values()].filter(
      (e) => e.family === "light" && (e.placement === "hanging" || e.placement === "ceiling"),
    );
    expect(lights.length).toBeGreaterThan(0);
    for (const e of lights) {
      const hang = e.options.find((o) => o.key === "hang");
      if (hang?.type !== "number") throw new Error(`${e.id} has no hang`);
      expect(hang.min, e.id).toBe(2.2);
      expect(hang.max, e.id).toBeGreaterThanOrEqual(5);
      const shape = shapeOf(
        { id: "l", libraryId: e.id, x: 6, z: 6, rotY: 0, options: { hang: hang.max } },
        catalog,
      );
      if (shape.kind !== "piece") throw new Error(`${e.id} is not a piece`);
      const { parts } = makePiece(shape.generator, shape.params, shape.options, shape.size);
      // Every solid part (cords included) stays under the ceiling at the highest setting.
      // A tilted rod (a wire) rises only by its length times the cosine of its tilt.
      const top = Math.max(
        ...parts.filter((x) => x.prim !== "plane").map((x) => x.y + Math.max(0, x.sy * Math.cos(x.rz ?? 0))),
      );
      expect(top, e.id).toBeLessThanOrEqual(ceiling + 1e-9);
    }
  });
});
