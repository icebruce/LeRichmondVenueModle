import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { DECOR_GENERATORS, heightOf, tableDecor } from "../../src/domain/layout/decor";
import { type Item, shapeOf } from "../../src/domain/layout/items";
import {
  DEFAULT_STYLE,
  parseScenario,
  styleOf,
  venueSampleScenario,
} from "../../src/domain/scenario/scenario";
import { createEditor } from "../../src/state/editor";

const round: Item = { id: "r", libraryId: "table-round", x: 4, z: 11, rotY: 0, options: { seats: 8 } };
const shape = shapeOf(round, catalog);
const decor = (patch: Partial<typeof DEFAULT_STYLE>, settings = false) =>
  tableDecor(shape, { ...styleOf(round, DEFAULT_STYLE), candles: "none", ...patch }, catalog, settings, 1);

describe("décor", () => {
  test("[DEC-03] florals have realistic heights: low ≤ 30 cm, tall 80–120 cm", () => {
    expect(heightOf(decor({ florals: "floral-low" }))).toBeLessThanOrEqual(0.3);
    expect(heightOf(decor({ florals: "floral-bud" }))).toBeLessThanOrEqual(0.3);
    const tall = heightOf(decor({ florals: "floral-tall" }));
    expect(tall).toBeGreaterThanOrEqual(0.8);
    expect(tall).toBeLessThanOrEqual(1.2);
  });

  test("[DEC-02] every candle preset has flames that glow in the evening", () => {
    for (const e of [...catalog.values()].filter((x) => x.family === "candle")) {
      const parts = decor({ candles: e.id });
      expect(parts.some((p) => p.slot === "flame")).toBe(true);
    }
    expect(decor({ candles: "none" })).toEqual([]);
  });

  test("[LIB-04] place settings: a charger, plate, two glasses and cutlery per seat", () => {
    const parts = decor({ charger: "gold" }, true);
    expect(parts.filter((p) => p.slot === "ceramic")).toHaveLength(8);
    expect(parts.filter((p) => p.slot === "brass")).toHaveLength(8);
    expect(parts.filter((p) => p.slot === "glass")).toHaveLength(16);
    expect(decor({ charger: "none" }, true).filter((p) => p.slot === "brass")).toHaveLength(0);
  });

  test("[LIB-05] [LIB-06] every candle and floral entry uses a known décor generator", () => {
    for (const e of [...catalog.values()].filter((x) => x.family === "candle" || x.family === "floral")) {
      expect(e.model.kind === "parametric" && DECOR_GENERATORS.includes(e.model.generator)).toBe(true);
    }
  });

  test("[DEC-01] [DEC-05] décor applies to all tables or to selected ones; placements never move", () => {
    let n = 0;
    const editor = createEditor(
      { venue, catalog, now: () => "2026-10-16T00:00:00.000Z", newId: () => `id${++n}` },
      [venueSampleScenario("A", "2026-10-16T00:00:00.000Z")],
    );
    const before = editor.active().items.map(({ x, z, rotY }) => ({ x, z, rotY }));
    editor.applyStyle(["t1", "t2"], { linen: "linen-navy" });
    const s1 = editor.active();
    expect(styleOf(s1.items.find((i) => i.id === "t1") as Item, s1.style).linen).toBe("linen-navy");
    expect(styleOf(s1.items.find((i) => i.id === "t3") as Item, s1.style).linen).toBe("linen-ivory");
    editor.applyStyle("all", { linen: "linen-champagne", candles: "candle-tapers" });
    const s2 = editor.active();
    expect(s2.items.every((i) => styleOf(i, s2.style).linen === "linen-champagne")).toBe(true);
    expect(s2.items.every((i) => !i.style)).toBe(true);
    expect(s2.items.map(({ x, z, rotY }) => ({ x, z, rotY }))).toEqual(before);
    editor.undo();
    expect(styleOf(editor.active().items[0] as Item, editor.active().style).linen).toBe("linen-navy");
  });
});

describe("scenario files", () => {
  test("[SCN-08] a version 1 scenario file opens, upgraded to the current version", () => {
    const v1 = {
      schemaVersion: 1,
      id: "old",
      name: "From step 1",
      revision: 0,
      items: [],
      style: { linen: "linen-white", linenLength: "lap", chair: "chair-oval", lighting: "day" },
      guests: { count: 70, seed: 1 },
      thresholds: { aisleM: 1, clearanceM: 1.2, m2PerDancer: 0.45, dancingShare: 0.35 },
      venueToggles: { communalTable: false, barStools: false },
      notes: [],
      updatedAt: "2026-10-15T00:00:00.000Z",
    };
    const s = parseScenario(v1);
    expect(s.schemaVersion).toBe(2);
    expect(s.style).toMatchObject({ linen: "linen-white", linenLength: "lap", candles: "candle-votives" });
    expect(s.venueToggles.paintings).toEqual({});
  });
});
