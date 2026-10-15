import { describe, expect, test } from "vitest";
import { exportScenario, importScenario, venueSampleScenario } from "../../src/domain/scenario/scenario";
import { buildCatalog } from "../../src/domain/library/catalog";
import { libraryFiles } from "./fixtures";

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
  test("[LIB-11] every library entry has size, placement, thumbnail, source, licence and budget", () => {
    const catalog = buildCatalog(libraryFiles);
    expect(catalog.size).toBeGreaterThanOrEqual(9);
    for (const e of catalog.values()) {
      expect(e.thumbnail).toMatch(/^thumbs\/.+\.webp$/);
      expect(e.source.licence.length).toBeGreaterThan(1);
      expect(e.budget.triangles).toBeGreaterThan(0);
    }
  });

  test("[LIB-12] a duplicate id across library files is rejected", () => {
    expect(() => buildCatalog([...libraryFiles, libraryFiles[0]])).toThrow(/Duplicate/);
  });
});
