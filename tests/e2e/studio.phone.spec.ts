import { type Page, expect, test } from "@playwright/test";
import { item, openStudio, screenOf, setCamera, settle, state } from "./helpers";

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

test("[PLT-02] phone sheet: swipes down a step at a time; back closes the top layer, then asks before leaving", async ({
  page,
}) => {
  await openStudio(page);
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await swipe(page, ".grabber", 400, 520);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await swipe(page, ".grabber", 600, 720);
  await expect(page.locator(".panel")).toHaveCount(0);
  // Back: a page, then the sheet a height at a time, close in turn.
  await page.getByTestId("section-room").click();
  await page.getByTestId("room-rules").click();
  await expect(page.getByTestId("aisle")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("venue-panel")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await page.goBack();
  await expect(page.locator(".panel")).toHaveCount(0);
  // Nothing left open: back asks before leaving; Stay keeps the app as it was.
  const leave = page.getByRole("dialog", { name: "Leave Richmond Studio?" });
  await page.goBack();
  await expect(leave).toBeVisible();
  await page.getByTestId("leave-stay").click();
  await expect(leave).toHaveCount(0);
  await expect(page.locator(".tabbar")).toBeVisible();
  // Asked again, Leave goes to the page before the app.
  await page.goBack();
  await expect(leave).toBeVisible();
  await page.getByTestId("leave-go").click();
  await page.waitForURL("about:blank");
});

test("[PLT-02] phone back: closes the camera menu, then walks back to the room", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("camera-menu").click();
  await expect(page.getByRole("menu", { name: "Camera" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("menu", { name: "Camera" })).toHaveCount(0);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
  await setCamera(page, "walk");
  await expect(page.locator(".joystick")).toBeVisible();
  await page.goBack();
  await expect.poll(async () => (await state(page)).camera).toBe("dollhouse");
  await expect(page.getByRole("dialog", { name: "Leave Richmond Studio?" })).toHaveCount(0);
});

test("[PLT-02] phone sheet: content scrolls at half; only the grabber opens it full", async ({ page }) => {
  await openStudio(page);
  await page.getByTestId("section-add").click();
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  await swipe(page, ".panel-scroll", 700, 520);
  await expect(page.locator(".panel")).toHaveClass(/detent-half/);
  // The sheet's head is the handle, not just the thin grabber: a drag from the counts line opens it.
  await swipe(page, ".sheet-head .counts-line", 400, 250);
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

test("[EXP-02] [PLT-02] phone Photo mode: from the camera menu, a card with blur and Save image; back closes it", async ({
  page,
}) => {
  await openStudio(page, "fresh");
  await page.getByTestId("camera-menu").click();
  await page.getByRole("menuitem", { name: /Photo mode/ }).click();
  await expect(page.getByTestId("photo-layer")).toBeVisible();
  await expect(page.locator(".tabbar")).toHaveCount(0);
  await expect(page.getByTestId("camera-menu")).toHaveCount(0);
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("photo-save").click()]);
  expect(d.suggestedFilename()).toMatch(/Venue sample view\.png$/);
  await page.goBack();
  await expect(page.getByTestId("photo-layer")).toHaveCount(0);
  await expect(page.locator(".tabbar")).toBeVisible();
});

test("[PLT-02] [LAY-02] phone: a pan that starts on a table selects nothing, so a closed sheet stays closed", async ({
  page,
}) => {
  await openStudio(page);
  await setCamera(page, "plan");
  await swipe(page, ".grabber", 600, 720);
  await expect(page.locator(".panel")).toHaveCount(0);
  // The view re-frames the room once the sheet has gone.
  await page.waitForTimeout(500);
  await settle(page);
  const t = await item(page, "t1");
  const [x, y] = await screenOf(page, t.x, 0.77, t.z);
  // A one-finger pan from the table, quicker than the hold that picks it up: sent in one task, so a
  // busy software renderer cannot let the hold's timer run between the press and the moves.
  await page.getByTestId("studio-canvas").evaluate(
    (wrap, [px, py]) => {
      const canvas = wrap.querySelector("canvas") ?? wrap;
      // On the canvas, as a finger's events are: they reach the camera controls and the window.
      const fire = (type: string, dx: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: "touch",
            isPrimary: true,
            bubbles: true,
            clientX: (px as number) + dx,
            clientY: py as number,
          }),
        );
      fire("pointerdown", 0);
      for (let i = 1; i <= 6; i++) fire("pointermove", i * 12);
      fire("pointerup", 72);
    },
    [x, y],
  );
  await page.waitForTimeout(500);
  expect((await state(page)).selection).toEqual([]);
  await expect(page.locator(".panel")).toHaveCount(0);
  // A tap still selects it and shows it at the sheet's peek.
  const [tx, ty] = await screenOf(page, t.x, 0.77, t.z);
  await page.touchscreen.tap(tx, ty);
  await expect.poll(async () => (await state(page)).selection).toEqual(["t1"]);
  await expect(page.locator(".panel")).toHaveClass(/detent-peek/);
});
