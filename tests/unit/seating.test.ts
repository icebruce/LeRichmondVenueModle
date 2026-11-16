import { describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { createEditor } from "../../src/state/editor";
import { parseScenario, venueSampleScenario } from "../../src/domain/scenario/scenario";
import { layoutSeats, seatOrder, unseated } from "../../src/domain/layout/seating";
import { shapeOf } from "../../src/domain/layout/items";
import { differences } from "../../src/domain/scenario/diff";

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
    // With chairs at the ends, the east end comes between the sides and the west end last.
    expect(editor.setOption("t1", "ends", true)).toBe(true);
    const ends = shapeOf(editor.active().items.find((i) => i.id === "t1") ?? t1, catalog);
    if (ends.kind !== "rectTable") throw new Error("not a rectangle");
    const withEnds = seatOrder(ends).map((i) => ends.chairs[i]);
    expect(withEnds[5]?.z).toBe(0);
    expect(withEnds[5]?.x).toBeGreaterThan(0);
    expect(withEnds[11]?.x).toBeLessThan(0);
    const keys = layoutSeats(editor.active().items, catalog).filter((s) => s.item === "t1");
    expect(keys.map((s) => s.key)).toEqual(Array.from({ length: 12 }, (_, i) => `t1:${i + 1}`));
    expect(keys.every((s) => s.table === "1")).toBe(true);
  });

  test("[SEA-01] naming a seat: first and last name, trimmed; both empty clears it; one undo step", () => {
    const editor = setup();
    editor.setSeatName("t2:3", { first: "  Catherine ", last: "Tremblay " });
    expect(editor.active().seating["t2:3"]).toEqual({ first: "Catherine", last: "Tremblay" });
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
    editor.setSeatName("t1:12", { first: "Anne", last: "Côté" });
    editor.setSeatName("t1:1", { first: "Luc", last: "Roy" });
    editor.setOption("t1", "seats", 10);
    const lost = () => unseated(editor.active(), layoutSeats(editor.active().items, catalog));
    expect(lost()).toEqual([{ key: "t1:12", name: { first: "Anne", last: "Côté" } }]);
    editor.undo();
    expect(lost()).toEqual([]);
    editor.setOption("t1", "seats", 10);
    editor.removeSeatName("t1:12");
    expect(lost()).toEqual([]);
    expect(editor.store.getState().toast?.text).toBe("Anne Côté removed");
    editor.store.getState().toast?.undo?.();
    expect(lost()).toHaveLength(1);
  });

  test("[SEA-01] [SCN-08] a version 6 plan opens with an empty seating chart; the partner's names show in a conflict", () => {
    const s = venueSampleScenario("A", "2026-11-16T00:00:00.000Z");
    const v6: Record<string, unknown> = { ...s, schemaVersion: 6 };
    delete v6.seating;
    expect(parseScenario(v6).seating).toEqual({});
    const theirs = { ...s, seating: { "t1:1": { first: "Luc", last: "Roy" } } };
    expect(differences(s, theirs, catalog)).toContain("1 seat has a different name");
  });
});
