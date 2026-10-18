import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("@playwright/test");
const [, , outDir, tag] = process.argv;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("http://localhost:4173/?bare&fresh&quality=high&capture&poc&baked");
await page.waitForFunction(() => window.__studio && window.__camera, null, { timeout: 180000 });
await page.evaluate(() => {
  const ed = window.__studio.editor;
  ed.createScenario("blank");
  ed.setGuests(0);
  ed.setStyle("lighting", "evening");
  ed.select([]);
});
for (const [name, key] of [["shot", "poc"]]) {
  await page.evaluate((k) => window.__camera(k), key);
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !window.__rig?.tweening, null, { timeout: 120000 });
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${outDir}/${tag}-${name}.png`, timeout: 180000 });
  console.log("saved", name);
}
await browser.close();
