import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.goto("http://localhost:4173/?bare&fresh&quality=high&capture");
await page.waitForFunction(() => window.__studio && window.__camera && window.__exportVenue, null, {
  timeout: 180000,
});
await page.evaluate(() => {
  const ed = window.__studio.editor;
  ed.createScenario("blank");
  ed.setGuests(0);
  ed.setStyle("lighting", "evening");
  window.__camera("poc");
});
await page.waitForTimeout(1000);
await page.waitForFunction(() => !window.__rig?.tweening, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const b64 = await page.evaluate(() => window.__exportVenue(), null);
writeFileSync(process.argv[2], Buffer.from(b64, "base64"));
console.log("bytes", Buffer.from(b64, "base64").length);
await browser.close();
