import { expect, test } from "@playwright/test";
import {
  type W,
  dragItem,
  importPhoto,
  item,
  openStudio,
  photoFile,
  screenOf,
  setCamera,
  state,
} from "./helpers";

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
  await expect(page.getByTestId("count-seats")).toHaveText("72");
  await expect(page.getByTestId("count-without")).toHaveText("3");
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
  await expect(page.getByTestId("toast")).toContainText("Overlaps the bar. Nothing was changed.");

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
  expect((await item(page, "t2")).options.seats).toBe(Number(t.options.seats) + 1);
  const count = (await state(page)).active?.items.length ?? 0;
  await page.getByTestId("delete").click();
  expect((await state(page)).active?.items.length).toBe(count - 1);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  expect((await state(page)).active?.items.length).toBe(count);
});

test("[LIB-01] [LIB-02] add a round table and a dance area from the library", async ({ page }) => {
  await openStudio(page, "fresh");
  await page.getByRole("button", { name: /Option A/ }).click();
  await page.getByRole("menuitem", { name: "New empty room" }).click();
  await page.getByTestId("add-table-round").click();
  await expect(page.getByTestId("inspector")).toContainText("Table 1");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("category-eventPiece").click();
  await page.getByTestId("add-dance-floor").click();
  const s = await state(page);
  expect(s.active?.items.map((i) => i.libraryId).sort()).toEqual(["dance-floor", "table-round"]);
  await expect(page.getByTestId("count-seats")).toHaveText("8");
});

test("[LIB-07] [LIB-08] [LIB-09] [LIB-10] step-3 pieces: by category, string lights over a table pick the table first, a neon sign's words", async ({
  page,
}) => {
  await openStudio(page, "fresh");
  await page.getByTestId("category-plant").click();
  await page.getByTestId("add-plant-olive").click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("category-light").click();
  await page.getByTestId("add-light-string").click();
  await page.getByRole("button", { name: "Done" }).click();
  // Hung over table 2, the strand is allowed; seen from above, a click there picks the table first.
  const strand = (await state(page)).active?.items.find((i) => i.libraryId === "light-string")?.id ?? "";
  const t2 = await item(page, "t2");
  await page.evaluate(
    ({ id, x, z }) => {
      const ed = (window as unknown as W).__studio.editor as unknown as {
        moveItems: (m: { id: string; x: number; z: number }[]) => void;
        select: (ids: string[]) => void;
      };
      ed.moveItems([{ id, x, z }]);
      ed.select([]);
    },
    { id: strand, x: t2.x, z: t2.z },
  );
  await setCamera(page, "plan");
  const [sx, sy] = await screenOf(page, t2.x, 2.8, t2.z);
  await page.mouse.click(sx, sy);
  expect((await state(page)).selection).toEqual(["t2"]);
  // With the table selected, a press-and-drag there still moves the table, not the strand.
  const strandAt = await item(page, strand);
  const [tx, ty] = await screenOf(page, t2.x + 0.3, 2.8, t2.z);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  await page.mouse.up();
  expect((await item(page, "t2")).x).not.toBeCloseTo(t2.x, 2);
  expect(await item(page, strand)).toMatchObject({ x: strandAt.x, z: strandAt.z });
  expect((await state(page)).selection).toEqual(["t2"]);
  // A plain click on the selected table reaches the strand.
  await page.mouse.click(tx, ty);
  await expect.poll(async () => (await state(page)).selection).toEqual([strand]);
  await setCamera(page, "dollhouse");
  await page.evaluate(() => (window as unknown as W).__studio.editor.select([]));
  await page.getByTestId("category-sign").click();
  await page.getByTestId("add-sign-neon").click();
  await page.getByTestId("text").fill("Ana & Ben");
  await page.getByTestId("text").press("Enter");
  const s = await state(page);
  const ids = s.active?.items.map((i) => i.libraryId) ?? [];
  expect(ids).toEqual(expect.arrayContaining(["plant-olive", "light-string", "sign-neon"]));
  const neon = s.active?.items.find((i) => i.libraryId === "sign-neon") as unknown as {
    options: { text?: string };
  };
  expect(neon.options.text).toBe("Ana & Ben");
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
  // Only table arrangements are centrepieces; arches, walls and hanging pieces are placed from the library.
  await expect(page.getByTestId("florals-floral-low")).toBeVisible();
  await expect(page.getByTestId("florals-floral-hanging")).toHaveCount(0);
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
  await expect(page.getByRole("radio", { name: "Table 2" })).toHaveAttribute("aria-checked", "true");
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

test("[PLT-03] [PPL-03] [LIB-04] [LIB-08] 15 fully set tables, a dressed room and 150 people stay inside the draw-call and triangle budgets", async ({
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
        applyStyle: (target: "all", patch: Record<string, string>) => void;
        setStyle: (key: string, value: boolean) => void;
        active: () => { items: { libraryId: string }[] };
      };
      // 15 round tables of 8 in an empty room and 150 guests: 120 seated, 30 standing; the
      // heaviest décor: tall arrangements, 5-arm candelabra, runners and full place settings.
      ed.createScenario("blank");
      for (let i = 0; i < 15; i++) ed.addItem("table-round", [8, 10], { seats: 8 });
      ed.setGuests(150);
      ed.applyStyle("all", {
        florals: "floral-tall",
        candles: "candelabra-5",
        runner: "runner-chiffon-ivory",
        napkin: "napkin-sage",
        charger: "gold",
      });
      for (const k of ["settings", "menus", "tableNumbers"]) ed.setStyle(k, true);
      // And a dressed room: lights, plants, florals and signs from step 3.
      for (const [id, x, z] of [
        ["light-string", 5, 4],
        ["light-string", 5, 9],
        ["light-uplight", 0.6, 3],
        ["light-uplight", 0.6, 7],
        ["light-disco", 4.5, 11],
        ["light-chandelier", 11, 6],
        ["floral-arch", 2.8, 14],
        ["floral-wall", 15, 7],
        ["plant-olive", 15.5, 2],
        ["plant-kentia", 12, 12.4],
        ["sign-neon", 9, 0.4],
        ["sign-welcome", 14, 13],
      ] as const)
        ed.addItem(id, [x, z]);
      return ed.active().items.length;
    });
    expect(tables).toBe(27);
    // Measure the settled room: software rendering takes a few seconds to rebuild every mesh after
    // 27 additions, and a frame mid-rebuild can briefly hold old and new meshes together.
    const read = () =>
      page.evaluate(() =>
        (window as unknown as { __renderInfo: () => { calls: number; triangles: number } }).__renderInfo(),
      );
    let info = await read();
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const next = await read();
      const settled = next.calls === info.calls && next.triangles === info.triangles;
      info = next;
      if (settled && i >= 3) break;
    }
    console.log(`${quality}: ${info.calls} draw calls, ${info.triangles} triangles`);
    expect(info.calls).toBeGreaterThan(0);
    expect(info.calls).toBeLessThan(calls);
    expect(info.triangles).toBeLessThan(triangles);
  }
});

test("[PPL-01] [PPL-02] [SCN-07] guests sit first, the rest stand; party fills the dance area", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-people").click();
  await expect(page.getByTestId("people-seated")).toHaveText("72");
  await expect(page.getByTestId("people-standing")).toHaveText("3");
  await expect(page.getByRole("note")).toContainText("3 guests without a seat");
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
  await expect(page.getByTestId("count-advisories")).toHaveText("4");
  await expect(page.getByTestId("checks")).toContainText("Aisle ≈ 0.4 m between table 5 and table 6");
  await page.getByTestId("check-settings").click();
  await page.getByTestId("aisle").fill("0.6");
  // At 0.6 m the 0.8 m aisle passes; the 0.4 m one, the ≈ 0.6 m one (just under) and the DJ booth remain.
  await expect(page.getByTestId("count-advisories")).toHaveText("3");
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

test("[SCN-06] compare two scenarios side by side from the same camera, with their counts", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("scenario-menu").click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.getByTestId("section-people").click();
  await page.getByTestId("guests").getByRole("button", { name: /More/ }).click();
  await page.getByTestId("section-compare").click();
  await page
    .getByRole("radiogroup", { name: "Compare with" })
    .getByRole("radio", { name: "Option A · Venue sample", exact: true })
    .click();
  await expect(page.getByTestId("compare-canvas")).toBeVisible();
  // Each half is named, with its own counts; the side panel sits beside them, not over one.
  const panes = page.getByTestId("pane-counts");
  await expect(panes).toHaveCount(2);
  await expect(panes.first()).toContainText("Option A · Venue sample copy");
  await expect(panes.first()).toContainText("4without a seat");
  await expect(panes.last()).toContainText("Option A · Venue sample");
  await expect(panes.last()).toContainText("3without a seat");
  const right = await panes.last().boundingBox();
  const panel = await page.getByRole("complementary").boundingBox();
  expect((right?.x ?? 0) + (right?.width ?? 0)).toBeLessThanOrEqual(panel?.x ?? 0);
  const table = page.getByTestId("compare-table");
  await expect(table.getByRole("row", { name: /Without a seat/ })).toContainText("4");
  await expect(table.getByRole("row", { name: /Without a seat/ })).toContainText("3");
  await page.getByRole("radiogroup", { name: "Compare with" }).getByRole("radio", { name: "Off" }).click();
  await expect(page.getByTestId("compare-canvas")).toHaveCount(0);
});

test("[CAM-04] sit at a chair: seated eye height, facing the table; stand up returns", async ({ page }) => {
  await openStudio(page);
  await page.evaluate(() => (window as unknown as W).__studio.editor.select(["t2"]));
  await page.getByTestId("sit-here").click();
  await page.getByTestId("seat-1").click();
  await expect(page.getByTestId("seated")).toContainText("table 2");
  // The camera moves down to the seat (it starts once walk mode is set up).
  await page.waitForFunction(
    () => ((window as unknown as { __pose: () => number[] }).__pose()[1] ?? 9) < 1.6,
    null,
    { timeout: 30_000 },
  );
  const pose = await page.evaluate(() => (window as unknown as { __pose: () => number[] }).__pose());
  const t2 = await item(page, "t2");
  // Seated eye height (1.2 m above the floor it stands on) at the edge of table 2.
  expect(pose[1] ?? 0).toBeGreaterThan(1.15);
  expect(pose[1] ?? 0).toBeLessThan(1.25);
  expect(Math.hypot((pose[0] ?? 0) - t2.x, (pose[2] ?? 0) - t2.z)).toBeLessThan(2.2);
  // Facing the table's centre: the view's heading points at it within 10°.
  const facing = await page.evaluate(() => (window as unknown as { __facing: () => number[] }).__facing());
  const heading = Math.atan2(facing[0] ?? 0, facing[2] ?? 0);
  const toTable = Math.atan2(t2.x - (pose[0] ?? 0), t2.z - (pose[2] ?? 0));
  expect(Math.abs(Math.atan2(Math.sin(heading - toTable), Math.cos(heading - toTable)))).toBeLessThan(0.18);
  await page.getByRole("button", { name: "Stand up" }).click();
  expect((await state(page)).camera).toBe("dollhouse");
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

test("[IMP-01] [IMP-02] [IMP-03] [IMP-04] [IMP-05] [IMP-06] [IMP-07] a photo becomes a labelled item used on every table; it survives a reload", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-inspiration").click();
  await page.getByTestId("add-inspiration").click();
  await page.getByTestId("import-link").fill("https://shop.example.com/gold-candelabra");
  await page.getByTestId("photo-file").setInputFiles(await photoFile(page, "#c9a55e"));
  await page.getByTestId("import-type-candle").click();
  await page.getByTestId("import-next").click();
  // Crop: drag the bottom-right corner in; the frame gets smaller.
  const box = page.getByTestId("crop-box");
  const before = (await box.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const corner = box.locator(".crop-handle.se");
  const at = (await corner.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  // The handle's inner half (its outer half lies outside the photo).
  await page.mouse.move(at.x + at.width * 0.3, at.y + at.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(at.x - 40, at.y - 30, { steps: 4 });
  await page.mouse.up();
  const after = (await box.boundingBox()) ?? before;
  expect(after.width).toBeLessThan(before.width - 20);
  await page.getByTestId("import-width").fill("30");
  await page.getByTestId("import-height").fill("60");
  await page.getByTestId("import-next").click();
  // A tall gold thing: a candelabra or tapers, labelled as an approximate model.
  await expect(page.getByTestId("result-label")).toHaveText("Approximate 3D", { timeout: 20_000 });
  await expect(page.getByRole("radio", { checked: true, name: /candelabra|taper/i })).toBeVisible();
  await page.getByTestId("import-name").fill("Gold candelabra");
  await page.getByTestId("import-save").click();
  await expect(page.getByTestId("imported-detail")).toContainText("shop.example.com");
  await page.getByTestId("use-on-tables").click();
  const s = await state(page);
  const id = (s.active?.style as Record<string, string>).candles ?? "";
  expect(id).toMatch(/^imp-/);
  // Something with no fitting model is a photo preview, never called 3D; it can be placed.
  await page.getByTestId("detail-back").click();
  await importPhoto(page, { colour: "#5d7690", type: "other", w: 60, h: 120 });
  await expect(page.getByTestId("result-label")).toHaveText("Photo preview");
  await page.getByTestId("import-save").click();
  await page.getByTestId("place-imported").click();
  const placed = (await state(page)).selection[0] ?? "";
  expect((await item(page, placed)).libraryId).toMatch(/^imp-/);
  // Both stay in the library after a reload.
  await page.reload();
  await openStudio(page);
  await page.getByTestId("section-inspiration").click();
  await expect(page.getByTestId("inspiration-panel")).toContainText("Gold candelabra");
  await expect(page.getByTestId("inspiration-panel")).toContainText("Photo preview");
});
