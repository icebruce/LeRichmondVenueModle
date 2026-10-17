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

/** A finger drag on `selector` from y0 to y1 (React reads the touch points' clientY). */
async function swipe(page: Page, selector: string, y0: number, y1: number) {
  await page
    .locator(selector)
    .first()
    .evaluate(
      (el, [a, b]) => {
        const touch = (y: number) => new Touch({ identifier: 1, target: el, clientX: 195, clientY: y });
        el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(a ?? 0)] }));
        el.dispatchEvent(
          new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(b ?? 0)] }),
        );
      },
      [y0, y1],
    );
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

test("[PLT-02] phone: adding a piece drops the sheet to its peek with the piece selected", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await page.getByTestId("add-table-round").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await expect(page.getByTestId("inspector")).toBeVisible();
  await expect(page.getByTestId("rotate-90")).toBeInViewport();
  expect((await state(page)).selection).toHaveLength(1);
});
