#!/usr/bin/env node
// Screenshot the running app for visual QA (used by the visual-qa skill).
// Usage: node scripts/capture.mjs --out dir [--base http://localhost:4173] [--size 1440x900]
//        [--shot name=query/script ...]  e.g. --shot dollhouse= --shot plan="camera=plan"
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const out = opt("out", "test-results/capture");
const base = opt("base", "http://localhost:4173");
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const shots = args.flatMap((a, i) => (a === "--shot" ? [args[i + 1]] : []));
mkdirSync(out, { recursive: true });

const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));

for (const spec of shots.length ? shots : ["dollhouse="]) {
  const [name, js = ""] = spec.split("=");
  await page.goto(`${base}/?fresh`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__studio !== undefined, null, { timeout: 60000 });
  if (js) await page.evaluate(js);
  await page.waitForTimeout(Number(opt("wait", "6000")));
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log("saved", join(out, `${name}.png`));
}
await browser.close();
