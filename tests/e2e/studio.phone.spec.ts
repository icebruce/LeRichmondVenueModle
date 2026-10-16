import { expect, test } from "@playwright/test";
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
