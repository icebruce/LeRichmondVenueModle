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
const decor = (
  patch: Partial<typeof DEFAULT_STYLE>,
  settings = false,
  more = { menus: false, tableNumbers: false, linenLength: "floor" as "lap" | "floor" },
) =>
  tableDecor(
    shape,
    { ...styleOf(round, DEFAULT_STYLE), candles: "none", ...patch },
    catalog,
    { settings, ...more },
    1,
  );

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

  test("[REQ-03] the requested candles: three glass cylinders of 20, 25 and 30 cm on eucalyptus, within budget", () => {
    const e = catalog.get("candle-sand-trio");
    expect(e?.requestId).toBe("req-f6462824");
    const parts = decor({ candles: "candle-sand-trio", florals: "none" });
    const glass = parts.filter((p) => p.slot === "glass").map((p) => Math.round(p.sy * 100));
    expect(glass.sort()).toEqual([20, 25, 30]);
    expect(parts.filter((p) => p.slot === "flame")).toHaveLength(3);
    expect(parts.some((p) => p.slot === "leaf") && parts.some((p) => p.slot === "flower")).toBe(true);
    expect(Math.abs(heightOf(parts) - (e?.sizeM.h ?? 0))).toBeLessThanOrEqual(0.01);
    const reach = Math.max(...parts.map((p) => Math.max(Math.abs(p.x) + p.sx, Math.abs(p.z) + p.sz)));
    expect(2 * reach).toBeLessThanOrEqual((e?.sizeM.w ?? 0) + 0.01);
    // Triangles per primitive as Decor.tsx builds them, desktop and phone.
    const tris = (q: Record<string, number>) => parts.reduce((n, p) => n + (q[p.prim] ?? 0), 0);
    expect(tris({ cylinder: 56, sphere: 108, cone: 28, box: 12 })).toBeLessThanOrEqual(
      e?.budget.triangles ?? 0,
    );
    expect(tris({ cylinder: 32, sphere: 36, cone: 16, box: 12 })).toBeLessThanOrEqual(
      e?.budget.phoneTriangles ?? 0,
    );
  });

  test("[LIB-04] place settings: a charger, plate, two glasses and cutlery per seat", () => {
    const parts = decor({ charger: "gold" }, true);
    expect(parts.filter((p) => p.slot === "ceramic")).toHaveLength(8);
    expect(parts.filter((p) => p.slot === "brass")).toHaveLength(8);
    expect(parts.filter((p) => p.slot === "glass")).toHaveLength(16);
    expect(decor({ charger: "none" }, true).filter((p) => p.slot === "brass")).toHaveLength(0);
  });

  test("[LIB-03] runners: velvet lies flat and drops over the ends; chiffon is wider and sheer", () => {
    const velvet = decor({ runner: "runner-velvet-emerald" });
    expect(velvet.filter((p) => p.slot === "fabric")).toHaveLength(3);
    // The ends hang outside the floor-length cloth (radius + 0.03 at the top, + 0.07 at the floor).
    const radius = shape.kind === "roundTable" ? shape.diameter / 2 : 0;
    const drops = velvet.filter((p) => p.y < 0);
    expect(drops).toHaveLength(2);
    for (const d of drops) expect(Math.abs(d.x) - d.sx / 2).toBeGreaterThan(radius + 0.07);
    const chiffon = decor({ runner: "runner-chiffon-blush" });
    expect(chiffon.every((p) => p.slot === "sheer")).toBe(true);
    expect(Math.max(...chiffon.map((p) => p.sz))).toBeGreaterThan(Math.max(...velvet.map((p) => p.sz)));
  });

  test("[LIB-03] [LIB-04] napkins and menu cards on every plate; one number holder per table", () => {
    const parts = decor({ napkin: "napkin-sage" }, true, {
      menus: true,
      tableNumbers: true,
      linenLength: "floor",
    });
    expect(parts.filter((p) => p.slot === "fabric")).toHaveLength(8);
    expect(parts.filter((p) => p.slot === "fabric").every((p) => p.colour === "#a3b19a")).toBe(true);
    // Eight menu cards plus the table number's card.
    expect(parts.filter((p) => p.slot === "paper")).toHaveLength(9);
    expect(decor({ napkin: "none" }, true).filter((p) => p.slot === "fabric")).toHaveLength(0);
  });

  test("[LIB-06] flower types change the arrangement: big peonies, many tiny baby's breath", () => {
    const blooms = (flowerType: string) =>
      decor({ florals: "floral-low", flowerType }).filter((p) => p.slot === "flower");
    const size = (ps: { sx: number }[]) => ps.reduce((a, p) => a + p.sx, 0) / ps.length;
    expect(size(blooms("peony"))).toBeGreaterThan(size(blooms("rose")));
    expect(blooms("babysBreath").length).toBeGreaterThan(blooms("rose").length * 2);
    expect(decor({ florals: "floral-low", flowerType: "blossom" }).some((p) => p.slot === "black")).toBe(
      true,
    );
  });

  test("[LIB-03] [LIB-04] [LIB-05] [LIB-06] every table-top entry uses a known décor generator", () => {
    // Everything that sits on a table top, runners included (floor florals are pieces, below).
    for (const e of [...catalog.values()].filter((x) => x.placement === "table")) {
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
  test("[SCN-08] [LAY-12] a version 1 scenario file opens, upgraded to the current version", () => {
    const v1 = {
      schemaVersion: 1,
      id: "old",
      name: "From step 1",
      revision: 0,
      items: [],
      style: { linen: "linen-white", linenLength: "lap", chair: "chair-oval", lighting: "day" },
      guests: { count: 70, seed: 1 },
      thresholds: { aisleM: 1, clearanceM: 1.2, m2PerDancer: 0.45, dancingShare: 0.35 },
      venueToggles: { communalTable: true, barStools: false },
      notes: [],
      updatedAt: "2026-10-15T00:00:00.000Z",
    };
    const s = parseScenario(v1);
    expect(s.schemaVersion).toBe(3);
    expect(s.style).toMatchObject({ runner: "none", napkin: "none", menus: false, tableNumbers: false });
    expect(s.style).toMatchObject({ linen: "linen-white", linenLength: "lap", candles: "candle-votives" });
    // The communal table is no longer modelled (LAY-12): an old file opens without it.
    expect(s.venueToggles).toEqual({ barStools: false, paintings: {} });
  });
});

describe("paintings", () => {
  test("[VEN-05] each painting can stay, be hidden or be swapped; the choice is saved and undoable", async () => {
    const { artFor, ARTWORKS } = await import("../../src/domain/venue/art");
    const own = ["#111111", "#222222", "#333333"];
    expect(artFor(undefined, own)).toEqual({ hidden: false, palette: own });
    expect(artFor("hidden", own)).toEqual({ hidden: true });
    expect(artFor("botanical", own)).toEqual({ hidden: false, palette: ARTWORKS[0]?.palette });
    let n = 0;
    const editor = createEditor(
      { venue, catalog, now: () => "2026-10-16T00:00:00.000Z", newId: () => `id${++n}` },
      [venueSampleScenario("A", "2026-10-16T00:00:00.000Z")],
    );
    editor.setPainting("popart", "hidden");
    editor.setPainting("horseman", "gold");
    expect(editor.active().venueToggles.paintings).toEqual({ popart: "hidden", horseman: "gold" });
    editor.setPainting("popart", null);
    expect(editor.active().venueToggles.paintings).toEqual({ horseman: "gold" });
    editor.undo();
    expect(editor.active().venueToggles.paintings.popart).toBe("hidden");
  });
});
