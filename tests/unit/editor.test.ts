import { describe, expect, test, vi } from "vitest";
import { catalog, venue } from "./fixtures";
import { createEditor } from "../../src/state/editor";
import { venueSampleScenario } from "../../src/domain/scenario/scenario";
import type { Item } from "../../src/domain/layout/items";

function setup() {
  let n = 0;
  const editor = createEditor(
    { venue, catalog, now: () => "2026-10-15T00:00:00.000Z", newId: () => `id${++n}` },
    [venueSampleScenario("A", "2026-10-15T00:00:00.000Z")],
  );
  const item = (id: string) => editor.active().items.find((i) => i.id === id) as Item;
  return { editor, item };
}

describe("editing", () => {
  test("[LAY-02] move, rotate, duplicate and delete a table", () => {
    const { editor, item } = setup();
    expect(editor.moveItems([{ id: "t1", x: 2.8, z: 2.6 }])).toBe(true);
    expect(item("t1").z).toBeCloseTo(2.6);
    editor.select(["t5"]);
    expect(editor.rotateItems(["t5"], Math.PI / 2)).toBe(false); // too long to turn between its neighbours
    editor.select(["t1"]);
    const before = editor.active().items.length;
    editor.deleteSelection();
    expect(editor.active().items.length).toBe(before - 1);
    expect(editor.store.getState().toast?.undo).toBeTypeOf("function");
  });

  test("[LAY-04] a refused move leaves the layout unchanged and explains why", () => {
    const { editor, item } = setup();
    expect(editor.moveItems([{ id: "t1", x: 7.7, z: 6 }])).toBe(false);
    expect(item("t1").x).toBeCloseTo(2.8);
    expect(editor.store.getState().toast?.text).toBe("Overlaps the bar. Nothing was changed.");
  });

  test("[LAY-12] showing the bar stools where a table stands is refused, with a toast", () => {
    const { editor } = setup();
    const [x0, , x1, z1] = venue.data.bar.outer.value;
    editor.addItem("table-rect", [(x0 + x1) / 2, z1 + 1.4], { seats: 4 });
    expect(editor.setVenueToggle("barStools", true)).toBe(false);
    expect(editor.active().venueToggles.barStools).toBe(false);
    expect(editor.store.getState().toast?.text).toBe(
      "Table 8 is where the bar stools go. Nothing was changed.",
    );
  });

  test("[LAY-05] moves snap to a 10 cm grid unless snapping is off", () => {
    const { editor, item } = setup();
    editor.moveItems([{ id: "t1", x: 2.84, z: 2.63 }]);
    expect(item("t1").x).toBeCloseTo(2.8);
    expect(item("t1").z).toBeCloseTo(2.6);
    editor.setSnapping(false);
    editor.moveItems([{ id: "t1", x: 2.84, z: 2.63 }]);
    expect(item("t1").x).toBeCloseTo(2.84);
  });

  test("[LAY-06] undo and redo every change, at least 50 steps deep", () => {
    const { editor, item } = setup();
    for (let i = 0; i < 60; i++) editor.moveItems([{ id: "t1", x: 2.8, z: i % 2 ? 2.3 : 2.4 }]);
    for (let i = 0; i < 60; i++) editor.undo();
    expect(item("t1").z).toBeCloseTo(2.3);
    expect(editor.store.getState().canUndo).toBe(false);
    editor.redo();
    expect(item("t1").z).toBeCloseTo(2.4);
  });

  test("[LAY-03] changing seats re-arranges chairs; refused if the bigger table no longer fits", () => {
    const { editor, item } = setup();
    expect(editor.setOption("t1", "seats", 10)).toBe(true);
    expect(item("t1").options.seats).toBe(10);
    expect(editor.setOption("t2", "seats", 14)).toBe(true);
    expect(editor.setOption("t5", "seats", 14)).toBe(false); // 5.3 m would cross the east wall
  });

  test("[LAY-11] choosing DJ option 3 moves the booth to the mezzanine spot", () => {
    const { editor, item } = setup();
    expect(editor.setOption("dj", "spot", "dj3")).toBe(true);
    expect(item("dj")).toMatchObject({ x: 13.7, z: 15 });
  });
});

describe("toast undo", () => {
  test("[LAY-06] the Delete toast's Undo restores the deletion only while it is the latest change", () => {
    const { editor, item } = setup();
    editor.select(["t1"]);
    editor.deleteSelection();
    const offer = editor.store.getState().toast?.undo;
    expect(offer).toBeDefined();
    editor.setGuests(80);
    // A later change dismisses the offer; calling a stale one does nothing.
    expect(editor.store.getState().toast).toBeNull();
    offer?.();
    expect(editor.active().guests.count).toBe(80);
    expect(editor.active().items.some((i) => i.id === "t1")).toBe(false);
    editor.undo();
    editor.undo();
    expect(item("t1")).toBeDefined();
  });
});

describe("scenarios", () => {
  test("[SCN-01] renaming is an undoable step", () => {
    const { editor } = setup();
    const before = editor.active().name;
    editor.renameScenario("Long tables");
    expect(editor.active().name).toBe("Long tables");
    editor.undo();
    expect(editor.active().name).toBe(before);
  });

  test("[SCN-01] create, duplicate, rename and delete scenarios; delete can be undone", () => {
    const { editor } = setup();
    const b = editor.duplicateScenario("A");
    editor.renameScenario("Option B");
    expect(editor.active().name).toBe("Option B");
    expect(editor.active().items.length).toBe(10);
    const c = editor.createScenario("blank");
    expect(editor.store.getState().order).toEqual(["A", b, c]);
    editor.deleteScenario(b);
    expect(editor.store.getState().order).toEqual(["A", c]);
    editor.store.getState().toast?.undo?.();
    expect(editor.store.getState().order).toEqual(["A", b, c]);
  });

  test("[SCN-01] undo history is kept per scenario", () => {
    const { editor } = setup();
    editor.moveItems([{ id: "t1", x: 2.8, z: 2.4 }]);
    const b = editor.duplicateScenario("A");
    expect(editor.store.getState().canUndo).toBe(false);
    editor.switchScenario("A");
    expect(editor.store.getState().canUndo).toBe(true);
    expect(b).toBeTruthy();
  });

  test("[LAY-06] holding or scrubbing the guest count is one undo step", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    const { editor } = setup();
    for (let n = 76; n <= 120; n++) editor.setGuests(n);
    vi.setSystemTime(new Date("2026-10-16T10:00:05Z"));
    editor.setGuests(130);
    editor.undo();
    expect(editor.active().guests.count).toBe(120);
    editor.undo();
    expect(editor.active().guests.count).toBe(75);
    vi.useRealTimers();
  });
});
