import { describe, expect, test } from "vitest";
import tables from "../../data/library/tables.json";
import chairs from "../../data/library/chairs.json";
import linens from "../../data/library/linens.json";
import eventPieces from "../../data/library/event-pieces.json";
import { exportScenario, importScenario, venueSampleScenario } from "../../src/domain/scenario/scenario";
import { buildCatalog } from "../../src/domain/library/catalog";
import { FLOOR_GENERATORS, type Item, shapeOf } from "../../src/domain/layout/items";
import { checkPlacement, findFreeSpot } from "../../src/domain/layout/validate";
import { libraryFiles, venue } from "./fixtures";

describe("scenario files", () => {
  test("[SCN-08] export then import restores the scenario exactly (with a fresh id)", () => {
    const s = venueSampleScenario("a", "2026-10-15T00:00:00.000Z");
    const back = importScenario(exportScenario(s), "b", "2026-10-16T00:00:00.000Z");
    expect({ ...back, id: "a", updatedAt: s.updatedAt }).toEqual(s);
  });

  test("[SCN-08] importing an invalid file throws a readable error", () => {
    expect(() => importScenario('{"scenario":{"name":""}}', "b", "now")).toThrow();
  });
});

describe("library", () => {
  test("[LIB-11] every library entry has size, placement, thumbnail, phone version, source, licence and budget", () => {
    const catalog = buildCatalog(libraryFiles);
    expect(catalog.size).toBeGreaterThanOrEqual(9);
    for (const e of catalog.values()) {
      expect(e.thumbnail).toMatch(/^thumbs\/.+\.webp$/);
      expect(e.source.licence.length).toBeGreaterThan(1);
      expect(e.budget.triangles).toBeGreaterThan(0);
      expect(e.budget.phoneTriangles).toBeLessThanOrEqual(e.budget.triangles);
      expect(e.lowModel).toBeDefined();
      if (e.placement === "floor" && e.family !== "chair" && e.model.kind === "parametric")
        expect(FLOOR_GENERATORS).toContain(e.model.generator);
    }
  });

  test("[LIB-12] a new item is data only: a preset of an existing generator can be added and placed", () => {
    const banquet = {
      ...tables.items[0],
      id: "table-banquet",
      name: "Wide banquet table",
      model: { kind: "parametric", generator: "rectTable", params: { width: 1.2 } },
      lowModel: { kind: "parametric", generator: "rectTable", params: { width: 1.2, quality: "low" } },
    };
    const withPreset = buildCatalog([
      { family: "table", items: [...tables.items, banquet] },
      chairs,
      linens,
      eventPieces,
    ]);
    const item: Item = { id: "b", libraryId: "table-banquet", x: 4, z: 11, rotY: 0, options: { seats: 10 } };
    const shape = shapeOf(item, withPreset);
    expect(shape.kind).toBe("rectTable");
    expect(shape.kind === "rectTable" && shape.width).toBe(1.2);
    expect(checkPlacement(item, [item], venue, withPreset)).toEqual({ ok: true, level: "main" });
    const spot = findFreeSpot(item, [8, 7], [], venue, withPreset, []);
    expect(spot).not.toBeNull();
  });

  test("[LIB-12] an unknown generator fails loudly instead of drawing nothing", () => {
    const bad = { ...tables.items[0], id: "table-odd", model: { kind: "parametric", generator: "nope" } };
    const c = buildCatalog([{ family: "table", items: [bad] }]);
    expect(() => shapeOf({ id: "o", libraryId: "table-odd", x: 0, z: 0, rotY: 0, options: {} }, c)).toThrow(
      /unknown generator/,
    );
  });

  test("[LIB-03] [DEC-01] tablecloths: white, ivory, champagne, black, navy and bare wood, colours in the data", () => {
    const linensIn = [...buildCatalog(libraryFiles).values()].filter((e) => e.family === "linen");
    expect(linensIn.map((e) => e.id).sort()).toEqual([
      "linen-bare",
      "linen-black",
      "linen-champagne",
      "linen-ivory",
      "linen-navy",
      "linen-white",
    ]);
    for (const e of linensIn) {
      expect(e.model.kind === "parametric" && e.model.params.colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("[LIB-12] a duplicate id across library files is rejected", () => {
    expect(() => buildCatalog([...libraryFiles, libraryFiles[0]])).toThrow(/Duplicate/);
  });
});
