import { expect, test } from "@playwright/test";
import { dragItem, item, openStudio, screenOf, setCamera, state } from "./helpers";

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

test("[LIB-01] [LIB-02] [LIB-03] add a round table and a dance floor from the library", async ({ page }) => {
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

test("[VEN-02] clicking the bar or a wall selects nothing", async ({ page }) => {
  await openStudio(page);
  const [bx, by] = await screenOf(page, 7.7, 1.07, 8.1);
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

test("[SCN-01] [SCN-09] scenarios survive a reload", async ({ page }) => {
  await openStudio(page, "fresh");
  await page.getByRole("button", { name: /Option A/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: /copy/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.locator("#scenario-name").fill("Option B");
  await page.keyboard.press("Enter");
  await page.getByTestId("guests").getByRole("button", { name: /More/ }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved on this device");
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
  const s = await state(page);
  expect(s.order.length).toBe(2);
  expect(s.active?.name).toBe("Option B");
  expect(s.active?.guests.count).toBe(76);
});
