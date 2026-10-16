import { expect, test } from "@playwright/test";
import { settle } from "../e2e/helpers";

// Every kind of light (LIB-08), placed in the evening room, unselected.
const LIGHTS = `(() => {
  const ed = __studio.editor;
  for (const [id, x, z] of [
    ["light-string", 5, 4], ["light-edison", 5, 9], ["light-uplight", 0.6, 3], ["light-uplight", 0.6, 7],
    ["light-pinspot", 8, 6], ["light-chandelier", 11, 6], ["light-disco", 4.5, 11], ["light-dj", 2.5, 11],
    ["light-monogram", 9, 3],
  ]) ed.addItem(id, [x, z]);
  ed.select([]);
})()`;

// Scene-only (bare) screenshots of fixed camera views. Baselines change only in reviewed commits.
const views: { name: string; setup: string; ids?: string }[] = [
  { name: "dollhouse-evening", setup: "" },
  { name: "dollhouse-evening-lights", setup: LIGHTS, ids: "[LIB-08] " },
  { name: "dollhouse-day", setup: "__studio.editor.setStyle('lighting','day')" },
  { name: "plan", setup: "__studio.editor.setCamera('plan')" },
  { name: "walk-entrance", setup: "__studio.editor.setCamera('walk')" },
];

for (const v of views) {
  test(`[VEN-01] ${v.ids ?? ""}view: ${v.name}`, async ({ page }) => {
    await page.goto("/?bare&fresh&quality=low");
    await page.waitForFunction(() => (window as unknown as { __studio?: unknown }).__studio);
    if (v.setup) await page.evaluate(v.setup);
    await page.waitForTimeout(500);
    await settle(page);
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot(`${v.name}.png`, { maxDiffPixelRatio: 0.04, timeout: 60_000 });
  });
}
