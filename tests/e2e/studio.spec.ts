import { expect, test } from "@playwright/test";
import { type W, dragItem, item, openStudio, screenOf, setCamera, state } from "./helpers";

test.describe.configure({ mode: "serial" });

test("[ACC-02] the app asks search engines not to index it", async ({ page }) => {
  await page.goto("/?fresh");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("[VEN-01] [LAY-07] [LAY-09] opens on the venue sample in the dollhouse view with counts", async ({
  page,
}) => {
  await openStudio(page);
  const s = await state(page);
  expect(s.camera).toBe("dollhouse");
  expect(s.active?.name).toBe("Option A · Venue sample");
  await expect(page.getByTestId("count-tables")).toHaveText("8");
  await expect(page.getByTestId("count-seats")).toHaveText("60");
  await expect(page.getByTestId("count-without")).toHaveText("15");
});

test("[LAY-02] [LAY-04] [LAY-06] drag a table, get refused on the bar, undo", async ({ page }) => {
  await openStudio(page);
  await setCamera(page, "plan");
  const before = await item(page, "t1");
  await dragItem(page, "t1", [2.8, 2.9]);
  const moved = await item(page, "t1");
  expect(moved.z).toBeCloseTo(2.9, 1);
  await expect(page.getByTestId("inspector")).toContainText("Table 1");

  await dragItem(page, "t1", [7.7, 6.0]);
  expect((await item(page, "t1")).x).toBeCloseTo(moved.x, 1);
  await expect(page.getByRole("alert")).toContainText("Overlaps the bar");

  await page.getByTestId("undo").click();
  expect((await item(page, "t1")).z).toBeCloseTo(before.z, 1);
});

test("[LAY-02] [LAY-03] turn, change seats, duplicate and delete from the inspector", async ({ page }) => {
  await openStudio(page);
  await setCamera(page, "plan");
  const t = await item(page, "t2");
  const [x, y] = await screenOf(page, t.x, 0.77, t.z);
  await page.mouse.click(x, y);
  await expect(page.getByTestId("inspector")).toContainText("Table 2");
  await page.getByTestId("seats").getByRole("button", { name: /More/ }).click();
  expect((await item(page, "t2")).options.seats).toBe(9);
  const count = (await state(page)).active?.items.length ?? 0;
  await page.getByTestId("delete").click();
  expect((await state(page)).active?.items.length).toBe(count - 1);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  expect((await state(page)).active?.items.length).toBe(count);
});

test("[LIB-01] [LIB-02] add a round table and a dance floor from the library", async ({ page }) => {
  await openStudio(page, "fresh");
  await page.getByRole("button", { name: /Option A/ }).click();
  await page.getByRole("menuitem", { name: "New empty room" }).click();
  await page.getByTestId("add-table-round").click();
  await expect(page.getByTestId("inspector")).toContainText("Table 1");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("add-dance-floor").click();
  const s = await state(page);
  expect(s.active?.items.map((i) => i.libraryId).sort()).toEqual(["dance-floor", "table-round"]);
  await expect(page.getByTestId("count-seats")).toHaveText("8");
});

test("[LIB-03] [DEC-01] [DEC-04] [DEC-05] décor for all tables or just the selected one", async ({
  page,
}) => {
  await openStudio(page);
  const style = () =>
    page.evaluate(() => {
      const st = (window as unknown as W).__studio.editor.store.getState();
      const sc = st.scenarios[st.activeId] as unknown as {
        style: Record<string, string>;
        items: { id: string; style?: Record<string, string> }[];
      };
      return { style: sc.style, t2: sc.items.find((i) => i.id === "t2")?.style };
    });
  await page.getByTestId("section-decor").click();
  await page.getByTestId("linen-linen-white").click();
  await page.getByTestId("linen-length-lap").click();
  await page.getByTestId("candles-candle-tapers").click();
  await page.getByTestId("chair-chair-chiavari-gold").click();
  expect((await style()).style).toMatchObject({
    linen: "linen-white",
    linenLength: "lap",
    candles: "candle-tapers",
    chair: "chair-chiavari-gold",
  });
  // One table: select it, dress it navy, then make its style everyone's.
  await page.evaluate(() => (window as unknown as W).__studio.editor.select(["t2"]));
  await expect(page.getByRole("radio", { name: "This table" })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("linen-linen-navy").click();
  expect((await style()).t2).toEqual({ linen: "linen-navy" });
  expect((await style()).style.linen).toBe("linen-white");
  await page.getByTestId("style-to-all").click();
  expect((await style()).style.linen).toBe("linen-navy");
  expect((await style()).t2).toBeUndefined();
});

test("[LAY-05] dragging a table near another's centre line snaps into line with it", async ({ page }) => {
  await openStudio(page);
  await page.getByRole("button", { name: /Option A/ }).click();
  await page.getByRole("menuitem", { name: "New empty room" }).click();
  await page.getByTestId("add-table-round").click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("add-table-round").click();
  await page.getByRole("button", { name: "Done" }).click();
  const ids = await page.evaluate(() => {
    const ed = (window as unknown as W).__studio.editor as unknown as {
      active: () => { items: { id: string }[] };
      moveItems: (m: { id: string; x: number; z: number }[]) => void;
    };
    const [a, b] = ed.active().items;
    ed.moveItems([
      { id: a?.id ?? "", x: 3, z: 9 },
      { id: b?.id ?? "", x: 6, z: 12.5 },
    ]);
    return [a?.id ?? "", b?.id ?? ""];
  });
  await setCamera(page, "plan");
  await dragItem(page, ids[1] as string, [3.12, 12.5]);
  const b = await item(page, ids[1] as string);
  expect(b.x).toBeCloseTo(3, 5);
});

test("[CAM-05] [VEN-01] reference views land exactly on their pose; Reset view returns", async ({ page }) => {
  await openStudio(page);
  const pose = () => page.evaluate(() => (window as unknown as { __pose: () => number[] }).__pose());
  const start = await pose();
  await page.getByTestId("section-venue").click();
  await page.getByRole("button", { name: /At the bar/ }).click();
  await page.waitForFunction(() => (window as unknown as { __rig: { tweening: boolean } }).__rig.tweening);
  await page.waitForFunction(() => !(window as unknown as { __rig: { tweening: boolean } }).__rig.tweening);
  await page.waitForTimeout(400);
  const preset = await page.evaluate(
    () =>
      (
        window as unknown as {
          __studio: { venue: { data: { cameraPresets: Record<string, { position: number[] }> } } };
        }
      ).__studio.venue.data.cameraPresets.R03?.position,
  );
  const at = await pose();
  for (let i = 0; i < 3; i++) expect(at[i]).toBeCloseTo(preset?.[i] ?? NaN, 1);
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.waitForFunction(() => (window as unknown as { __rig: { tweening: boolean } }).__rig.tweening);
  await page.waitForFunction(() => !(window as unknown as { __rig: { tweening: boolean } }).__rig.tweening);
  await page.waitForTimeout(400);
  const back = await pose();
  for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(start[i] ?? NaN, 0);
});

test("[PLT-03] [PPL-03] 15 tables and 150 people stay inside the draw-call and triangle budgets", async ({
  page,
}) => {
  for (const [quality, calls, triangles] of [
    ["high", 250, 1_500_000],
    ["low", 150, 600_000],
  ] as const) {
    await page.goto(`/?quality=${quality}&fresh`);
    await page.waitForFunction(() => (window as unknown as { __renderInfo?: unknown }).__renderInfo, null, {
      timeout: 60_000,
    });
    await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
    const tables = await page.evaluate(() => {
      const ed = (window as unknown as W).__studio.editor as unknown as {
        createScenario: (kind: "blank" | "sample") => string;
        addItem: (id: string, at: [number, number], o?: Record<string, number>) => string | null;
        setGuests: (n: number) => void;
        active: () => { items: { libraryId: string }[] };
      };
      // 15 round tables of 8 in an empty room and 150 guests: 120 seated, 30 standing.
      ed.createScenario("blank");
      for (let i = 0; i < 15; i++) ed.addItem("table-round", [8, 10], { seats: 8 });
      ed.setGuests(150);
      return ed.active().items.length;
    });
    expect(tables).toBe(15);
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() =>
      (window as unknown as { __renderInfo: () => { calls: number; triangles: number } }).__renderInfo(),
    );
    console.log(`${quality}: ${info.calls} draw calls, ${info.triangles} triangles`);
    expect(info.calls).toBeGreaterThan(0);
    expect(info.calls).toBeLessThan(calls);
    expect(info.triangles).toBeLessThan(triangles);
  }
});

test("[PPL-01] [PPL-02] [SCN-07] guests sit first, the rest stand; party fills the dance floor", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-people").click();
  await expect(page.getByTestId("people-seated")).toHaveText("60");
  await expect(page.getByTestId("people-standing")).toHaveText("15");
  await expect(page.getByRole("note")).toContainText("15 guests without a seat");
  await page.getByRole("radio", { name: "Party" }).click();
  expect(
    await page.evaluate(() => {
      const st = (window as unknown as W).__studio.editor.store.getState();
      return (st.scenarios[st.activeId] as unknown as { phase?: string }).phase;
    }),
  ).toBe("party");
  await page.getByTestId("shuffle").click();
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  expect(
    await page.evaluate(() => {
      const st = (window as unknown as W).__studio.editor.store.getState();
      return (st.scenarios[st.activeId] as unknown as { phase?: string }).phase ?? "dinner";
    }),
  ).toBe("dinner");
});

test("[LAY-08] advisory checks follow the couple's settings and never block", async ({ page }) => {
  await openStudio(page);
  await expect(page.getByTestId("count-advisories")).toHaveText("6");
  await expect(page.getByTestId("checks")).toContainText("Aisle ≈ 0.4 m between table 5 and table 6");
  await page.getByTestId("check-settings").click();
  for (let i = 0; i < 4; i++) await page.getByTestId("aisle").getByRole("button", { name: /Fewer/ }).click();
  // At 0.6 m the 0.7–0.8 m aisles pass; the 0.4 m one and the exit door remain.
  await expect(page.getByTestId("count-advisories")).not.toHaveText("6");
  await expect(page.getByTestId("checks")).not.toContainText("Aisle ≈ 0.8 m");
  await page.getByText("Aisle ≈ 0.4 m between table 5 and table 6").click();
  expect((await state(page)).selection.sort()).toEqual(["t5", "t6"]);
});

test("[EXP-01] [EXP-02] export the plan as PDF and PNG, and save the current view", async ({ page }) => {
  await openStudio(page);
  const download = async (id: string) => {
    await page.getByTestId("scenario-menu").click();
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(id).click()]);
    const path = await d.path();
    const { statSync, readFileSync } = await import("node:fs");
    return {
      name: d.suggestedFilename(),
      size: statSync(path).size,
      head: readFileSync(path).subarray(0, 8),
    };
  };
  const pdf = await download("export-pdf");
  expect(pdf.name).toMatch(/Venue sample plan\.pdf$/);
  expect(pdf.head.toString("latin1")).toBe("%PDF-1.4");
  expect(pdf.size).toBeGreaterThan(50_000);
  const png = await download("export-png");
  expect(png.name.endsWith(".png")).toBe(true);
  expect(png.head.subarray(1, 4).toString()).toBe("PNG");
  const view = await download("save-view");
  expect(view.name).toMatch(/Venue sample view\.png$/);
  expect(view.size).toBeGreaterThan(20_000);
});

test("[VEN-02] clicking the bar or a wall selects nothing", async ({ page }) => {
  await openStudio(page);
  const [bx, by] = await screenOf(page, 7.7, 1.07, 6.85);
  await page.mouse.click(bx, by);
  expect((await state(page)).selection).toEqual([]);
  const [wx, wy] = await screenOf(page, 3, 4, 0);
  await page.mouse.click(wx, wy);
  expect((await state(page)).selection).toEqual([]);
});

test("[CAM-01] [CAM-02] [CAM-03] switch between dollhouse, plan and walk", async ({ page }) => {
  await openStudio(page);
  for (const mode of ["plan", "walk", "dollhouse"] as const) {
    await setCamera(page, mode);
    expect((await state(page)).camera).toBe(mode);
  }
  await setCamera(page, "walk");
  const eye = await page.evaluate(() => {
    const p = (window as unknown as { __project: (x: number, y: number, z: number) => [number, number] })
      .__project;
    return p(8, 1.65, 6);
  });
  expect(eye[1]).toBeGreaterThan(0);
  await page.keyboard.down("w");
  await page.waitForTimeout(600);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  expect((await state(page)).camera).toBe("dollhouse");
});

test("[LGT-02] switch to daylight and back", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("light-day").click();
  expect((await state(page)).active).toBeTruthy();
  await expect(page.getByTestId("light-day")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("light-evening").click();
  await expect(page.getByTestId("light-evening")).toHaveAttribute("aria-checked", "true");
});

test("[SCN-01] [SCN-09] scenarios survive a reload; a ?fresh session never overwrites them", async ({
  page,
}) => {
  await openStudio(page, "saved");
  await page.getByRole("button", { name: /Option A/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: /copy/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.locator("#scenario-name").fill("Option B");
  await page.keyboard.press("Enter");
  await page.getByTestId("section-people").click();
  await page.getByTestId("guests").getByRole("button", { name: /More/ }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved on this device");
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
  const s = await state(page);
  expect(s.order.length).toBe(2);
  expect(s.active?.name).toBe("Option B");
  expect(s.active?.guests.count).toBe(76);

  // A throwaway ?fresh session edits its own copy; the saved scenarios are untouched afterwards.
  await openStudio(page, "fresh");
  await page.getByTestId("section-people").click();
  await page.getByTestId("guests").getByRole("button", { name: /Fewer/ }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved on this device");
  await page.goto("/?quality=low");
  await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
  const after = await state(page);
  expect(after.order.length).toBe(2);
  expect(after.active?.guests.count).toBe(76);
});
