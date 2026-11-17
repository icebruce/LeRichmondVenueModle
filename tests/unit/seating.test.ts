import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { createEditor } from "../../src/state/editor";
import { parseScenario, venueSampleScenario } from "../../src/domain/scenario/scenario";
import { layoutSeats, seatOrder, unseated } from "../../src/domain/layout/seating";
import { shapeOf } from "../../src/domain/layout/items";
import { differences } from "../../src/domain/scenario/diff";
import { pointInPolygon } from "../../src/domain/geometry";
import {
  NAME_MAX,
  NAME_MIN,
  PAGE,
  chartTables,
  fitRoom,
  longerTables,
  onPage,
  placeNames,
  seatingStretch,
} from "../../src/domain/layout/chart";

function setup() {
  let n = 0;
  return createEditor({ venue, catalog, now: () => "2026-11-16T00:00:00.000Z", newId: () => `id${++n}` }, [
    venueSampleScenario("A", "2026-11-16T00:00:00.000Z"),
  ]);
}

describe("seating chart", () => {
  test("[SEA-01] seats are numbered clockwise round each table, from the left of its first long side", () => {
    const editor = setup();
    const t1 = editor.active().items.find((i) => i.id === "t1");
    if (!t1) throw new Error("no t1");
    // 12 seats, 6 a side: 1–6 along the north side west to east, 7–12 back along the south side.
    const shape = shapeOf(t1, catalog);
    if (shape.kind !== "rectTable") throw new Error("not a rectangle");
    const order = seatOrder(shape).map((i) => shape.chairs[i]);
    expect(order.slice(0, 6).every((c) => (c?.z ?? 0) < 0)).toBe(true);
    expect(order.slice(6).every((c) => (c?.z ?? 0) > 0)).toBe(true);
    expect(order.slice(0, 6).map((c) => c?.x)).toEqual(
      [...order.slice(0, 6).map((c) => c?.x)].sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    expect(order.slice(6).map((c) => c?.x)).toEqual(
      [...order.slice(6).map((c) => c?.x)].sort((a, b) => (b ?? 0) - (a ?? 0)),
    );
    // With a chair at each end, the right end comes between the sides and the left end last.
    expect(editor.setOption("t2", "endRight", true)).toBe(true);
    expect(editor.setOption("t2", "endLeft", true)).toBe(true);
    const ends = shapeOf(editor.active().items.find((i) => i.id === "t2") ?? t1, catalog);
    if (ends.kind !== "rectTable") throw new Error("not a rectangle");
    const withEnds = seatOrder(ends).map((i) => ends.chairs[i]);
    expect(withEnds[6]?.z).toBe(0);
    expect(withEnds[6]?.x).toBeGreaterThan(0);
    expect(withEnds[13]?.x).toBeLessThan(0);
    const keys = layoutSeats(editor.active().items, catalog).filter((s) => s.item === "t2");
    expect(keys.map((s) => s.key)).toEqual(Array.from({ length: 14 }, (_, i) => `t2:${i + 1}`));
    expect(keys.every((s) => s.table === "2")).toBe(true);
  });

  test("[LAY-03] [SEA-03] switching an end chair leaves every guest on their chair, in one undo step", () => {
    const editor = setup();
    const at = () => {
      const seats = layoutSeats(editor.active().items, catalog);
      return Object.fromEntries(
        Object.entries(editor.active().seating).map(([k, g]) => {
          const s = seats.find((x) => x.key === k);
          return [`${g.first}`, s ? [s.x.toFixed(3), s.z.toFixed(3)] : "without a seat"];
        }),
      );
    };
    // Every chair of table 2 named, and a guest at table 3.
    for (let n = 1; n <= 12; n++) editor.setSeatName(`t2:${n}`, { first: `G${n}`, last: "" });
    editor.setSeatName("t3:7", { first: "Other", last: "" });
    const before = at();
    // The right end comes after seat 6: the other side's guests are numbered one on, same chairs.
    editor.setOption("t2", "endRight", true);
    expect(at()).toEqual(before);
    expect(editor.active().seating["t2:7"]).toBeUndefined();
    expect(editor.active().seating["t2:8"]).toEqual({ first: "G7", last: "" });
    expect(editor.active().seating["t3:7"]).toEqual({ first: "Other", last: "" });
    editor.setSeatName("t2:7", { first: "End", last: "" });
    const withEnd = at();
    // The left end comes last: nobody moves.
    editor.setOption("t2", "endLeft", true);
    expect(at()).toEqual(withEnd);
    // Switching the right end off again: its guest is listed without a seat, the rest stay put.
    editor.setOption("t2", "endRight", false);
    const now = at();
    expect(now.End).toBe("without a seat");
    expect({ ...now, End: withEnd.End }).toEqual(withEnd);
    expect(
      unseated(editor.active(), layoutSeats(editor.active().items, catalog)).map((u) => u.name.first),
    ).toEqual(["End"]);
    // One undo brings it back on its chair.
    editor.undo();
    expect(at()).toEqual(withEnd);
  });

  test("[LAY-03] older plans: 'Chairs at the ends' becomes both end chairs on the same table, names on the same chairs", () => {
    const sample = venueSampleScenario("A", "2026-11-16T00:00:00.000Z");
    const items = sample.items.map((i) =>
      i.id === "t1"
        ? { ...i, options: { seats: 12, ends: true } }
        : i.id === "t5"
          ? { ...i, options: { ends: true } }
          : i.id === "t2"
            ? { ...i, options: { seats: 12, ends: false } }
            : i,
    );
    const seating = { "t1:7": { first: "Luc", last: "Roy" }, "t1:12": { first: "Anne", last: "Côté" } };
    const v7 = { ...sample, schemaVersion: 7, items, seating };
    // The v7 tables, built the way v7 built them: 10 a side + 2 ends, 3.5 m long, 1.0 m wide.
    const old = { t1: { length: 3.5, width: 1.0, chairs: 12 }, t5: { length: 2.1, width: 0.9, chairs: 8 } };
    const s = parseScenario(v7);
    const opts = (id: string) => s.items.find((i) => i.id === id)?.options;
    expect(opts("t1")).toEqual({ seats: 10, endLeft: true, endRight: true });
    expect(opts("t5")).toEqual({ seats: 6, endLeft: true, endRight: true });
    expect(opts("t2")).toEqual({ seats: 12 });
    for (const [id, o] of Object.entries(old)) {
      const it = s.items.find((i) => i.id === id);
      if (!it) throw new Error(`no ${id}`);
      const shape = shapeOf(it, catalog);
      expect(shape.kind === "rectTable" && [shape.length, shape.width, shape.chairs.length]).toEqual([
        o.length,
        o.width,
        o.chairs,
      ]);
    }
    expect(s.seating).toEqual(seating);
    // Seat 7 is still the first chair on the second side, seat 12 the left end.
    const seats = layoutSeats(s.items, catalog);
    const seat = (k: string) => seats.find((x) => x.key === k);
    expect(seat("t1:12")?.x).toBeLessThan(seat("t1:1")?.x ?? 0);
    expect(seat("t1:7")?.z).toBeGreaterThan(s.items[0]?.z ?? 0);
  });

  test("[SEA-01] naming a seat: first and last name, trimmed; both empty clears it; one undo step", () => {
    const editor = setup();
    editor.setSeatName("t2:3", { first: "  Catherine ", last: "Tremblay " });
    expect(editor.active().seating["t2:3"]).toEqual({ first: "Catherine", last: "Tremblay" });
    // The same name saved again (Enter, then leaving the field) is no second undo step.
    editor.setSeatName("t2:3", { first: "Catherine", last: "Tremblay" });
    editor.undo();
    expect(editor.active().seating["t2:3"]).toBeUndefined();
    editor.redo();
    editor.setSeatName("t2:3", { first: "", last: " " });
    expect(editor.active().seating["t2:3"]).toBeUndefined();
    editor.undo();
    expect(editor.active().seating["t2:3"]).toEqual({ first: "Catherine", last: "Tremblay" });
  });

  test("[SEA-02] moving a guest: to an empty seat, or swapping with whoever sits there, in one undo step", () => {
    const editor = setup();
    editor.setSeatName("t1:1", { first: "Luc", last: "Roy" });
    editor.setSeatName("t5:2", { first: "Julie", last: "Simard" });
    editor.moveSeatName("t1:1", "t3:4");
    expect(editor.active().seating).toEqual({
      "t3:4": { first: "Luc", last: "Roy" },
      "t5:2": { first: "Julie", last: "Simard" },
    });
    editor.moveSeatName("t3:4", "t5:2");
    expect(editor.active().seating).toEqual({
      "t5:2": { first: "Luc", last: "Roy" },
      "t3:4": { first: "Julie", last: "Simard" },
    });
    editor.undo();
    expect(editor.active().seating["t3:4"]).toEqual({ first: "Luc", last: "Roy" });
  });

  test("[SEA-03] guests whose seat is gone are listed without a seat; undo seats them again; removing offers Undo", () => {
    const editor = setup();
    editor.setSeatName("t1:11", { first: "Paul", last: "Roy" });
    editor.setSeatName("t1:12", { first: "Anne", last: "Côté" });
    editor.setSeatName("t1:1", { first: "Luc", last: "Roy" });
    editor.setOption("t1", "seats", 10);
    const lost = () => unseated(editor.active(), layoutSeats(editor.active().items, catalog));
    expect(lost()).toEqual([
      { key: "t1:11", name: { first: "Paul", last: "Roy" } },
      { key: "t1:12", name: { first: "Anne", last: "Côté" } },
    ]);
    editor.undo();
    expect(lost()).toEqual([]);
    editor.setOption("t1", "seats", 10);
    editor.removeSeatName("t1:12");
    expect(lost()).toHaveLength(1);
    expect(editor.store.getState().toast?.text).toBe("Anne Côté removed");
    editor.store.getState().toast?.undo?.();
    expect(lost()).toHaveLength(2);
  });

  test("[SEA-01] [SCN-08] a version 6 plan opens with an empty seating chart; the partner's names show in a conflict", () => {
    const s = venueSampleScenario("A", "2026-11-16T00:00:00.000Z");
    const v6: Record<string, unknown> = { ...s, schemaVersion: 6 };
    delete v6.seating;
    expect(parseScenario(v6).seating).toEqual({});
    const theirs = { ...s, seating: { "t1:1": { first: "Luc", last: "Roy" } } };
    expect(differences(s, theirs, catalog)).toContain("1 seat has a different name");
  });

  test("[SEA-04] [LAY-03] an end chair's guest keeps the chart's name size; that end is not drawn longer, twins still match", () => {
    const editor = setup();
    for (const key of ["t1:1", "t2:8", "t3:4", "t4:2", "t5:1", "t6:3", "t7:5"])
      editor.setSeatName(key, { first: "Marie-Ève", last: "Paquette-Tremblay" });
    const measure = (s: string, px: number, bold: boolean) => s.length * px * (bold ? 0.6 : 0.55);
    const frame = {
      x: PAGE.margin,
      y: PAGE.top,
      w: PAGE.width - 2 * PAGE.margin,
      h: PAGE.height - PAGE.top - PAGE.bottom,
    };
    const fit = fitRoom(venue, frame, seatingStretch(venue));
    const chart = () => {
      const ends = longerTables(editor.active(), venue, catalog);
      const sizes = new Map(
        placeNames(editor.active(), venue, catalog, fit, ends, measure).blocks.map((b) => [b.seat.key, b.px]),
      );
      return { ends, sizes };
    };
    const plain = chart();
    // Table 2's right end faces the bar: a long name there keeps its full size, and so does every other.
    expect(editor.setOption("t2", "endRight", true)).toBe(true);
    editor.setSeatName("t2:7", { first: "Marie-Ève", last: "Paquette-Tremblay" });
    const end = chart();
    expect(end.sizes.get("t2:7")).toBe(NAME_MAX * fit.k);
    for (const key of ["t1:1", "t3:4", "t4:2", "t5:1", "t6:3", "t7:5"])
      expect(end.sizes.get(key)).toBe(plain.sizes.get(key));
    // Table 2's own guests keep theirs too (its second side is numbered one on).
    expect(end.sizes.get("t2:9")).toBe(plain.sizes.get("t2:8"));
    expect(end.ends.get("t2")?.pos).toBe(0);
    // Tables 1–3 (12 along the sides) are still drawn the same length.
    const grown = (id: string) => {
      const e = end.ends.get(id);
      return (e?.neg ?? 0) + (e?.pos ?? 0);
    };
    expect(grown("t2")).toBeGreaterThan(0);
    expect(grown("t1")).toBeCloseTo(grown("t2"));
    expect(grown("t3")).toBeCloseTo(grown("t2"));
  });

  test("[SEA-04] a name that does not fit gets smaller on its own: the rest of the chart keeps its size", () => {
    const editor = setup();
    const measure = (s: string, px: number, bold: boolean) => s.length * px * (bold ? 0.6 : 0.55);
    const frame = {
      x: PAGE.margin,
      y: PAGE.top,
      w: PAGE.width - 2 * PAGE.margin,
      h: PAGE.height - PAGE.top - PAGE.bottom,
    };
    const fit = fitRoom(venue, frame, seatingStretch(venue));
    for (const seat of layoutSeats(editor.active().items, catalog))
      editor.setSeatName(seat.key, { first: "Luc", last: "Roy" });
    // One very long name, with no hyphen to break at, between two guests on table 2's side.
    editor.setSeatName("t2:9", { first: "Wolfeschlegelsteinhausen", last: "Bergerdorffstein" });
    const ends = longerTables(editor.active(), venue, catalog);
    const { blocks } = placeNames(editor.active(), venue, catalog, fit, ends, measure);
    const px = (key: string) => blocks.find((b) => b.seat.key === key)?.px ?? 0;
    const full = NAME_MAX * fit.k;
    expect(px("t2:9")).toBeLessThan(full);
    expect(px("t2:9")).toBeGreaterThanOrEqual(NAME_MIN * fit.k);
    // Only names it touches may give way; the other tables keep the full size.
    for (const b of blocks.filter((x) => x.lines.length && ["t4", "t5", "t6", "t7"].includes(x.seat.item)))
      expect(b.px, b.seat.key).toBe(full);
    expect(blocks.filter((b) => b.lines.length && b.px < full).length).toBeLessThanOrEqual(3);
  });

  test("[SEA-04] the chart: every name clear of the others and of the room, each at its own size, tables longer by at most 1.3×", () => {
    const editor = setup();
    const firsts = [
      "Catherine",
      "Jean-Philippe",
      "Marie-Ève",
      "Luc",
      "Alexandre",
      "Geneviève",
      "Anne-Sophie",
    ];
    const lasts = ["Tremblay", "Gagnon-Bouchard", "Roy", "Desjardins-Pelletier", "Bélanger", "Côté"];
    layoutSeats(editor.active().items, catalog).forEach((seat, i) =>
      editor.setSeatName(seat.key, {
        first: firsts[i % firsts.length] ?? "",
        last: lasts[i % lasts.length] ?? "",
      }),
    );
    const plan = editor.active();
    // About the widths of the app's sans at a size: semibold a little wider.
    const measure = (s: string, px: number, bold: boolean) => s.length * px * (bold ? 0.6 : 0.55);
    const frame = {
      x: PAGE.margin,
      y: PAGE.top,
      w: PAGE.width - 2 * PAGE.margin,
      h: PAGE.height - PAGE.top - PAGE.bottom,
    };
    const fit = fitRoom(venue, frame, seatingStretch(venue));
    const ends = longerTables(plan, venue, catalog);
    const { blocks } = placeNames(plan, venue, catalog, fit, ends, measure);

    for (const b of blocks) {
      expect(b.px).toBeGreaterThanOrEqual(NAME_MIN * fit.k);
      expect(b.px).toBeLessThanOrEqual(NAME_MAX * fit.k);
    }
    expect(blocks.filter((b) => b.lines.length)).toHaveLength(Object.keys(plan.seating).length);
    for (const [i, a] of blocks.entries())
      for (const b of blocks.slice(i + 1))
        expect(
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
          `${a.seat.key} / ${b.seat.key}`,
        ).toBe(false);
    const solid = venue.obstacles
      .filter((o) => !o.id.startsWith("banquette"))
      .map((o) => o.polygon.map((p) => onPage(fit, p)));
    const tops = [...chartTables(plan, catalog, ends)];
    for (const b of blocks) {
      const mid: [number, number] = [b.x + b.w / 2, b.y + b.h / 2];
      expect(solid.some((pg) => pointInPolygon(mid, pg))).toBe(false);
      expect(
        tops.some(
          ([id, t]) =>
            id !== b.seat.item &&
            pointInPolygon(
              mid,
              t.top.map((p) => onPage(fit, p)),
            ),
        ),
      ).toBe(false);
      // A third line only where a hyphenated name broke.
      if (b.lines.length > 2) expect(b.lines.some((l) => l.s.endsWith("-"))).toBe(true);
    }
    // Tables grow by at most 0.3 of their length, tables alike by the same amount.
    const grown = (id: string) => (ends.get(id)?.neg ?? 0) + (ends.get(id)?.pos ?? 0);
    for (const id of ["t1", "t2", "t3"]) expect(grown(id)).toBeLessThanOrEqual(0.3 * 4.2 + 1e-9);
    expect(grown("t1")).toBeCloseTo(grown("t2"));
    expect(grown("t2")).toBeCloseTo(grown("t3"));
    expect(grown("t5")).toBeCloseTo(grown("t6"));
  });
});
