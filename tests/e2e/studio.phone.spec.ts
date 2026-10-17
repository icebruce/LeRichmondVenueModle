import { type Page, expect, test } from "@playwright/test";
import { openStudio, screenOf, setCamera, state } from "./helpers";

test("[PLT-02] phone layout: tab bar, bottom sheet inspector, walk pad", async ({ page }) => {
  await openStudio(page);
  await expect(page.locator(".tabbar")).toBeVisible();
  await expect(page.locator(".rail")).toBeHidden();
  await setCamera(page, "plan");
  const s = await state(page);
  const t = s.active?.items.find((i) => i.id === "t1");
  const [x, y] = await screenOf(page, t?.x ?? 0, 0.77, t?.z ?? 0);
  await page.touchscreen.tap(x, y);
  await expect(page.getByTestId("inspector")).toBeVisible();
  // The sheet opens at peek height with the key actions in view, and the table stays visible.
  await expect(page.getByTestId("rotate-90")).toBeInViewport();
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" }).first()).toBeVisible();
  await setCamera(page, "walk");
  await expect(page.locator(".joystick")).toBeVisible();
});

/** A steady finger drag on `selector` from y0 to y1 over 400 ms (slower than a flick). */
async function swipe(page: Page, selector: string, y0: number, y1: number) {
  const el = page.locator(selector).first();
  const fire = (end: boolean, y: number) =>
    el.evaluate(
      (node, [isEnd, at]) => {
        const touch = new Touch({ identifier: 1, target: node, clientX: 195, clientY: Number(at) });
        node.dispatchEvent(
          new TouchEvent(isEnd ? "touchend" : "touchstart", {
            bubbles: true,
            touches: isEnd ? [] : [touch],
            changedTouches: [touch],
          }),
        );
      },
      [end, y] as const,
    );
  await fire(false, y0);
  await page.waitForTimeout(400);
  await fire(true, y1);
}

test("[PLT-02] phone controls: camera menu and lighting top right, undo under them, no plan name", async ({
  page,
}) => {
  await openStudio(page);
  await expect(page.getByTestId("plan-name")).toHaveCount(0);
  const stack = await page.locator(".phone-controls .stack").first().boundingBox();
  const history = await page.locator(".phone-controls .history").boundingBox();
  expect(history?.y ?? 0).toBeGreaterThan((stack?.y ?? 0) + (stack?.height ?? 0));
  expect((history?.x ?? 0) + (history?.width ?? 0)).toBeGreaterThan(330);
  await setCamera(page, "plan");
  expect((await state(page)).camera).toBe("plan");
  await expect(page.getByTestId("camera-menu")).toHaveAccessibleName("Camera: Plan");
});

test("[PLT-02] phone sheet: swipes down a step at a time to closed; system back closes the top layer", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await swipe(page, ".grabber", 400, 520);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await swipe(page, ".grabber", 600, 720);
  await expect(page.locator(".panel")).toHaveCount(0);
  // Back: a page, then the sheet, close in turn; the app stays open.
  await page.getByTestId("section-room").click();
  await page.getByTestId("room-rules").click();
  await expect(page.getByTestId("aisle")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("venue-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".panel")).toHaveCount(0);
  // Nothing left open: back stays in the app.
  await page.goBack();
  await expect(page.locator(".tabbar")).toBeVisible();
  expect((await state(page)).active).toBeTruthy();
});

test("[PLT-02] phone sheet: content scrolls at half; only the grabber opens it full", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await swipe(page, ".panel-scroll", 700, 520);
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await swipe(page, ".grabber", 400, 250);
  await expect(page.locator(".panel")).toHaveClass(/detent-full/);
  // From its peek the content still raises the sheet, one step to half.
  await swipe(page, ".grabber", 100, 220);
  await swipe(page, ".grabber", 400, 520);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await swipe(page, ".panel-scroll", 760, 600);
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
});

test("[PLT-02] [DEC-02] phone: back steps from a candle kind's sizes to Candles, then to Style", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-style").click();
  await page.getByTestId("style-row-candles").click();
  await page.getByTestId("candle-open-candle-votives").click();
  await expect(page.getByTestId("style-candle-kind")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("style-candles")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("style-panel")).toBeVisible();
});

test("[PLT-02] phone: adding a piece drops the sheet to its peek with the piece selected", async ({
  page,
}) => {
  await openStudio(page);
  // An empty room, so the new table always finds a place.
  await page.evaluate(() =>
    (
      window as unknown as { __studio: { editor: { createScenario: (k: string) => string } } }
    ).__studio.editor.createScenario("blank"),
  );
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await page.getByTestId("add-table-round").click();
  await expect.poll(async () => (await state(page)).selection.length).toBe(1);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect(page.getByTestId("rotate-90")).toBeInViewport();
});
