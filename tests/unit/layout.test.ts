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
import { VASE_GAP_M, barTopLength, barTopPlace, barTopShare, moveVase } from "../../src/domain/venue/model";
import type { Vec2 } from "../../src/domain/geometry";

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
    // The stair's landing and flights end on the south wall, which the inside test counts as outside;
    // they must still stay within the room's bounds.
    for (const o of venue.obstacles) {
      if (!o.id.startsWith("stair")) expect(polygonInside(o.polygon, venue.room), o.id).toBe(true);
      for (const [x, z] of o.polygon) {
        expect(x, o.id).toBeGreaterThanOrEqual(0);
        expect(x, o.id).toBeLessThanOrEqual(venue.width);
        expect(z, o.id).toBeGreaterThanOrEqual(0);
        expect(z, o.id).toBeLessThanOrEqual(venue.depth);
      }
    }
  });

  test("[VEN-01] the west wall is two garage doors of ≈ 5.6 m and a 0.6 m divider, then a small wall", () => {
    const west = venue.data.walls.find((w) => w.id === "west");
    const doors = (west?.openings ?? [])
      .filter((o) => o.kind === "garageDoor")
      .sort((a, b) => a.start - b.start);
    expect(west?.openings.every((o) => o.kind === "garageDoor")).toBe(true);
    expect(doors.map((o) => o.end - o.start)).toEqual([expect.closeTo(5.6, 1), expect.closeTo(5.6, 1)]);
    const [south, north] = doors;
    expect((north?.start ?? 0) - (south?.end ?? 0)).toBeCloseTo(0.6);
    // The wall runs from the kitchen (south) end: a short solid piece there, the doors up to the north end.
    expect(south?.start).toBeGreaterThan(0.5);
    expect(venue.depth - (north?.end ?? 0)).toBeLessThan(0.3);
  });

  test("[VEN-01] the bar fronts ≈ 5 m from the kitchen wall and seats 5 at its front", () => {
    const [x0, z0, x1, z1] = venue.data.bar.outer.value;
    expect(venue.depth - z1).toBeGreaterThanOrEqual(4.9);
    expect(venue.depth - z1).toBeLessThanOrEqual(5.2);
    expect(z1 - z0).toBeGreaterThan(x1 - x0);
    expect(venue.data.fixtures.venueFurniture.barStools).toEqual({ front: 5, side: 6 });
    expect((x1 - x0) / 5).toBeGreaterThanOrEqual(0.6);
  });

  test("[VEN-04] [VEN-01] the raised floor runs up to the stair with no gap; its one step is beside the bar", () => {
    const { flight, upperFlight, upperLanding } = venue.data.stair;
    const southEdge = Math.max(...venue.raised.outline.map((p) => p[1]));
    expect(Math.min(flight.from[1], flight.to[1])).toBeCloseTo(southEdge);
    expect(venue.data.levels.raised.steps.value).toHaveLength(1);
    const [step] = venue.data.levels.raised.steps.value;
    const [, , bx1, bz1] = venue.data.bar.outer.value;
    expect(Math.hypot((step?.from[0] ?? 0) - bx1, (step?.from[1] ?? 0) - bz1)).toBeLessThan(0.5);
    // No railing along the stair: the stair's own balustrade bounds that edge.
    const alongStair = venue.railing.some(
      ([a, b]) => a[1] === southEdge && b[1] === southEdge && a[0] > flight.from[0],
    );
    expect(alongStair).toBe(false);
    // First flight east to the street wall, then a right turn: south along that wall, up and behind the edge.
    expect(flight.to[0]).toBeGreaterThan(flight.from[0]);
    expect(upperLanding[2]).toBe(venue.width);
    expect(upperFlight.to[1]).toBeGreaterThan(venue.data.mezzanine.edgeZ);
    expect(Math.abs(upperFlight.to[1] - upperFlight.from[1])).toBeGreaterThan(
      Math.abs(upperFlight.to[0] - upperFlight.from[0]),
    );
  });
});

describe("entrance and stairwell", () => {
  test("[VEN-01] the entrance opens ≈ 1.5–2 m west of the stair foot; the second flight rises through a stairwell", () => {
    const south = venue.data.walls.find((w) => w.id === "south");
    const corridor = south?.openings.find((o) => o.id === "corridor");
    if (!south || !corridor) throw new Error("no corridor");
    // The south wall runs from the street (east) end, so a distance along it is measured from x = width.
    const centre = south.from[0] - (corridor.start + corridor.end) / 2;
    const { flight, upperFlight } = venue.data.stair;
    const foot = Math.min(flight.from[0], flight.to[0]);
    expect(foot - centre).toBeGreaterThanOrEqual(1.5);
    expect(foot - centre).toBeLessThanOrEqual(2);
    // The mezzanine floor stops at the second flight, and its wall opening is open to the full height.
    expect(venue.data.mezzanine.xTo).toBeLessThanOrEqual(Math.min(upperFlight.from[0], upperFlight.to[0]));
    const well = south.openings.find((o) => o.kind === "stairway");
    expect(well?.head).toBeGreaterThanOrEqual(south.height ?? venue.ceiling);
  });

  test("[VEN-01] the restroom corridor opens in the north wall half behind the back bar, reached by the passage behind it (R07, owner)", () => {
    const north = venue.data.walls.find((w) => w.id === "north");
    const corridor = north?.openings.find((o) => o.kind === "corridor");
    if (!corridor) throw new Error("no restroom corridor");
    const west = venue.data.fixtures.paintings.find((p) => p.wall === "north" && p.x1 < 6);
    const [bx0, bz0] = venue.data.backBar.rect.value;
    expect(corridor.start).toBeGreaterThan(west?.x1 ?? 0);
    expect(corridor.start).toBeLessThan(bx0);
    expect(corridor.end).toBeGreaterThan(bx0);
    expect(corridor.end - corridor.start).toBeGreaterThanOrEqual(0.9);
    // The back bar stands off the wall: a walkable passage behind it to the corridor.
    expect(bz0).toBeGreaterThanOrEqual(0.8);
    // No banquette across it.
    for (const b of venue.data.fixtures.banquettes)
      if (!b.wall && b.x0 !== undefined && b.x1 !== undefined)
        expect(b.x1 <= corridor.start || b.x0 >= corridor.end).toBe(true);
  });

  test("[VEN-03] the mezzanine overhangs ≈ 0.6 m over the entrance and stops before the stairwell (R09, R01)", () => {
    const { projection } = venue.data.mezzanine;
    const south = venue.data.walls.find((w) => w.id === "south");
    const entrance = south?.openings.find((o) => o.id === "corridor");
    if (!south || !entrance) throw new Error("no entrance");
    expect(projection.depth).toBeCloseTo(0.6, 5);
    expect(projection.xTo).toBeGreaterThan(south.from[0] - entrance.start);
    const { flight } = venue.data.stair;
    expect(projection.xTo).toBeLessThanOrEqual(Math.min(flight.from[0], flight.to[0]));
  });

  test("[VEN-01] [LAY-08] the entrance and the stair foot are kept clear", () => {
    const [lx0, lz0, , lz1] = venue.data.stair.landing;
    const south = venue.data.walls.find((w) => w.id === "south");
    const corridor = south?.openings.find((o) => o.id === "corridor");
    if (!south || !corridor) throw new Error("no corridor");
    expect(lx0).toBeLessThanOrEqual(south.from[0] - corridor.end);
    expect(lz1).toBe(venue.depth);
    expect(lz0).toBe(Math.max(venue.data.stair.flight.from[1], venue.data.stair.flight.to[1]));
    expect(checkPlacement(table({ x: 10.5, z: 12.0 }), [], venue, catalog).ok).toBe(false);
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
    expect(checkPlacement(table({ x: 8, z: 14.1 }), [], venue, catalog)).toEqual({
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
    const r = checkPlacement(table({ x: 10.6, z: 9.4 }), [], venue, catalog);
    expect(r).toEqual({ ok: false, reason: "Straddles the raised floor edge" });
  });

  test("[LAY-11] the DJ booth may sit at the mezzanine spot (option 3) but nowhere else off the floor", () => {
    const dj: Item = { id: "dj", libraryId: "dj-booth", x: 13.7, z: 13.6, rotY: 0, options: { spot: "dj3" } };
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
    // The east side's stools stand on the raised floor, along the bar.
    const z0 = venue.data.bar.outer.value[1];
    const side = table({ libraryId: "table-cocktail", x: x1 + 0.5, z: (z0 + z1) / 2, options: {} });
    expect(checkPlacement(side, [], venue, catalog).ok).toBe(true);
    expect(checkPlacement(side, [], venue, catalog, shown).ok).toBe(false);
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
  test("[LAY-03] [LIB-01] rectangle length follows seats (0.70 m a guest); 12 = 6 + 6, or 5 + 5 + 2 ends", () => {
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
  test("[LAY-09] the garage-door tables seat 12 (6 a side), across the room, clear of the doors and bar", () => {
    const west = venueSampleItems().filter((i) => ["t1", "t2", "t3"].includes(i.id));
    const [bx0] = venue.data.bar.outer.value;
    for (const t of west) {
      const s = shapeOf(t, catalog);
      expect(s.kind === "rectTable" && s.seats === 12 && s.chairs.length === 12).toBe(true);
      if (s.kind !== "rectTable") continue;
      expect(t.rotY).toBe(0);
      expect(t.x - s.length / 2).toBeGreaterThanOrEqual(1.2);
      expect(bx0 - (t.x + s.length / 2)).toBeGreaterThanOrEqual(1.0);
    }
  });

  test("[LAY-09] every item of the venue sample plan is validly placed", () => {
    const items = venueSampleItems();
    for (const it of items) {
      const r = checkPlacement(it, items, venue, catalog);
      expect(r, `${it.id}: ${JSON.stringify(r)}`).toMatchObject({ ok: true });
    }
  });

  test("[LAY-07] 75 guests with the venue sample: 8 tables, 72 seats, 3 without a seat", () => {
    const c = countLayout(venueSampleItems(), 75, catalog);
    expect(c).toMatchObject({ tables: 8, seats: 72, guests: 75, withoutSeat: 3 });
    expect(c.danceFloorM2).toBeCloseTo(12.09);
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
    expect(free([8, 12.85])).toBe(false);
  });

  test("[CAM-03] walking starts at the entrance; both stair flights and the turn landing block", () => {
    const free = walkArea(venue, [], catalog, off);
    const start = venue.data.cameraPresets.walkStart?.position ?? [0, 0, 0];
    expect(free([start[0] ?? 0, start[2] ?? 0])).toBe(true);
    expect(free([13.5, 11.3])).toBe(false);
    expect(free([15.4, 11.3])).toBe(false);
    expect(free([15.4, 12.5])).toBe(false);
    expect(free([13.5, 12.4])).toBe(true);
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

describe("bar flowers", () => {
  test("[VEN-06] a bar flower stands on the middle of the bar top, from the west side round the front to the east side, never over an end", () => {
    const d = venue.data;
    const [x0, z0, x1, z1] = d.bar.outer.value;
    const near = (p: Vec2, q: Vec2) => {
      expect(p[0]).toBeCloseTo(q[0], 6);
      expect(p[1]).toBeCloseTo(q[1], 6);
    };
    const start = barTopPlace(d, 0);
    expect(start.run).toBe("west");
    near(start.point, [x0 + d.bar.legWidth / 2, z0 + 0.15]);
    const end = barTopPlace(d, 1);
    expect(end.run).toBe("east");
    near(end.point, [x1 - d.bar.legWidth / 2, z0 + 0.15]);
    const mid = barTopPlace(d, 0.5);
    expect(mid.run).toBe("front");
    near(mid.point, [(x0 + x1) / 2, z1 - d.bar.frontDepth / 2]);
    for (const t of [0.1, 0.3, 0.7, 0.9]) {
      const [x, z] = barTopPlace(d, t).point;
      expect(x > x0 && x < x1 && z > z0 && z < z1).toBe(true);
    }
    expect(barTopPlace(d, -1)).toEqual(barTopPlace(d, 0));
    expect(barTopLength(d)).toBeGreaterThan(x1 - x0);
  });

  test("[VEN-06] a vase dragged in the room lands on the nearest point of the bar top, in order and kept apart", () => {
    const d = venue.data;
    for (const t of [0, 0.2, 0.5, 0.8, 1]) expect(barTopShare(d, barTopPlace(d, t).point)).toBeCloseTo(t, 6);
    // From beside the bar, a vase lands on the nearest run.
    const [x0, , , z1] = d.bar.outer.value;
    const front = barTopPlace(d, barTopShare(d, [x0 + 1, z1 + 2]));
    expect(front.run).toBe("front");
    expect(front.point[0]).toBeCloseTo(x0 + 1, 6);
    const gap = VASE_GAP_M / barTopLength(d);
    expect(moveVase(d, [0.3, 0.6], 0, 0.1)).toEqual([0.1, 0.6]);
    expect(moveVase(d, [0.3, 0.6], 0, 0.9)[0]).toBeCloseTo(0.6 - gap, 9);
    expect(moveVase(d, [0.3, 0.6], 1, 0)[1]).toBeCloseTo(0.3 + gap, 9);
    expect(moveVase(d, [0.3, 0.6], 1, 2)).toEqual([0.3, 1]);
  });
});
