import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { type Item, chairsWorld, footprint, shapeOf } from "../../src/domain/layout/items";
import { checkPlacement, findFreeSpot, toggledObstacles } from "../../src/domain/layout/validate";
import { countLayout, tableLabels } from "../../src/domain/layout/counts";
import { rectTable, roundTable } from "../../src/domain/library/sizing";
import { venueSampleItems } from "../../src/domain/scenario/scenario";
import { area, polygonInside } from "../../src/domain/geometry";
import { alignSnap } from "../../src/domain/layout/align";
import { walkArea } from "../../src/domain/layout/walk";

const table = (over: Partial<Item> = {}): Item => ({
  id: "x",
  libraryId: "table-rect",
  x: 5,
  z: 5,
  rotY: 0,
  options: { seats: 8 },
  ...over,
});

describe("venue model", () => {
  test("[VEN-01] the venue data parses and builds a closed room with the bar inside it", () => {
    expect(venue.width).toBeGreaterThan(10);
    expect(area(venue.room)).toBeCloseTo(venue.width * venue.depth);
    for (const o of venue.obstacles)
      expect(polygonInside(o.polygon, venue.room) || o.id.startsWith("stair")).toBe(true);
  });
});

describe("placement", () => {
  test("[LAY-04] a table dropped on the bar is refused and names the bar", () => {
    const r = checkPlacement(table({ x: 7.7, z: 6 }), [], venue, catalog);
    expect(r).toEqual({ ok: false, reason: "Overlaps the bar" });
  });

  test("[LAY-04] a table overlapping another table is refused and names it", () => {
    const items = venueSampleItems();
    const labels = tableLabels(items, catalog);
    const r = checkPlacement(table({ x: 2.8, z: 3.0 }), items, venue, catalog, [], labels);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Overlaps table [12]/);
  });

  test("[VEN-03] items outside the main room are refused", () => {
    expect(checkPlacement(table({ x: 8, z: 15.5 }), [], venue, catalog)).toEqual({
      ok: false,
      reason: "Outside the room",
    });
  });

  test("[VEN-04] a table fully on the raised floor sits on the raised level", () => {
    expect(checkPlacement(table({ x: 13.6, z: 6.6 }), [], venue, catalog)).toEqual({
      ok: true,
      level: "raised",
    });
  });

  test("[VEN-04] a table straddling the raised floor edge is refused", () => {
    const r = checkPlacement(table({ x: 11.2, z: 10.4 }), [], venue, catalog);
    expect(r).toEqual({ ok: false, reason: "Straddles the raised floor edge" });
  });

  test("[LAY-11] the DJ booth may sit at the mezzanine spot (option 3) but nowhere else off the floor", () => {
    const dj: Item = { id: "dj", libraryId: "dj-booth", x: 13.7, z: 15, rotY: 0, options: { spot: "dj3" } };
    expect(checkPlacement(dj, [], venue, catalog)).toEqual({ ok: true, level: "mezzanine" });
    expect(checkPlacement({ ...dj, options: { spot: "free" } }, [], venue, catalog).ok).toBe(false);
  });

  test("[LAY-12] the bar stools block placement only when shown", () => {
    const [x0, , x1, z1] = venue.data.bar.outer.value;
    const t = table({ x: (x0 + x1) / 2, z: z1 + 1.4, options: { seats: 4 } });
    expect(checkPlacement(t, [], venue, catalog).ok).toBe(true);
    const shown = toggledObstacles(venue, { barStools: true });
    expect(checkPlacement(t, [], venue, catalog, shown)).toEqual({
      ok: false,
      reason: "Overlaps the bar stools",
    });
  });

  test("[LAY-01] free-spot search finds a valid place (turning the table if needed)", () => {
    const items = venueSampleItems().filter((i) => !["t5", "t6", "t7"].includes(i.id));
    const t = table({ id: "new", options: { seats: 12 } });
    const spot = findFreeSpot(t, [8, 7], items, venue, catalog);
    expect(spot).not.toBeNull();
    expect(checkPlacement({ ...t, ...spot }, items, venue, catalog).ok).toBe(true);
  });

  test("[LAY-01] free-spot search reports no space when nothing fits", () => {
    const floor: Item = {
      id: "big",
      libraryId: "dance-floor",
      x: 8,
      z: 7,
      rotY: 0,
      options: { width: 10, depth: 8 },
    };
    expect(findFreeSpot(floor, [8, 7], venueSampleItems(), venue, catalog)).toBeNull();
  });
});

describe("tables and chairs", () => {
  test("[LAY-03] rectangle length follows seats; 12 seats = 6 + 6, or 5 + 5 + 2 ends", () => {
    expect(rectTable(12, false)).toMatchObject({ perSide: 6, length: 4.2, width: 1.0 });
    expect(rectTable(12, true)).toMatchObject({ perSide: 5, length: 3.5 });
    const s = shapeOf(table({ options: { seats: 12, ends: true } }), catalog);
    expect(s.kind === "rectTable" && s.chairs.length).toBe(12);
  });

  test("[LAY-03] round tables use rental diameters and chairs face the centre", () => {
    expect(roundTable(10).diameter).toBe(1.8);
    const s = shapeOf(table({ libraryId: "table-round", options: { seats: 6 } }), catalog);
    if (s.kind !== "roundTable") throw new Error("expected round");
    for (const c of s.chairs) {
      const dotToCentre = Math.sin(c.rotY) * -c.x + Math.cos(c.rotY) * -c.z;
      expect(dotToCentre).toBeGreaterThan(0);
    }
  });

  test("[LAY-02] rotating a table rotates its chairs and footprint with it", () => {
    const t = table({ rotY: Math.PI / 2 });
    const shape = shapeOf(t, catalog);
    const chairs = chairsWorld(t, shape);
    expect(chairs.every((c) => Math.abs(c.z - t.z) < 1.7 && Math.abs(c.x - t.x) < 0.9)).toBe(true);
    const fp = footprint(t, catalog);
    const xs = fp.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9 + 2 * 0.55);
  });
});

describe("venue sample and counts", () => {
  test("[LAY-09] every item of the venue sample plan is validly placed", () => {
    const items = venueSampleItems();
    for (const it of items) {
      const r = checkPlacement(it, items, venue, catalog);
      expect(r, `${it.id}: ${JSON.stringify(r)}`).toMatchObject({ ok: true });
    }
  });

  test("[LAY-07] 75 guests with the venue sample: 8 tables, 60 seats, 15 without a seat", () => {
    const c = countLayout(venueSampleItems(), 75, catalog);
    expect(c).toMatchObject({ tables: 8, seats: 60, guests: 75, withoutSeat: 15 });
    expect(c.danceFloorM2).toBeCloseTo(21.78);
  });

  test("[LAY-10] tables are numbered in order, the sweetheart table is ♥, own labels win", () => {
    const items = venueSampleItems();
    const first = items[0] as Item;
    items[0] = { ...first, label: "7" };
    const labels = tableLabels(items, catalog);
    expect(labels.get("t1")).toBe("7");
    expect(labels.get("t2")).toBe("1");
    expect(labels.get("t7")).toBe("6");
    expect(labels.get("sweetheart")).toBe("♥");
    expect(labels.has("dance")).toBe(false);
  });
});

describe("alignment snapping", () => {
  const others = [table({ id: "a", x: 4, z: 3 }), table({ id: "b", x: 10, z: 9 })];

  test("[LAY-05] a dragged table snaps into line with a nearby table's centre", () => {
    const r = alignSnap({ x: 4.12, z: 5.4 }, others, catalog);
    expect(r.x).toBe(4);
    expect(r.z).toBe(5.4);
    expect(r.guides).toEqual([{ axis: "x", value: 4, with: "a" }]);
  });

  test("[LAY-05] outside the tolerance, or far away, nothing snaps", () => {
    expect(alignSnap({ x: 4.3, z: 5.4 }, others, catalog).guides).toEqual([]);
    expect(alignSnap({ x: 10.05, z: 1 }, others, catalog).guides).toEqual([]);
  });

  test("[LAY-05] the dance area is not a line to snap to", () => {
    const floor: Item = { id: "f", libraryId: "dance-floor", x: 6, z: 6, rotY: 0, options: {} };
    expect(alignSnap({ x: 6.05, z: 7 }, [floor], catalog).guides).toEqual([]);
  });
});

describe("walking", () => {
  const off = { barStools: false };

  test("[CAM-03] a guest can stand on open floor but not in the bar, a table or past the walls", () => {
    const t = table({ x: 3, z: 9 });
    const free = walkArea(venue, [t], catalog, off);
    expect(free([3, 12.5])).toBe(true);
    expect(free([3, 9])).toBe(false);
    expect(free([7, 5])).toBe(false);
    expect(free([0.1, 5])).toBe(false);
    expect(free([8, 14.25])).toBe(false);
  });

  test("[CAM-03] walking starts on the entrance landing; both stair flights block", () => {
    const free = walkArea(venue, [], catalog, off);
    const start = venue.data.cameraPresets.walkStart?.position ?? [0, 0, 0];
    expect(free([start[0] ?? 0, start[2] ?? 0])).toBe(true);
    expect(free([14, 13.7])).toBe(false);
    expect(free([14, 12.5])).toBe(false);
  });

  test("[CAM-03] the dance area is walked on; bar stools block only when shown", () => {
    const floor: Item = { id: "f", libraryId: "dance-floor", x: 3, z: 11, rotY: 0, options: {} };
    expect(walkArea(venue, [floor], catalog, off)([3, 11])).toBe(true);
    const [x0, , x1, z1] = venue.data.bar.outer.value;
    const front: [number, number] = [(x0 + x1) / 2, z1 + 0.3];
    expect(walkArea(venue, [], catalog, off)(front)).toBe(true);
    expect(walkArea(venue, [], catalog, { barStools: true })(front)).toBe(false);
  });

  test("[CAM-03] the raised-floor railing blocks; its steps let a guest through", () => {
    const free = walkArea(venue, [], catalog, off);
    const [a, b] = venue.railing[0] ?? [
      [0, 0],
      [0, 0],
    ];
    expect(free([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])).toBe(false);
    for (const s of venue.data.levels.raised.steps.value) {
      expect(free([(s.from[0] + s.to[0]) / 2, (s.from[1] + s.to[1]) / 2])).toBe(true);
    }
  });
});

describe("library pieces", () => {
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

  test("[LIB-08] hanging and ceiling lights reach from 2.2 m to just under the ceiling", () => {
    const ceiling = venue.data.room.ceiling.value;
    const lights = [...catalog.values()].filter(
      (e) => e.family === "light" && (e.placement === "hanging" || e.placement === "ceiling"),
    );
    expect(lights.length).toBeGreaterThan(0);
    for (const e of lights) {
      const hang = e.options.find((o) => o.key === "hang");
      expect(hang?.type === "number" && hang.min <= 2.4 && hang.max >= 5.5 && hang.max < ceiling).toBe(true);
    }
  });
});
