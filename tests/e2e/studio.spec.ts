import { expect, test } from "@playwright/test";
import {
  type W,
  dragItem,
  importPhoto,
  item,
  openSection,
  openStudio,
  openYours,
  photoFile,
  screenOf,
  setCamera,
  settle,
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
  // The selection's toolbar names it; its details are one click away.
  await expect(page.getByTestId("selection-bar")).toContainText("Table 1");

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
  await expect(page.getByTestId("selection-bar")).toContainText("Table 2");
  await page.getByTestId("details").click();
  await expect(page.getByTestId("inspector")).toContainText("Table 2");
  await expect(page.getByTestId("back")).toHaveText("Room");
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
  await page.getByTestId("plan-name").click();
  await page.getByTestId("plan-new-empty").click();
  await openSection(page, "add");
  await page.getByTestId("add-table-round").click();
  // Added and selected; the library stays open for the next piece.
  await expect(page.getByTestId("selection-bar")).toContainText("Table 1");
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  await page.keyboard.press("Escape");
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
  await openSection(page, "add");
  await page.getByTestId("category-plant").click();
  await page.getByTestId("add-plant-olive").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("category-light").click();
  await page.getByTestId("add-light-string").click();
  await page.keyboard.press("Escape");
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
  // West, away from the olive tree, which lands beside the table at the centre of the view.
  const [tx, ty] = await screenOf(page, t2.x - 0.3, 2.8, t2.z);
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
  await page.getByTestId("details").click();
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

test("[LIB-03] [LIB-05] [DEC-01] [DEC-04] [DEC-05] style for all tables or just the selected one; a candle mix", async ({
  page,
}) => {
  await openStudio(page);
  const style = () =>
    page.evaluate(() => {
      const st = (window as unknown as W).__studio.editor.store.getState();
      const sc = st.scenarios[st.activeId] as unknown as {
        style: Record<string, unknown>;
        items: { id: string; style?: Record<string, unknown> }[];
      };
      return { style: sc.style, t2: sc.items.find((i) => i.id === "t2")?.style };
    });
  await openSection(page, "style");
  await page.getByTestId("linen-linen-white").click();
  await page.getByTestId("linen-length-lap").click();
  // Each part of the dressing has a summary row that opens its pictures.
  await page.getByTestId("style-row-centrepiece").click();
  // Only table arrangements are centrepieces; arches, walls and hanging pieces are placed from Add.
  await expect(page.getByTestId("florals-floral-low")).toBeVisible();
  await expect(page.getByTestId("florals-floral-hanging")).toHaveCount(0);
  await page.getByTestId("back").click();
  await page.getByTestId("style-row-candles").click();
  // Votives are on by default; add tapers, then one more taper.
  await page.getByTestId("candles-candle-tapers").click();
  await page.getByRole("button", { name: /More: Tall tapers/ }).click();
  await page.getByTestId("back").click();
  await page.getByTestId("style-row-chairs").click();
  await page.getByTestId("chair-chair-chiavari-gold").click();
  await page.getByTestId("back").click();
  expect((await style()).style).toMatchObject({
    linen: "linen-white",
    linenLength: "lap",
    candles: [
      { id: "candle-votives", n: 3 },
      { id: "candle-tapers", n: 3 },
    ],
    chair: "chair-chiavari-gold",
  });
  await expect(page.getByTestId("style-row-candles")).toContainText("6 candles · 2 kinds");
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

test("[DEC-02] [LIB-05] a candle kind's sizes open from Candles; two or more candles shuffle and turn", async ({
  page,
}) => {
  await openStudio(page);
  await openSection(page, "style");
  await page.getByTestId("style-row-candles").click();
  // One candelabra, with its arms, in place of the 3- and 5-arm pieces.
  await expect(page.getByTestId("candles-candelabra")).toBeVisible();
  await expect(page.getByTestId("candles-candelabra-5")).toHaveCount(0);
  await page.getByTestId("candles-candle-pillars").click();
  // Sizes keep to one line (no-break spaces, word joiners in a range): read as plain text.
  const plain = async (id: string) =>
    ((await page.getByTestId(id).textContent()) ?? "").replace(/\u2060/g, "").replace(/\u00a0/g, " ");
  await expect.poll(() => plain("candle-layer-candle-pillars")).toContain("10–22.5 cm");
  await page.getByTestId("candle-open-candle-pillars").click();
  await expect(page.getByTestId("style-candle-kind")).toBeVisible();
  await page.getByRole("button", { name: "Taller pillar 1" }).click();
  await expect(page.getByTestId("candle-height-0")).toHaveText("17.5 cm");
  // An added pillar takes the next default height.
  await page.getByRole("button", { name: "More per table" }).click();
  await expect(page.getByTestId("candle-height-3")).toHaveText("15 cm");
  await page.getByTestId("back").click();
  await page.getByTestId("candles-candelabra").click();
  await page.getByTestId("candle-open-candelabra").click();
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await page.getByTestId("back").click();
  await expect.poll(() => plain("candle-layer-candelabra")).toContain("5 arms · 65 cm");
  await page.getByTestId("candle-shuffle").click();
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByTestId("candle-turn")).toHaveText("15°");
  const style = (await state(page)).active?.style;
  expect(style?.candles).toEqual([
    { id: "candle-votives", n: 3 },
    { id: "candle-pillars", n: 4, h: [17.5, 22.5, 10] },
    { id: "candelabra", n: 1, arms: 5 },
  ]);
  expect(style?.candleOrder).toBeGreaterThan(0);
  expect(style?.candleTurn).toBe(15);
});

test("[LAY-05] dragging a table near another's centre line snaps into line with it", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("plan-name").click();
  await page.getByTestId("plan-new-empty").click();
  await openSection(page, "add");
  await page.getByTestId("add-table-round").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("add-table-round").click();
  await page.keyboard.press("Escape");
  const ids = await page.evaluate(() => {
    const ed = (window as unknown as W).__studio.editor as unknown as {
      active: () => { items: { id: string }[] };
      moveItems: (m: { id: string; x: number; z: number }[]) => void;
    };
    const [a, b] = ed.active().items;
    ed.moveItems([
      { id: a?.id ?? "", x: 3, z: 8.4 },
      { id: b?.id ?? "", x: 6, z: 11.2 },
    ]);
    return [a?.id ?? "", b?.id ?? ""];
  });
  await setCamera(page, "plan");
  await dragItem(page, ids[1] as string, [3.12, 11.2]);
  const b = await item(page, ids[1] as string);
  expect(b.x).toBeCloseTo(3, 5);
});

test("[CAM-05] [VEN-01] reference views land exactly on their pose; Reset view returns", async ({ page }) => {
  await openStudio(page);
  const pose = () => page.evaluate(() => (window as unknown as { __pose: () => number[] }).__pose());
  const start = await pose();
  await openSection(page, "room");
  const preset = await page.evaluate(
    () =>
      (
        window as unknown as {
          __studio: { venue: { data: { cameraPresets: Record<string, { position: number[] }> } } };
        }
      ).__studio.venue.data.cameraPresets.R03?.position,
  );
  // Wait for where the camera ends up, not for its move to be seen starting (a short move can
  // start and finish between two checks on a busy machine).
  const settled = () =>
    page.waitForFunction(() => !(window as unknown as { __rig: { tweening: boolean } }).__rig.tweening);
  const off = async (to: number[] | undefined) => {
    const at = await pose();
    return Math.max(...[0, 1, 2].map((i) => Math.abs((at[i] ?? 0) - (to?.[i] ?? NaN))));
  };
  await page.getByRole("button", { name: /At the bar/ }).click();
  await expect.poll(() => off(preset), { timeout: 30_000 }).toBeLessThan(0.05);
  await settled();
  const at = await pose();
  for (let i = 0; i < 3; i++) expect(at[i]).toBeCloseTo(preset?.[i] ?? NaN, 1);
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect.poll(() => off(start), { timeout: 30_000 }).toBeLessThan(0.5);
  await settled();
  const back = await pose();
  for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(start[i] ?? NaN, 0);
});

// The benchmark scenes (src/app/bench.ts): the venue sample with the heaviest dressing and 75
// guests; 15 fully set tables, a dressed room and 150 guests. Phone budgets for the phone tiers.
// Balanced is measured on a frame of motion (its ambient occlusion is drawn only once the view is
// still; that frame is logged, not held to the budget, and goes to the V0 device gate).
for (const [bench, items] of [
  ["sample", 10],
  ["ppl03", 27],
] as const)
  for (const [quality, tier, calls, triangles] of [
    ["high", "high", 250, 1_500_000],
    ["low", "balanced", 150, 600_000],
    ["low", "battery", 150, 600_000],
  ] as const)
    test(`[PLT-03] [PPL-03] [LIB-04] [LIB-05] [LIB-08] benchmark ${bench} on ${tier} stays inside the draw-call and triangle budgets`, async ({
      page,
    }) => {
      type Hooks = {
        __worstFrame: () => { calls: number; triangles: number };
        __redraw: () => void;
        __holdMotion: () => void;
      };
      await page.goto(`/?bench=${bench}&quality=${quality}&tier=${tier}`);
      await page.waitForFunction(() => (window as unknown as { __redraw?: unknown }).__redraw, null, {
        timeout: 60_000,
      });
      await expect(page.locator(".loading")).toHaveCount(0, { timeout: 60_000 });
      expect((await state(page)).active?.items.length).toBe(items);
      // Each reading draws one full frame (shadow pass included) at once and reads its totals.
      const read = () =>
        page.evaluate(() => {
          const w = window as unknown as Hooks;
          w.__redraw();
          return w.__worstFrame();
        });
      // Measure the settled room: software rendering takes a few seconds to build every mesh.
      const settled = async () => {
        let info = await read();
        for (let i = 0; i < 20; i++) {
          const next = await read();
          const same = next.calls === info.calls && next.triangles === info.triangles;
          info = next;
          if (same) break;
        }
        return info;
      };
      if (tier === "balanced") {
        const still = await settled();
        console.log(`${bench} ${tier} still frame: ${still.calls} draw calls, ${still.triangles} triangles`);
        await page.evaluate(() => (window as unknown as Hooks).__holdMotion());
      }
      const info = await settled();
      console.log(`${bench} ${tier}: ${info.calls} draw calls, ${info.triangles} triangles`);
      expect(info.calls).toBeGreaterThan(0);
      expect(info.calls).toBeLessThan(calls);
      expect(info.triangles).toBeLessThan(triangles);
    });

test("[PLT-03] a tier change while the view is still redraws the room and its shadows, then compiles nothing more", async ({
  page,
}) => {
  type Hooks = {
    __setTier: (t: string) => void;
    __shadowDraws: () => number;
    __programs: () => number[];
    __renderInfo: () => { calls: number };
  };
  // Auto starts a desktop at High; step down as Auto would.
  await openStudio(page, "fresh&quality=high");
  const draws = await page.evaluate(() => (window as unknown as Hooks).__shadowDraws());
  await page.evaluate(() => (window as unknown as Hooks).__setTier("balanced"));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooks).__shadowDraws()))
    .toBeGreaterThan(draws);
  await page.waitForTimeout(2000);
  await settle(page);
  // The room is drawn, not a blank canvas: unshadowed it reads as flat light grey (mean ≈ 220).
  const shot = await page.getByTestId("studio-canvas").screenshot();
  const mean = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4)
      sum += ((d[i] as number) + (d[i + 1] as number) + (d[i + 2] as number)) / 3;
    return sum / (d.length / 4);
  }, shot.toString("base64"));
  expect(mean).toBeLessThan(200);
  // Shaders for the new tier were compiled once; switching views compiles nothing more.
  const loaded = Math.max(...(await page.evaluate(() => (window as unknown as Hooks).__programs())));
  for (const js of ["__studio.editor.setCamera('walk')", "__studio.editor.setCamera('dollhouse')"]) {
    await page.evaluate(js);
    await page.waitForTimeout(300);
    await settle(page);
  }
  expect(
    (await page.evaluate(() => (window as unknown as Hooks).__programs())).filter((id) => id > loaded),
  ).toEqual([]);
});

test("[PLT-05] the graphics setting: Auto by default, a choice applies at once and is kept on this device", async ({
  page,
}) => {
  await openStudio(page, "fresh&quality=high");
  await expect(page.getByTestId("room-graphics")).toContainText("Auto (High)");
  await page.getByTestId("room-graphics").click();
  // Battery saver is for phones only.
  await expect(page.getByTestId("graphics-battery")).toHaveCount(0);
  await page.getByTestId("graphics-balanced").click();
  await expect(page.getByTestId("graphics-balanced").locator("input")).toBeChecked();
  await page.getByTestId("back").click();
  await expect(page.getByTestId("room-graphics")).toContainText("Balanced");
  await page.reload();
  await expect(page.getByTestId("room-graphics")).toContainText("Balanced", { timeout: 60_000 });
  // On a phone, Battery saver is offered too.
  await openStudio(page, "fresh&quality=low");
  await page.getByTestId("room-graphics").click();
  await expect(page.getByTestId("graphics-battery")).toBeVisible();
});

test("[PLT-03] ?perf reads out the tier and frame totals and goes to the benchmark cameras", async ({
  page,
}) => {
  await page.goto("/?perf&bench=sample&quality=low&tier=battery");
  const perf = page.getByTestId("perf");
  await expect(perf).toContainText("Tier Battery saver", { timeout: 60_000 });
  await expect(perf).toContainText(/Draw calls [1-9]\d* · triangles \d+k/, { timeout: 60_000 });
  await expect(perf).toContainText(/GPU ≈ [1-9]\d* MB/, { timeout: 60_000 });
  await perf.getByRole("button", { name: "Eye level" }).click();
  // The camera animates there: wait for it to arrive at eye height.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __pose: () => number[] }).__pose()[1]), {
      timeout: 60_000,
    })
    .toBeCloseTo(1.65, 1);
});

for (const quality of ["low", "high"] as const)
  test(`[PLT-03] nothing is drawn while the view is still; views, lighting, menus and a selection compile no shader (${quality})`, async ({
    page,
  }) => {
    type Hooks = { __frames: () => number; __programs: () => number[] };
    await openStudio(page, `fresh&quality=${quality}`);
    // A pinspot adds the evening-only beams and glows (LIB-08).
    await page.evaluate(() => {
      const ed = (window as unknown as W).__studio.editor as unknown as {
        addItem: (id: string, at: [number, number]) => string | null;
        select: (ids: string[]) => void;
      };
      ed.addItem("light-pinspot", [8, 6]);
      ed.select([]);
    });
    await page.waitForTimeout(1500);
    await settle(page);
    const frames = () => page.evaluate(() => (window as unknown as Hooks).__frames());
    const programs = () => page.evaluate(() => (window as unknown as Hooks).__programs());
    // Still: no frame at all (VISUAL_STATUS targets: 0 frames while idle).
    await page.waitForTimeout(1000);
    const still = await frames();
    await page.waitForTimeout(2000);
    expect(await frames()).toBe(still);
    // Every shader was compiled at load: switching never adds a program.
    const loaded = Math.max(...(await programs()));
    const run = async (js: string) => {
      await page.evaluate(js);
      await page.waitForTimeout(300);
      await settle(page);
    };
    for (const js of [
      "__studio.editor.setStyle('lighting', 'day')",
      "__studio.editor.setStyle('lighting', 'evening')",
      "__studio.editor.setCamera('plan')",
      "__studio.editor.setCamera('walk')",
      "__studio.editor.setCamera('dollhouse')",
      "__camera('R03')",
      "__camera(null)",
      "__studio.editor.select(['t2'])",
      "__studio.editor.select([])",
    ])
      await run(js);
    for (const id of ["room", "add", "style", "guests", "plans"] as const) await openSection(page, id);
    await settle(page);
    expect((await programs()).filter((id) => id > loaded)).toEqual([]);
  });

test("[PLT-03] the shadow map is redrawn when the room changes, not when the camera moves", async ({
  page,
}) => {
  type Hooks = { __shadowDraws: () => number };
  await openStudio(page);
  const draws = () => page.evaluate(() => (window as unknown as Hooks).__shadowDraws());
  const before = await draws();
  const box = (await page.getByTestId("studio-canvas").boundingBox()) as {
    x: number;
    y: number;
    width: number;
  };
  const [x, y] = [box.x + box.width * 0.7, box.y + 400];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 5, y);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await settle(page);
  expect(await draws()).toBe(before);
  await page.evaluate(() =>
    ((window as unknown as W).__studio.editor as unknown as { setGuests: (n: number) => void }).setGuests(60),
  );
  await expect.poll(draws).toBeGreaterThan(before);
});

test("[PLT-03] labels stay on their place in the room after the window resizes", async ({ page }) => {
  await openStudio(page);
  const label = page.locator(".advisory-label").first();
  await expect(label).toBeVisible();
  const at = async () => {
    await page.waitForTimeout(500);
    await settle(page);
    const b = (await label.boundingBox()) as { x: number; y: number };
    return [b.x, b.y];
  };
  const before = await at();
  await page.setViewportSize({ width: 1200, height: 800 });
  await at();
  await page.setViewportSize({ width: 1440, height: 900 });
  const after = await at();
  expect(Math.abs((after[0] as number) - (before[0] as number))).toBeLessThan(3);
  expect(Math.abs((after[1] as number) - (before[1] as number))).toBeLessThan(3);
});

test("[PPL-01] [PPL-02] [SCN-07] guests sit first, the rest stand; party fills the dance area", async ({
  page,
}) => {
  await openStudio(page);
  await openSection(page, "guests");
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
  await page.getByTestId("open-checks").click();
  await expect(page.getByTestId("checks")).toContainText("Aisle ≈ 0.4 m between table 5 and table 6");
  // Adjust layout rules: Room › Layout rules, each rule with its live effect.
  await page.getByTestId("check-settings").click();
  await expect(page.getByTestId("checks")).toHaveCount(0);
  await page.getByTestId("aisle").fill("0.6");
  // At 0.6 m the 0.8 m aisle passes; the 0.4 m one, the ≈ 0.6 m one (just under) and the DJ booth remain.
  await expect(page.getByTestId("count-advisories")).toHaveText("3");
  await page.getByTestId("open-checks").click();
  await expect(page.getByTestId("checks")).not.toContainText("Aisle ≈ 0.8 m");
  await page.getByText("Aisle ≈ 0.4 m between table 5 and table 6").click();
  expect((await state(page)).selection.sort()).toEqual(["t5", "t6"]);
});

test("[EXP-01] [EXP-02] export the plan as PDF and PNG, and save the current view", async ({ page }) => {
  await openStudio(page);
  await openSection(page, "plans");
  const download = async (id: string) => {
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
  await openSection(page, "plans");
  await page.getByTestId("plan-duplicate").click();
  await openSection(page, "guests");
  await page.getByTestId("guests").getByRole("button", { name: /More/ }).click();
  await openSection(page, "plans");
  await page
    .getByRole("radiogroup", { name: "Compare with" })
    .getByRole("radio", { name: "Option A · Venue sample", exact: true })
    .click();
  await expect(page.getByTestId("compare-canvas")).toBeVisible();
  // Side by side, a selection has no toolbar in the room.
  await page.evaluate(() => (window as unknown as W).__studio.editor.select(["t1"]));
  await expect(page.getByTestId("selection-bar")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as W).__studio.editor.select([]));
  // Each half is named, with its own counts; the panel sits beside them, not over one.
  const panes = page.getByTestId("pane-counts");
  await expect(panes).toHaveCount(2);
  await expect(panes.first()).toContainText("Option A · Venue sample copy");
  await expect(panes.first()).toContainText("4without a seat");
  await expect(panes.last()).toContainText("Option A · Venue sample");
  await expect(panes.last()).toContainText("3without a seat");
  const left = await panes.first().boundingBox();
  const panel = await page.getByRole("complementary").boundingBox();
  expect(left?.x ?? 0).toBeGreaterThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0));
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
  // The camera moves down to the seat (it starts once walk mode is set up): wait until it arrives
  // at seated eye height (1.2 m above the floor it stands on).
  await page.waitForFunction(
    () => {
      const y = (window as unknown as { __pose: () => number[] }).__pose()[1] ?? 9;
      return y > 1.15 && y < 1.25;
    },
    null,
    { timeout: 30_000 },
  );
  await settle(page);
  const pose = await page.evaluate(() => (window as unknown as { __pose: () => number[] }).__pose());
  const t2 = await item(page, "t2");
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
  const lighting = async () => (await state(page)).active?.style.lighting;
  await page.getByTestId("light-toggle").click();
  expect(await lighting()).toBe("day");
  await expect(page.getByTestId("light-toggle")).toHaveAccessibleName("Switch to evening light");
  await page.getByTestId("light-toggle").click();
  expect(await lighting()).toBe("evening");
});

test("[SCN-01] [SCN-09] scenarios survive a reload; a ?fresh session never overwrites them", async ({
  page,
}) => {
  await openStudio(page, "saved");
  await page.getByTestId("plan-name").click();
  await page.getByTestId("plan-duplicate").click();
  await page.getByTestId("plan-rename").click();
  await page.locator("#scenario-name").fill("Option B");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("plan-name")).toHaveText("Option B");
  await openSection(page, "guests");
  await page.getByTestId("guests").getByRole("button", { name: /More/ }).click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("aria-label", "Saved on this device");
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
  const s = await state(page);
  expect(s.order.length).toBe(2);
  expect(s.active?.name).toBe("Option B");
  expect(s.active?.guests.count).toBe(76);

  // A throwaway ?fresh session edits its own copy; the saved scenarios are untouched afterwards.
  await openStudio(page, "fresh");
  await openSection(page, "guests");
  await page.getByTestId("guests").getByRole("button", { name: /Fewer/ }).click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("aria-label", "Saved on this device");
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
  await openYours(page);
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
  // The import becomes the whole candle mix on every table.
  const mix = (await state(page)).active?.style.candles as unknown as { id: string; n: number }[];
  expect(mix).toHaveLength(1);
  expect(mix[0]?.id).toMatch(/^imp-/);
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
  await openYours(page);
  await expect(page.getByTestId("inspiration-panel")).toContainText("Gold candelabra");
  await expect(page.getByTestId("inspiration-panel")).toContainText("Photo preview");
});

test("[PLT-04] desktop: labelled rail, a wide panel to resize or fold away, details inside the section", async ({
  page,
}) => {
  await openStudio(page);
  await expect(page.locator(".rail button")).toHaveText(["Room", "Add", "Style", "Guests", "Plans"]);
  const panel = page.getByRole("complementary");
  expect((await panel.boundingBox())?.width).toBe(400);
  await page.getByRole("separator", { name: "Panel width" }).press("ArrowRight");
  expect((await panel.boundingBox())?.width).toBe(420);
  await page.getByTestId("panel-collapse").click();
  await expect(panel).toHaveCount(0);
  await openSection(page, "add");
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  // A selection: its toolbar in the room; Details opens inside Add with a way back; another tab shows that tab.
  await page.evaluate(() => (window as unknown as W).__studio.editor.select(["t2"]));
  await page.getByTestId("details").click();
  await expect(page.getByTestId("inspector")).toContainText("Table 2");
  await page.getByTestId("back").click();
  await expect(page.getByTestId("layout-panel")).toBeVisible();
  await page.getByTestId("details").click();
  await page.getByTestId("section-guests").click();
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await expect(page.getByTestId("guests")).toBeVisible();
});

test("[LIB-13] [LAY-01] [REQ-01] one library: search every category, dressing on the tables, can't find it, drag into the room", async ({
  page,
}) => {
  await openStudio(page);
  const blank = () =>
    page.evaluate(() =>
      (
        window as unknown as { __studio: { editor: { createScenario: (k: string) => string } } }
      ).__studio.editor.createScenario("blank"),
    );
  await openSection(page, "add");
  // A search finds pieces in any category, and table dressing to use on every table.
  await page.getByTestId("library-search").fill("olive");
  await expect(page.getByTestId("add-plant-olive")).toBeVisible();
  // Plurals and US spellings find the same things.
  await page.getByTestId("library-search").fill("candles");
  await expect(page.getByTestId("use-candle-tapers")).toBeVisible();
  await expect(page.locator('[data-testid^="add-table-"]')).toHaveCount(0);
  // A search for nothing in the library says so and shows no pieces.
  await page.getByTestId("library-search").fill("zzzz");
  await expect(page.getByTestId("layout-panel")).toContainText("Nothing called “zzzz”");
  await expect(page.locator(".tile")).toHaveCount(0);
  await page.getByTestId("library-search").fill("centerpiece");
  await expect(page.locator('[data-testid^="use-floral-"]').first()).toBeVisible();
  await page.getByTestId("library-search").fill("taper");
  await page.getByTestId("use-candle-tapers").click();
  expect((await state(page)).active?.style.candles).toEqual([{ id: "candle-tapers", n: 2 }]);
  await page.getByTestId("library-search").fill("");
  await page.getByTestId("cant-find").click();
  await expect(page.getByTestId("add-inspiration")).toBeVisible();
  // A request can start from scratch: the form asks for a name and a size.
  await page.getByTestId("request-new").click();
  await expect(page.getByTestId("request-form")).toBeVisible();
  await page.getByTestId("request-save").click();
  await expect(page.getByTestId("request-form")).toContainText("Give it a name and a size");
  await page.getByTestId("request-back").click();
  // In an empty room there is no table to dress.
  await blank();
  await page.getByTestId("library-search").fill("taper");
  await expect(page.getByTestId("use-candle-tapers")).toBeDisabled();
  await page.getByTestId("library-search").fill("");
  // Desktop: drag a piece from the library onto the floor; it lands there.
  await page.getByTestId("category-table").click();
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0 };
  const [x, y] = await screenOf(page, 8, 0, 10);
  await page
    .getByTestId("add-table-round")
    .dragTo(canvas, { targetPosition: { x: x - box.x, y: y - box.y } });
  const placed = (await state(page)).active?.items.find((i) => i.libraryId === "table-round");
  expect(Math.hypot((placed?.x ?? 0) - 8, (placed?.z ?? 0) - 10)).toBeLessThan(0.6);
});

test("[LIB-08] a hanging light shows its height to the floor and drags up or down in the room", async ({
  page,
}) => {
  await openStudio(page);
  const id = await page.evaluate(() => {
    const ed = (window as unknown as W).__studio.editor as unknown as {
      createScenario: (k: string) => string;
      addItem: (id: string, at: [number, number]) => string | null;
      select: (ids: string[]) => void;
    };
    ed.createScenario("blank");
    const added = ed.addItem("light-chandelier", [8, 7]) ?? "";
    ed.select([added]);
    return added;
  });
  const before = await item(page, id);
  // A new light hangs at its default height, shown beside its drop line.
  const readout = page.locator(".height-readout");
  await expect(readout).toHaveText(/≈ \d\.\d m/);
  const hang = Number((await readout.textContent())?.match(/\d\.\d/)?.[0]);
  // The grip sits just under the light.
  const [x, y] = await screenOf(page, before.x, hang - 0.08, before.z);
  // A press without a move changes nothing.
  await page.mouse.click(x, y);
  expect((await item(page, id)).options.hang).toBe(before.options.hang);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 4 });
  await page.mouse.move(x, y - 60, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number((await item(page, id)).options.hang)).toBeGreaterThan(hang);
  // One change, one undo.
  await page.getByTestId("undo").click();
  await expect(readout).toHaveText(`≈ ${hang.toFixed(1)} m`);
});
