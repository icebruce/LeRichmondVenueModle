import { expect, test } from "@playwright/test";
import { settle } from "../e2e/helpers";

// Scene-only (bare) screenshots of fixed camera views. Baselines change only in reviewed commits.
const views: { name: string; setup: string }[] = [
  { name: "dollhouse-evening", setup: "" },
  { name: "dollhouse-day", setup: "__studio.editor.setStyle('lighting','day')" },
  { name: "plan", setup: "__studio.editor.setCamera('plan')" },
  { name: "walk-entrance", setup: "__studio.editor.setCamera('walk')" },
];

for (const v of views) {
  test(`[VEN-01] view: ${v.name}`, async ({ page }) => {
    await page.goto("/?bare&fresh&quality=low");
    await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
    if (v.setup) await page.evaluate(v.setup);
    await page.waitForTimeout(500);
    await settle(page);
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot(`${v.name}.png`, { maxDiffPixelRatio: 0.04, timeout: 60_000 });
  });
}
