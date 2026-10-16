import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { type Part, type Prim } from "../../src/domain/layout/decor";
import { PIECE_GENERATORS, makePiece } from "../../src/domain/layout/pieces";
import { type Item, blocksFloor, footprint, shapeOf } from "../../src/domain/layout/items";
import { checkPlacement } from "../../src/domain/layout/validate";
import { resolveOptions } from "../../src/domain/library/catalog";

/** Triangles per unit primitive, as the scene builds them (Decor.tsx `primitives`). */
const TRIS: Record<"high" | "low", Record<Prim, number>> = {
  high: { cylinder: 56, sphere: 108, box: 12, cone: 28, bowl: 28 },
  low: { cylinder: 32, sphere: 36, box: 12, cone: 16, bowl: 16 },
};
const triangles = (parts: Part[], q: "high" | "low") => parts.reduce((n, p) => n + TRIS[q][p.prim], 0);

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
  test("[LIB-01] [LIB-06] [LIB-07] [LIB-08] [LIB-09] [LIB-10] every family is stocked", () => {
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
      ]),
    );
  });

  test("[LIB-11] [PLT-03] each piece stays inside its own triangle budget, desktop and phone", () => {
    for (const e of pieces) {
      if (e.model.kind !== "parametric" || e.lowModel.kind !== "parametric") continue;
      const o = resolveOptions(e, {}) as Record<string, number | string | boolean>;
      const high = makePiece(e.model.generator, e.model.params, o).parts;
      const low = makePiece(e.lowModel.generator, e.lowModel.params, o).parts;
      expect(triangles(high, "high"), e.id).toBeLessThanOrEqual(e.budget.triangles);
      expect(triangles(low, "low"), e.id).toBeLessThanOrEqual(e.budget.phoneTriangles);
    }
  });

  test("[LIB-08] lights glow: bulbs or light beams in every light, text for the monogram", () => {
    for (const e of pieces.filter((x) => x.family === "light")) {
      if (e.model.kind !== "parametric") continue;
      const p = makePiece(e.model.generator, e.model.params, resolveOptions(e, {}) as Record<string, string>);
      expect(p.parts.some((x) => x.slot === "bulb" || x.slot === "beam") || !!p.text, e.id).toBe(true);
    }
  });

  test("[LIB-09] signs carry the couple's own words", () => {
    const neon = shapeOf(item("sign-neon", 9, 8, { text: "Ana & Ben" }), catalog);
    expect(neon.kind).toBe("piece");
    if (neon.kind !== "piece") return;
    expect(makePiece(neon.generator, neon.params, neon.options).text?.value).toBe("Ana & Ben");
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
});
